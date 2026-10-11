import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import '../styles/terminal.css';
import { apiBase } from '../api';
import { element, text } from '../ui/dom';
import { icon } from '../ui/icons';

/**
 * Bottom terminal dock. The dock nodes always exist (no insert/remove on toggle); state lives in
 * data-state (open | collapsed). The xterm instance is created on first open and the backend
 * session survives collapse, socket drops and reconnects (the server replays recent output).
 */
export type TerminalState = 'open' | 'collapsed';
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
  private title = element('span', 'fw-term-title', 'Terminal');
  private stateLabel = element('span', 'fw-term-status', 'Not started');
  private preset = element('select', 'fw-term-preset');
  private body = element('div', 'fw-term-body');
  private note = element('p', 'fw-term-note', '');
  private screen = element('div', 'fw-term-screen');
  private toggleButton: HTMLButtonElement;
  private term?: Terminal;
  private fit?: FitAddon;
  private socket?: WebSocket;
  private session = '';
  private retry = 0;
  private allowed = false;
  state: TerminalState = 'collapsed';

  constructor(private onChange: (state: TerminalState) => void) {
    this.element.dataset.state = 'collapsed';
    this.element.setAttribute('aria-label', 'Terminal');
    for (const item of PRESETS) { const option = element('option', '', item.label); option.value = item.id; this.preset.append(option); }
    this.preset.title = 'Start a new session running this command';
    this.preset.setAttribute('aria-label', this.preset.title);
    this.preset.dataset.field = 'terminal.preset';
    const restart = this.iconButton('New session', 'plus', () => this.restart(), 'terminal.new');
    this.toggleButton = this.iconButton('Collapse terminal', 'chevron', () => this.toggle(), 'view.terminal');
    const spacer = element('span', 'fw-term-spacer');
    this.head.append(icon('code'), this.title, this.stateLabel, spacer, this.preset, restart, this.toggleButton);
    this.head.addEventListener('dblclick', event => { if ((event.target as HTMLElement).closest('button,select')) return; this.toggle(); });
    this.body.append(this.note, this.screen);
    this.note.hidden = true;
    this.element.append(this.head, this.body);
    new ResizeObserver(() => this.refit()).observe(this.screen);
  }

  private iconButton(label: string, symbol: Parameters<typeof icon>[0], action: () => void, command: string): HTMLButtonElement {
    const node = element('button', 'fw-term-btn');
    node.type = 'button';
    node.title = label;
    node.setAttribute('aria-label', label);
    node.dataset.command = command;
    node.append(icon(symbol));
    node.addEventListener('click', action);
    return node;
  }

  /** Agents on/off gates the terminal, as the backend does. */
  setAllowed(allowed: boolean): void {
    this.allowed = allowed;
    if (!allowed) {
      this.disconnect(true);
      this.showNote('Turn Agents on (Agent Connect) to use the terminal. It runs in the FormWeb folder with your account.');
    } else if (this.state === 'open') this.connect();
  }

  set(next: TerminalState): void {
    if (this.state === next) return;
    this.state = next;
    this.element.dataset.state = next;
    this.toggleButton.title = next === 'open' ? 'Collapse terminal' : 'Expand terminal';
    this.toggleButton.setAttribute('aria-label', this.toggleButton.title);
    this.onChange(next);
    if (next === 'open') {
      if (this.allowed) this.connect();
      else this.showNote('Turn Agents on (Agent Connect) to use the terminal. It runs in the FormWeb folder with your account.');
      requestAnimationFrame(() => { this.refit(); this.term?.focus(); });
    }
  }

  toggle(): void { this.set(this.state === 'open' ? 'collapsed' : 'open'); }

  /** Type a command line into the running shell (used by the Agent Connect client cards). */
  launch(presetId: string): void {
    this.preset.value = presetId;
    this.set('open');
    this.restart();
  }

  private showNote(message: string): void {
    text(this.note, message);
    this.note.hidden = !message;
    this.screen.hidden = !!message;
  }

  private ensureTerminal(): Terminal {
    if (this.term) return this.term;
    const css = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
    this.term = new Terminal({
      cursorBlink: true,
      fontFamily: read('--font-mono', 'JetBrains Mono, monospace'),
      fontSize: 12,
      scrollback: 5000,
      theme: { background: read('--bg-primary', '#111111'), foreground: read('--text-primary', '#edf0f5'), cursor: read('--accent-color', '#f97316'), selectionBackground: read('--accent-soft', '#f9731640') }
    });
    this.fit = new FitAddon();
    this.term.loadAddon(this.fit);
    this.term.open(this.screen);
    this.term.onData(data => this.send({ type: 'input', data }));
    this.term.onResize(({ cols, rows }) => this.send({ type: 'resize', cols, rows }));
    return this.term;
  }

  private refit(): void {
    if (!this.term || this.state !== 'open' || this.screen.hidden) return;
    try { this.fit?.fit(); } catch {}
  }

  private url(preset: string): string {
    const base = apiBase ? new URL(apiBase) : window.location;
    const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const query = new URLSearchParams({ cols: String(this.term?.cols || 100), rows: String(this.term?.rows || 20) });
    if (this.session) query.set('session', this.session);
    if (preset && preset !== 'shell') query.set('preset', preset);
    try { const token = sessionStorage.getItem('formweb_token'); if (token) query.set('token', token); } catch {}
    return `${scheme}//${base.host}/api/terminal?${query}`;
  }

  private connect(preset = ''): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    this.showNote('');
    const term = this.ensureTerminal();
    this.refit();
    text(this.stateLabel, 'Connecting');
    const socket = new WebSocket(this.url(preset));
    this.socket = socket;
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)) as { type: string; data?: string; session?: string; replay?: boolean; code?: number | null; message?: string };
      if (message.type === 'ready') {
        if (message.session !== this.session && !message.replay) term.reset();
        this.session = message.session || '';
        this.retry = 0;
        text(this.stateLabel, message.replay ? 'Reconnected' : 'Running in the FormWeb folder');
        this.element.dataset.session = this.session;
      } else if (message.type === 'output' && message.data) term.write(message.data);
      else if (message.type === 'exit') { this.session = ''; text(this.stateLabel, `Exited${message.code == null ? '' : ' (' + message.code + ')'}. New session starts a fresh shell.`); }
      else if (message.type === 'error') { text(this.stateLabel, message.message || 'Terminal error'); }
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      if (this.state === 'open' && this.allowed && this.session && this.retry < 5) {
        this.retry += 1;
        text(this.stateLabel, 'Reconnecting');
        window.setTimeout(() => this.connect(), 400 * this.retry);
      }
    });
  }

  private disconnect(endSession: boolean): void {
    const socket = this.socket;
    this.socket = undefined;
    if (socket && socket.readyState === WebSocket.OPEN && endSession) socket.send(JSON.stringify({ type: 'close' }));
    socket?.close();
    if (endSession) { this.session = ''; text(this.stateLabel, 'Not started'); }
  }

  private restart(): void {
    if (!this.allowed) { this.set('open'); return; }
    this.disconnect(true);
    this.term?.reset();
    this.connect(this.preset.value);
  }

  private send(message: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}
