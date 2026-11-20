import type { ConsentChoice, ConsentRequest, DockAdapter, DockAgentStatus, DockAppTab, DockChannel, DockErrorKind, DockKind, DockLegacy, DockOwnChat, DockProgramStatus, DockTerminal, PtyKind, StoredChoice, StoredChoiceState } from './dock/adapter';
import type { Dock } from './dock/dock';
import { dockIcon } from './dock/icons';
import { ApiError, apiBase, onApproval, request, terminalTicket } from './api';
import { ChatPane, glyph, type Glyph } from './features/chat-pane';
import { element, text } from './ui/dom';
import './styles/dock-tokens.css';

export const DOCK_KEY = 'formweb.dock';
export const DOCK_OLD_KEY = 'formweb_terminal';
export const DOCK_SIZES = { minHeight: 120, defaultHeight: 272, maxHeightShare: 0.7, keepHeight: 308, minWidth: 320, defaultWidth: 420, maxWidthShare: 0.4 };

type Fourth = 'antigravity';
type Kind = Exclude<PtyKind, 'agent'> | Fourth;
type Row = { id: string; title: string; kind: Kind; alive?: boolean };
type Session = { title: string; kind: Kind; status: string; alive: boolean };
type Approval = { id: string; kind: string; agent?: string; what?: string; offers?: string[]; always?: string; expires?: number | null };
type Program = { installed: boolean; version: string | null; install: string; signedIn: boolean | null; finding?: string; said?: string };
type Access = { choice: 'blocked' | 'ask' | 'allowed' | 'off'; sealBroken: boolean };

const KINDS: Kind[] = ['shell', 'claude', 'codex', 'cursor', 'antigravity'];
const STATUS: Record<Kind, string> = { shell: 'Shell in the FormWeb folder', claude: 'Claude Code with FormWeb tools', codex: 'Codex with FormWeb tools', cursor: 'Cursor agent with FormWeb tools', antigravity: 'Antigravity with FormWeb tools' };
const LAUNCH: { id: string; label: string; command: string }[] = [
  { id: 'shell', label: 'Shell', command: 'terminal.new' },
  { id: 'claude', label: 'Claude Code', command: 'claude.open' },
  { id: 'codex', label: 'Codex', command: 'terminal.codex' },
  { id: 'cursor', label: 'Cursor agent', command: 'terminal.cursor' },
  { id: 'doctor', label: 'formweb doctor', command: 'terminal.doctor' },
  { id: 'run', label: 'formweb run --list', command: 'terminal.run-list' },
];
const ASK_NOTE = 'FormWeb asks because "Ask me before an agent deletes, replaces the open project or changes retention" is ticked in Agent Connect.';
const ONCE_NOTE = 'Your answer covers this one call.';

const kindOf = (value: string): Kind => (KINDS.includes(value as Kind) ? value as Kind : 'shell');
const isChord = (event: KeyboardEvent): boolean => (event.ctrlKey || event.metaKey) && (event.code === 'KeyJ' || event.key === '`');

export const dockLegacy: DockLegacy = {
  keys: [DOCK_OLD_KEY],
  read: (store) => {
    const word = store.getItem(DOCK_OLD_KEY);
    return word === null ? null : { open: word === 'open', seen: true };
  },
};

export interface DockDeps {
  dock(): Dock<Fourth> | null;
  context(): string;
  notify(message: string, error?: boolean): void;
  chordLabel(): string;
  chatChord(): string;
  openSettings(): void;
  room(): number;
  changed(): void;
}

export interface FormwebDock {
  adapter: DockAdapter<Fourth>;
  launch(preset: string): Promise<void>;
  titleButtons(run: (id: string) => unknown): HTMLButtonElement[];
  syncButtons(): void;
}

