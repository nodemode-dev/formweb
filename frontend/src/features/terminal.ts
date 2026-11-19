import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import '../styles/terminal.css';
import { apiBase, request, terminalTicket } from '../api';
import { element, text } from '../ui/dom';
import { icon } from '../ui/icons';
import { ChatPane, glyph, type Glyph } from './chat-pane';

/**
 * Bottom agent dock. The dock nodes always exist (no insert/remove on toggle); state lives in
 * data-state (open | collapsed). Each backend session (a shell or Claude Code) is a tab with its own xterm;
 * sessions survive collapse, socket drops, reconnects and page reloads (the list endpoint re-mounts them and
 * the server replays recent output). The Chat tab is a headless Claude conversation (chat-pane.ts).
 * Keys: Mod+J toggles the dock, Shift+Mod+J opens Claude Code, Alt+Mod+J opens Chat.
 */
export type TerminalState = 'open' | 'collapsed';
type Kind = 'shell' | 'claude' | 'chat';
type Tab = { id: string; kind: Kind; label: string; status: string; alive: boolean; node: HTMLElement; pane: HTMLElement; term?: Terminal; fit?: FitAddon; socket?: WebSocket; retry: number };
type Opened = { id: string; title: string; kind: Kind; reused: boolean };
const CHAT = 'chat';
const STATUS: Record<Kind, string> = { shell: 'Shell in the FormWeb folder', claude: 'Claude Code with FormWeb tools', chat: 'Claude chat' };
const TAB_GLYPH: Record<Kind, Glyph> = { shell: 'terminal', claude: 'claude', chat: 'chat' };
const titleButtons = new Map<string, HTMLButtonElement>();
const isChord = (event: KeyboardEvent): boolean => (event.ctrlKey || event.metaKey) && (event.code === 'KeyJ' || event.key === '`');

/** Title-bar buttons for the dock; each runs the registered command with the same id. */
export function dockTitleButtons(run: (id: string) => unknown): HTMLButtonElement[] {
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
}
const PRESETS = [
  { id: 'shell', label: 'Shell' },
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'cursor', label: 'Cursor agent' },
  { id: 'doctor', label: 'formweb doctor' },
  { id: 'run', label: 'formweb run --list' }
];

export class TerminalDock {
  readonly element = element('section', 'fw-term');
  private head = element('div', 'fw-term-head');
  private tabs = element('div', 'fw-term-tabs');
  private stateLabel = element('span', 'fw-term-status', 'No session');
  private preset = element('select', 'fw-term-preset');
  private body = element('div', 'fw-term-body');
  private note = element('p', 'fw-term-note', '');
  private screen = element('div', 'fw-term-stack');
  private toggleButton: HTMLButtonElement;
  private sessions = new Map<string, Tab>();
  private active = '';
  private chatPane?: ChatPane;
  private restoring: Promise<void> | null = null;
  state: TerminalState = 'collapsed';

  constructor(private onChange: (state: TerminalState) => void, private context: () => string = () => '') {
    this.element.dataset.state = 'collapsed';
    this.element.setAttribute('aria-label', 'Terminal');
    this.tabs.setAttribute('role', 'tablist');
    for (const item of PRESETS) { const option = element('option', '', item.label); option.value = item.id; this.preset.append(option); }
    this.preset.title = 'Start a new session running this command';
    this.preset.setAttribute('aria-label', this.preset.title);
    this.preset.dataset.field = 'terminal.preset';
    const create = this.iconButton('New session (runs the command chosen on the left)', icon('plus'), () => this.launch(this.preset.value), 'terminal.new');
    const claude = this.iconButton('Claude Code (Shift+Ctrl/Cmd+J)', glyph('claude'), () => void this.guard(() => this.claude()), 'claude.open');
    const chat = this.iconButton('Chat with Claude (Alt+Ctrl/Cmd+J)', glyph('chat'), () => void this.guard(() => this.chat()), 'chat.open');
    this.toggleButton = this.iconButton('Collapse terminal', icon('chevron'), () => this.toggle(), 'view.terminal');
    const spacer = element('span', 'fw-term-spacer');
    this.head.append(icon('code'), this.tabs, spacer, this.stateLabel, this.preset, create, claude, chat, this.toggleButton);
    void document.fonts.load('12px "JetBrains Mono"').catch(() => undefined);
    this.head.addEventListener('dblclick', event => { if ((event.target as HTMLElement).closest('button,select,[role="tab"]')) return; this.toggle(); });
    this.body.append(this.note, this.screen);
    this.note.hidden = true;
    this.element.append(this.head, this.body);
    this.body.addEventListener('keydown', event => { if (!isChord(event)) event.stopPropagation(); });
    new ResizeObserver(() => this.refit()).observe(this.screen);
  }

  private iconButton(label: string, symbol: HTMLElement, action: () => void, command: string): HTMLButtonElement {
    const node = element('button', 'fw-term-btn');
    node.type = 'button';
    node.title = label;
    node.setAttribute('aria-label', label);
    node.dataset.command = command;
    node.append(symbol);
    node.addEventListener('click', action);
    return node;
  }