export function formwebDock(deps: DockDeps): FormwebDock {
  const sessions = new Map<string, Session>();
  const watchers = new Set<() => void>();
  const titleButtons = new Map<string, HTMLButtonElement>();
  let builtin: Array<DockKind | Fourth> = ['chat', 'shell', 'claude', 'codex', 'cursor', 'antigravity'];
  let preset = '';

  const told = (): void => { for (const watcher of watchers) watcher(); };
  const say = (id: string, status: string, alive = true): void => {
    const session = sessions.get(id);
    if (!session || (session.status === status && session.alive === alive)) return;
    session.status = status;
    session.alive = alive;
    told();
  };
  const record = (row: Row): DockTerminal<Fourth> => {
    const kind = kindOf(row.kind);
    if (!sessions.has(row.id)) { sessions.set(row.id, { title: row.title, kind, status: STATUS[kind], alive: row.alive !== false }); told(); }
    return { id: row.id, title: row.title, alive: row.alive !== false, kind, tip: STATUS[kind] };
  };

  const socketUrl = (id: string, ticket: string, size: { cols: number; rows: number }): string => {
    const base = apiBase ? new URL(apiBase) : window.location;
    const query = new URLSearchParams({ cols: String(size.cols), rows: String(size.rows), session: id, ticket });
    try { const token = sessionStorage.getItem('formweb_token'); if (token) query.set('token', token); } catch { query.delete('token'); }
    return `${base.protocol === 'https:' ? 'wss:' : 'ws:'}//${base.host}/api/terminal?${query}`;
  };

  const channel = (id: string): DockChannel => {
    let data = (_chunk: string | Uint8Array): void => undefined;
    let exit = (): void => undefined;
    let lost = (): void => undefined;
    let socket: WebSocket | null = null;
    let retry = 0;
    let alive = true;
    let shut = false;
    let size = { cols: 100, rows: 24 };
    const send = (message: unknown): void => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
    const connect = async (): Promise<void> => {
      const ticket = await terminalTicket();
      if (shut) return;
      const made = new WebSocket(socketUrl(id, ticket, size));
      socket = made;
      made.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as { type: string; data?: string; replay?: boolean; code?: number | null; message?: string };
        if (message.type === 'ready') {
          if (message.replay) data('\x1bc');
          retry = 0;
          say(id, STATUS[sessions.get(id)?.kind ?? 'shell']);
          send({ type: 'resize', cols: size.cols, rows: size.rows });
        } else if (message.type === 'output' && message.data) data(message.data);
        else if (message.type === 'exit') {
          alive = false;
          say(id, `${sessions.get(id)?.title ?? 'Session'} exited${message.code == null ? '' : ` (${message.code})`}. Close this tab and start a new one.`, false);
          exit();
        } else if (message.type === 'error') say(id, message.message || 'Terminal error');
      });
      made.addEventListener('close', () => {
        if (socket !== made) return;
        socket = null;
        if (shut || !alive) return;
        if (retry < 5) {
          retry += 1;
          say(id, 'Reconnecting');
          window.setTimeout(() => void connect(), 400 * retry);
        } else lost();
      });
    };
    void connect();
    return {
      send: (chunk) => send({ type: 'input', data: chunk }),
      resize: (cols, rows) => { size = { cols, rows }; send({ type: 'resize', cols, rows }); },
      onData: (handler) => { data = handler; },
      onExit: (handler) => { exit = handler; },
      onClose: (handler) => { lost = handler; },
      close: () => { shut = true; socket?.close(); },
    };
  };

  const launch = async (id: string): Promise<void> => {
    const dock = deps.dock();
    if (!dock) return;
    if (id === 'claude') { await dock.claude(); return; }
    if (id === 'codex' || id === 'cursor' || id === 'antigravity') { await dock.program(id); return; }
    preset = id === 'shell' ? '' : id;
    if (!dock.isOpen()) dock.toggle(true, 'none');
    await dock.newTerminal();
    preset = '';
  };

  const sessionsTab: DockAppTab = {
    id: 'sessions',
    label: 'Sessions',
    icon: dockIcon('menu', 13),
    mount: (host) => {
      const root = element('div', 'fw-dock-sessions');
      const row = element('div', 'fw-dock-sessions-row');
      for (const item of LAUNCH) {
        const button = element('button', 'quiet', item.label);
        button.type = 'button';
        button.dataset.command = item.command;
        button.addEventListener('click', () => void launch(item.id));
        row.append(button);
      }
      const none = element('p', 'fw-dock-note', 'No sessions are running. Start one with a button above.');
      const list = element('ul', 'fw-dock-sessions-list');
      const rows = new Map<string, HTMLElement>();
      const paint = (): void => {
        for (const [id, item] of rows) if (!sessions.has(id)) { item.remove(); rows.delete(id); }
        for (const [id, session] of sessions) {
          let item = rows.get(id);
          if (!item) {
            item = element('li');
            item.append(element('span', '', session.title), element('span'));
            list.append(item);
            rows.set(id, item);
          }
          if (item.dataset.alive !== String(session.alive)) item.dataset.alive = String(session.alive);
          text(item.lastElementChild as HTMLElement, session.status);
        }
        if (none.hidden !== sessions.size > 0) none.hidden = sessions.size > 0;
      };
      root.append(row, none, list);
      host.append(root);
      paint();
      watchers.add(paint);
      return () => { watchers.delete(paint); root.remove(); };
    },
  };

  let add: (request: ConsentRequest) => void = () => undefined;
  let withdraw: (id: string) => void = () => undefined;
  const shown = new Set<string>();
  const pending = async (): Promise<void> => {
    let rows: Approval[];
    try { rows = (await request<{ approvals: Approval[] }>('/api/approvals?status=pending')).approvals; } catch { return; }
    for (const row of rows) {
      if (row.kind !== 'agent.tool' || shown.has(row.id)) continue;
      const offers = (row.offers ?? []).filter((x): x is ConsentChoice => x === 'deny' || x === 'once');
      if (!offers.length) continue;
      shown.add(row.id);
      add({
        id: row.id, agent: row.agent ?? '', what: row.what ?? 'run a tool', offers, always: row.always === 'agent' ? 'agent' : 'all',
        notes: [ASK_NOTE, ONCE_NOTE], ...(typeof row.expires === 'number' ? { expires: row.expires } : {}),
      });
    }
  };

  const program = (value: Program | undefined): DockProgramStatus | undefined => (value ? { installed: value.installed, version: value.version, install: value.install, signedIn: value.signedIn, ...(value.finding && value.finding !== 'runs' && value.said ? { note: value.said } : {}) } : undefined);

  const adapter: DockAdapter<Fourth> = {
    words: {
      app: 'FormWeb', noun: 'site', example: 'add a pricing section with three plans', start: './formweb boot',
      lead: "Ask Claude to build or change this site. It works through FormWeb's own tools, and every change appears in the editor.",
    },
    strings: {
      get chatAbout(): string { return `Chat with Claude about your site (${deps.chatChord()})`; },
      endedTab: 'This session has ended. Close this tab and start a new one.',
      empty: 'No sessions are running. Use + for a shell, or the Claude Code and Chat buttons.',
      tourReadyBody: 'Claude Code is installed. The robot button here opens it when you want it to take on a bigger job; the first time, it may ask you to sign in. Codex, Cursor and Antigravity each get a button of their own here when they are on this computer.',
      tourAskBody: 'FormWeb refuses other AI programs until you turn Agents on in Agent Connect. With Agents on, and "Ask me before an agent deletes, replaces the open project or changes retention" ticked there, FormWeb asks you in a box in the middle of the window before such a call runs. Choose Deny or Allow once.',
      consentTitle: 'Allow {agent} to make this change in {app}?',
      consentTitleUnnamed: 'Allow an agent to make this change in {app}?',
    },
    placement: {
      mode: 'own',
      storage: { key: DOCK_KEY, legacy: dockLegacy },
      sizes: { ...DOCK_SIZES, maxWidth: () => deps.room() },
      canDockRight: () => deps.room() >= DOCK_SIZES.minWidth,
    },
    passKey: isChord,
    isDockChord: () => false,
    chordLabel: () => deps.chordLabel(),
    tabs: () => ({ builtin, own: builtin.length ? [sessionsTab] : [] }),
    classes: { iconButton: 'fw-dock-ibtn', button: 'fw-dock-btn', primaryButton: 'primary', input: 'fw-dock-input', select: '', note: 'fw-dock-note' },
    t: (_key, english) => english,
    onTheme: (handler) => { document.addEventListener('nm:ui-settings-changed', handler); },
    keyHeaders: () => ({}),
    errors: {
      message: (err) => (err instanceof ApiError ? err.message : null),
      kind: (err): DockErrorKind | null => {
        if (err instanceof TypeError) return 'unreachable';
        if (!(err instanceof ApiError)) return null;
        if (err.code === 'notInstalled' || err.status === 424) return 'notInstalled';
        if (err.status === 502 || err.status === 503 || err.status === 504) return 'unreachable';
        if (err.status === 403) return 'refused';
        if (err.status === 429) return 'busy';
        return (err.status === 404 || err.status === 405) && /^(Not Found|Method Not Allowed)$/i.test(err.message) ? 'oldEngine' : null;
      },
    },
    terminal: {
      list: async () => (await request<{ sessions: Row[] }>('/api/terminal/sessions')).sessions.map(record),
      open: async (kind, o) => {
        const chosen = kind === 'shell' ? preset : '';
        preset = '';
        const prompt = o.prompt ? `${o.prompt} (${deps.context()})` : undefined;
        return record(await request<Row>('/api/terminal/open', { kind, cols: o.cols, rows: o.rows, ...(prompt ? { prompt } : {}), ...(o.resume ? { resume: o.resume } : {}), ...(chosen ? { preset: chosen } : {}) }));
      },
      close: async (id) => {
        if (sessions.delete(id)) told();
        await request('/api/terminal/close', { id });
      },
      channel,
      scrollback: 5000,
    },
    agentStatus: async (): Promise<DockAgentStatus<Fourth> | null> => {
      const status = await request<{ claude?: Program; codex?: Program; cursor?: Program; antigravity?: Program; tabs?: string[] }>('/api/agents/status');
      if (Array.isArray(status.tabs)) {
        const allowed = builtin.filter((kind) => status.tabs?.includes(kind));
        if (allowed.length !== builtin.length) { builtin = allowed; deps.dock()?.refresh(); }
      }
      const out: DockAgentStatus<Fourth> = {};
      const claude = program(status.claude);
      const codex = program(status.codex);
      const cursor = program(status.cursor);
      const antigravity = program(status.antigravity);
      if (claude) out.claude = claude;
      if (codex) out.codex = codex;
      if (cursor) out.cursor = cursor;
      if (antigravity) out.antigravity = antigravity;
      return out;
    },
    chat: {
      pane: (host): DockOwnChat => {
        const chat = new ChatPane({ context: deps.context, notify: deps.notify, continueInClaude: (session) => void deps.dock()?.claude(undefined, session) });
        host.append(chat.element);
        return { send: (message) => chat.send(message), shown: () => void chat.show(), busy: () => chat.busy() };
      },
      ask: 'line',
    },
    consent: {
      subscribe: (onAdd, onWithdraw) => {
        add = onAdd;
        withdraw = onWithdraw;
        onApproval((event) => {
          if (event.type === 'withdrawn' && event.id) { shown.delete(event.id); withdraw(event.id); deps.changed(); } else void pending();
        });
      },
      answer: async (id, choice) => {
        if (choice === 'always') throw new Error('FormWeb has no standing answer for one call.');
        try { await request(`/api/approvals/${encodeURIComponent(id)}`, { decision: choice === 'deny' ? 'deny' : 'approve' }); } finally { deps.changed(); }
      },
    },
    storedChoice: {
      get: async (): Promise<StoredChoiceState> => {
        const access = await request<Access>('/api/agents/access');
        return { value: access.choice === 'off' ? 'blocked' : access.choice, changedOutside: access.sealBroken === true };
      },
      set: async (value: StoredChoice) => {
        try { await request('/api/agents/access', { choice: value }); } finally { deps.changed(); }
      },
    },
    openSettings: deps.openSettings,
  };

  return {
    adapter,
    launch,
    titleButtons: (run) => {
      const specs: [string, Glyph, string][] = [['terminal.toggle', 'terminal', 'Terminal (Ctrl/Cmd+J)'], ['claude.open', 'claude', 'Claude Code (Shift+Ctrl/Cmd+J)'], ['chat.open', 'chat', 'Chat with Claude (Alt+Ctrl/Cmd+J)']];
      return specs.map(([id, symbol, label]) => {
        const node = element('button', 'fw-tt-btn');
        node.type = 'button';
        node.title = label;
        node.setAttribute('aria-label', label);
        node.dataset.command = id;
        node.append(glyph(symbol));
        node.addEventListener('click', () => run(id));
        titleButtons.set(id, node);
        return node;
      });
    },
    syncButtons: () => {
      const dock = deps.dock();
      if (!dock) return;
      for (const [id, node] of titleButtons) {
        const on = id === 'terminal.toggle' ? dock.isOpen() : dock.isShowing(id === 'claude.open' ? 'claude' : 'chat');
        if (node.classList.contains('is-on') !== on) node.classList.toggle('is-on', on);
        if (node.getAttribute('aria-pressed') !== String(on)) node.setAttribute('aria-pressed', String(on));
      }
    },
  };
}