  /** The Agents switch only gates outside MCP clients now; sessions opened from this dock never need it. */
  setAllowed(allowed: boolean): void {
    this.element.dataset.agents = allowed ? 'on' : 'off';
  }

  set(next: TerminalState, auto = true): void {
    if (this.state === next) return;
    this.state = next;
    this.element.dataset.state = next;
    this.toggleButton.title = next === 'open' ? 'Collapse terminal' : 'Expand terminal';
    this.toggleButton.setAttribute('aria-label', this.toggleButton.title);
    this.onChange(next);
    this.syncButtons();
    if (next === 'open') {
      if (auto) void this.guard(() => this.ensure());
      requestAnimationFrame(() => { this.refit(); this.focus(); });
    }
  }

  toggle(): void { this.set(this.state === 'open' ? 'collapsed' : 'open'); }

  /** Start a shell (optionally typing a preset command) or Claude Code; used by the dock and the Agent Connect cards. */
  launch(presetId: string): void {
    void this.guard(() => (presetId === 'claude' ? this.claude() : this.open('shell', { preset: presetId === 'shell' ? undefined : presetId })));
  }

  async claude(prompt?: string, resume?: string): Promise<void> {
    await this.open('claude', { prompt, resume });
  }

  async chat(): Promise<void> {
    this.set('open', false);
    await this.restore().catch(() => undefined);
    let tab = this.sessions.get(CHAT);
    if (!tab) {
      const pane = element('div', 'fw-term-pane');
      this.chatPane = new ChatPane({
        context: this.context,
        notify: message => text(this.stateLabel, message),
        continueInClaude: session => void this.guard(() => this.claude(undefined, session))
      });
      pane.append(this.chatPane.element);
      tab = this.addTab(CHAT, 'chat', 'Chat', pane);
    }
    this.select(CHAT);
  }

  private async open(kind: 'shell' | 'claude', options: { prompt?: string; resume?: string; preset?: string }): Promise<void> {
    this.set('open', false);
    await this.restore();
    const size = this.sessions.get(this.active)?.fit?.proposeDimensions();
    const made = await request<Opened>('/api/terminal/open', { kind, ...options, cols: size?.cols || 100, rows: size?.rows || 24 });
    this.mount(made.id, made.title, made.kind);
    this.select(made.id);
  }

  private async ensure(): Promise<void> {
    await this.restore();
    if (!this.sessions.size) await this.open('shell', {});
    else if (!this.sessions.has(this.active)) this.select(this.sessions.keys().next().value as string);
  }

  /** Re-mounts the sessions the server still runs, so tabs and the status line are right after a reload even while the dock is collapsed. */
  async remount(): Promise<void> {
    try {
      await this.restore();
      const first = this.sessions.keys().next().value as string | undefined;
      if (first && !this.sessions.has(this.active)) this.select(first, this.state === 'open');
    } catch {}
  }

  private restore(): Promise<void> {
    if (!this.restoring) {
      this.restoring = request<{ sessions: { id: string; title: string; kind: Kind }[] }>('/api/terminal/sessions').then(listed => {
        for (const item of listed.sessions) this.mount(item.id, item.title, item.kind);
      }, error => {
        this.restoring = null;
        throw error;
      });
    }
    return this.restoring;
  }

  private async guard(action: () => Promise<unknown>): Promise<void> {
    try { await action(); } catch (error) { this.showNote(error instanceof Error ? error.message : String(error)); }
  }

  private focus(): void {
    const tab = this.sessions.get(this.active);
    if (tab?.kind === 'chat') this.chatPane?.focus();
    else tab?.term?.focus();
  }

  private syncButtons(): void {
    const kind = this.sessions.get(this.active)?.kind;
    const open = this.state === 'open';
    for (const [id, node] of titleButtons) {
      const on = id === 'terminal.toggle' ? open : open && kind === (id === 'claude.open' ? 'claude' : 'chat');
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-pressed', String(on));
    }
  }

  private showNote(message: string): void {
    text(this.note, message);
    this.note.hidden = !message;
    this.screen.hidden = !!message;
  }

  private addTab(id: string, kind: Kind, label: string, pane: HTMLElement): Tab {
    const node = element('div', 'fw-term-tab');
    node.setAttribute('role', 'tab');
    node.tabIndex = 0;
    node.dataset.kind = kind;
    node.dataset.alive = 'true';
    const close = element('button', 'fw-term-tab-close');
    close.type = 'button';
    close.title = kind === 'chat' ? 'Hide chat' : 'Close session';
    close.setAttribute('aria-label', close.title);
    close.append(icon('close'));
    node.append(glyph(TAB_GLYPH[kind]), element('span', 'fw-term-tab-label', label), close);
    node.addEventListener('click', event => { if (!close.contains(event.target as Node)) this.select(id); });
    node.addEventListener('keydown', event => { if (event.target === node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); this.select(id); } });
    close.addEventListener('click', () => this.closeTab(id));
    pane.hidden = true;
    this.screen.append(pane);
    this.tabs.append(node);
    const tab: Tab = { id, kind, label, status: STATUS[kind], alive: true, node, pane, retry: 0 };
    this.sessions.set(id, tab);
    return tab;
  }

  private mount(id: string, title: string, kind: Kind): Tab {
    const known = this.sessions.get(id);
    if (known) return known;
    const css = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
    const tab = this.addTab(id, kind, title, element('div', 'fw-term-pane'));
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: read('--font-mono', 'JetBrains Mono, monospace'),
      fontSize: 12,
      scrollback: 5000,
      theme: { background: read('--bg-primary', '#111111'), foreground: read('--text-primary', '#edf0f5'), cursor: read('--accent-color', '#f97316'), selectionBackground: read('--accent-soft', '#f9731640') }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.attachCustomKeyEventHandler(event => !isChord(event));
    term.open(tab.pane);
    term.onData(data => this.send(tab, { type: 'input', data }));
    term.onResize(({ cols, rows }) => this.send(tab, { type: 'resize', cols, rows }));
    tab.term = term;
    tab.fit = fit;
    this.connect(tab);
    return tab;
  }

  private select(id: string, focus = true): void {
    const chosen = this.sessions.get(id);
    if (!chosen) return;
    this.active = id;
    this.showNote('');
    for (const tab of this.sessions.values()) {
      const on = tab === chosen;
      tab.pane.hidden = !on;
      tab.node.setAttribute('aria-selected', String(on));
    }
    text(this.stateLabel, chosen.status);
    this.syncButtons();
    if (chosen.kind === 'chat') void this.chatPane?.show();
    requestAnimationFrame(() => { this.refit(); if (focus) this.focus(); });
  }

  private closeTab(id: string): void {
    const tab = this.sessions.get(id);
    if (!tab) return;
    if (tab.kind === 'chat') this.chatPane = undefined;
    else {
      tab.alive = false;
      if (tab.socket?.readyState === WebSocket.OPEN) tab.socket.send(JSON.stringify({ type: 'close' }));
      tab.socket?.close();
      tab.term?.dispose();
    }
    tab.node.remove();
    tab.pane.remove();
    this.sessions.delete(id);
    if (this.active === id) {
      const next = Array.from(this.sessions.keys()).pop();
      this.active = '';
      if (next) this.select(next);
      else { text(this.stateLabel, 'No session'); this.showNote('No sessions are running. Use + for a shell, or the Claude Code and Chat buttons.'); this.syncButtons(); }
    }
  }

  private refit(): void {
    const tab = this.sessions.get(this.active);
    if (!tab?.term || this.state !== 'open' || this.screen.hidden || tab.pane.hidden) return;
    try { tab.fit?.fit(); } catch {}
  }

  private url(tab: Tab, ticket: string): string {
    const base = apiBase ? new URL(apiBase) : window.location;
    const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const query = new URLSearchParams({ cols: String(tab.term?.cols || 100), rows: String(tab.term?.rows || 24), session: tab.id, ticket });
    try { const token = sessionStorage.getItem('formweb_token'); if (token) query.set('token', token); } catch {}
    return `${scheme}//${base.host}/api/terminal?${query}`;
  }

  private status(tab: Tab, message: string): void {
    tab.status = message;
    if (this.active === tab.id) text(this.stateLabel, message);
  }

  private async connect(tab: Tab): Promise<void> {
    const term = tab.term;
    if (!term || (tab.socket && tab.socket.readyState <= WebSocket.OPEN)) return;
    const ticket = await terminalTicket();
    if (tab.socket && tab.socket.readyState <= WebSocket.OPEN) return;
    const socket = new WebSocket(this.url(tab, ticket));
    tab.socket = socket;
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)) as { type: string; data?: string; replay?: boolean; code?: number | null; message?: string };
      if (message.type === 'ready') {
        if (message.replay) term.reset();
        tab.retry = 0;
        this.status(tab, STATUS[tab.kind]);
        if (term.cols && term.rows) this.send(tab, { type: 'resize', cols: term.cols, rows: term.rows });
      } else if (message.type === 'output' && message.data) term.write(message.data);
      else if (message.type === 'exit') {
        tab.alive = false;
        tab.node.dataset.alive = 'false';
        this.status(tab, `${tab.label} exited${message.code == null ? '' : ' (' + message.code + ')'}. Close this tab and start a new one.`);
      } else if (message.type === 'error') this.status(tab, message.message || 'Terminal error');
    });
    socket.addEventListener('close', () => {
      if (tab.socket !== socket) return;
      tab.socket = undefined;
      if (tab.alive && this.sessions.get(tab.id) === tab && tab.retry < 5) {
        tab.retry += 1;
        this.status(tab, 'Reconnecting');
        window.setTimeout(() => this.connect(tab), 400 * tab.retry);
      }
    });
  }

  private send(tab: Tab, message: unknown): void {
    if (tab.socket?.readyState === WebSocket.OPEN) tab.socket.send(JSON.stringify(message));
  }
}
