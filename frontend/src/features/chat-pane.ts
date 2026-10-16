import { request, stream } from '../api';
import { element, text } from '../ui/dom';
import '../styles/chat.css';

/**
 * Chat tab of the agent dock: headless Claude Code (`claude -p`, stream-json) over Server-Sent Events.
 * The conversation continues across messages through the Claude session id the server keeps, and can be
 * handed to the live Claude Code terminal. Streaming updates the open message in place: markdown is parsed
 * to blocks and only the block that changed is touched.
 */
export type Glyph = 'claude' | 'chat' | 'terminal' | 'send' | 'stop';
const GLYPHS: Record<Glyph, string> = {
  claude: '<path d="M12 3v5m0 8v5M3 12h5m8 0h5M6 6l3 3m6 6 3 3m0-12-3 3m-6 6-3 3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m5 0h5"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7-7-1Z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>'
};
export function glyph(name: Glyph): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'icon';
  wrapper.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[name]}</svg>`;
  return wrapper;
}

type Block = { type: 'p' | 'code' | 'ul' | 'ol' | 'h'; text: string };
type Tool = { id: string; name: string; input: string; done: boolean; error?: boolean };
type Turn = { user: string; text: string; tools: Tool[] };
type Hooks = { context: () => string; continueInClaude: (session: string) => void; notify: (message: string, error?: boolean) => void };

function blocks(raw: string): Block[] {
  const out: Block[] = [];
  const lines = raw.split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.trimStart().startsWith('```')) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trimStart().startsWith('```')) body.push(lines[index++]);
      index += 1;
      out.push({ type: 'code', text: body.join('\n') });
    } else if (/^#{1,4}\s/.test(line)) {
      out.push({ type: 'h', text: line.replace(/^#{1,4}\s+/, '') });
      index += 1;
    } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const type = /^\s*\d+\./.test(line) ? 'ol' : 'ul';
      const items: string[] = [];
      while (index < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[index])) items.push(lines[index++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      out.push({ type, text: items.join('\n') });
    } else {
      const body: string[] = [];
      while (index < lines.length && lines[index].trim() && !lines[index].trimStart().startsWith('```') && !/^#{1,4}\s/.test(lines[index]) && !/^\s*([-*]|\d+\.)\s/.test(lines[index])) body.push(lines[index++]);
      out.push({ type: 'p', text: body.join(' ') });
    }
  }
  return out;
}

function inline(parent: HTMLElement, value: string): void {
  parent.textContent = '';
  for (const part of value.split(/(`[^`]+`|\*\*[^*]+\*\*)/)) {
    if (!part) continue;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) parent.append(element('code', '', part.slice(1, -1)));
    else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) parent.append(element('strong', '', part.slice(2, -2)));
    else parent.append(document.createTextNode(part));
  }
}

const TAGS: Record<Block['type'], keyof HTMLElementTagNameMap> = { p: 'p', code: 'pre', ul: 'ul', ol: 'ol', h: 'h4' };

function fill(node: HTMLElement, block: Block): void {
  if (block.type === 'code') { node.textContent = block.text; return; }
  if (block.type === 'ul' || block.type === 'ol') {
    const items = block.text.split('\n');
    while (node.children.length > items.length) node.lastElementChild?.remove();
    items.forEach((item, at) => {
      const row = (node.children[at] as HTMLElement | undefined) ?? node.appendChild(element('li'));
      if (row.dataset.sig !== item) { inline(row, item); row.dataset.sig = item; }
    });
    return;
  }
  inline(node, block.text);
}

export function renderMarkdown(container: HTMLElement, raw: string): void {
  const list = blocks(raw);
  list.forEach((block, at) => {
    const sig = block.type + '\u0000' + block.text;
    let node = container.children[at] as HTMLElement | undefined;
    if (node && node.dataset.sig === sig) return;
    if (!node || node.tagName.toLowerCase() !== TAGS[block.type]) {
      const next = element(TAGS[block.type]);
      if (node) node.replaceWith(next); else container.append(next);
      node = next;
    }
    fill(node, block);
    node.dataset.sig = sig;
  });
  while (container.children.length > list.length) container.lastElementChild?.remove();
}

export class ChatPane {
  readonly element = element('div', 'fw-chat');
  private log = element('div', 'fw-chat-log');
  private empty = element('p', 'fw-chat-empty', 'Ask Claude to build or change this site. It works through FormWeb\'s own tools, and every change appears in the editor.');
  private input = element('textarea', 'fw-chat-input');
  private send = element('button', 'fw-chat-send');
  private fresh = element('button', 'fw-chat-quiet', 'New chat');
  private handoff = element('button', 'fw-chat-quiet', 'Continue in Claude Code');
  private note = element('span', 'fw-chat-note');
  private sessionId = '';
  private running = false;
  private restored = false;
  private abort?: AbortController;
  private segment?: { node: HTMLElement; raw: string };
  private flow?: HTMLElement;
  private tools = new Map<string, HTMLElement>();

  constructor(private hooks: Hooks) {
    this.log.setAttribute('role', 'log');
    this.log.setAttribute('aria-live', 'polite');
    this.input.rows = 2;
    this.input.placeholder = 'Message Claude. Enter sends, Shift+Enter adds a line.';
    this.input.setAttribute('aria-label', 'Message Claude');
    this.input.dataset.field = 'chat.input';
    this.send.type = 'button';
    this.send.dataset.command = 'chat.send';
    this.send.append(glyph('send'));
    this.fresh.type = 'button';
    this.fresh.dataset.command = 'chat.reset';
    this.handoff.type = 'button';
    this.handoff.dataset.command = 'chat.handoff';
    this.handoff.title = 'Open this conversation in the live Claude Code terminal';
    this.fresh.title = 'Forget this conversation and start a new one';
    this.setRunning(false);
    const bar = element('div', 'fw-chat-bar');
    bar.append(this.fresh, this.handoff, this.note);
    const composer = element('div', 'fw-chat-composer');
    composer.append(this.input, this.send);
    this.element.append(this.log, bar, composer);
    this.log.append(this.empty);
    this.send.addEventListener('click', () => (this.running ? void this.stop() : void this.submit()));
    this.input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!this.running) void this.submit(); }
    });
    this.fresh.addEventListener('click', () => void this.reset());
    this.handoff.addEventListener('click', () => { if (this.sessionId) this.hooks.continueInClaude(this.sessionId); });
  }

  focus(): void { this.input.focus(); }

  async show(): Promise<void> {
    this.focus();
    if (this.restored) return;
    this.restored = true;
    try {
      const state = await request<{ session: string; running: boolean; turns: Turn[] }>('/api/chat/state');
      if (this.log.querySelector('.fw-chat-msg')) return;
      this.sessionId = state.session;
      for (const turn of state.turns) this.restore(turn);
      this.syncHandoff();
      if (state.running) text(this.note, 'A reply from an earlier view is still running.');
    } catch (error) {
      this.restored = false;
      text(this.note, error instanceof Error ? error.message : String(error));
    }
  }

  private restore(turn: Turn): void {
    this.empty.hidden = true;
    this.add('user').append(element('p', '', turn.user));
    const flow = this.add('assistant');
    for (const tool of turn.tools) this.toolRow(flow, tool);
    if (turn.text) renderMarkdown(flow.appendChild(element('div', 'fw-chat-text')), turn.text);
  }

  private add(role: 'user' | 'assistant'): HTMLElement {
    const root = element('div', `fw-chat-msg is-${role}`);
    root.append(element('span', 'fw-chat-who', role === 'user' ? 'You' : 'Claude'));
    const body = element('div', 'fw-chat-body');
    root.append(body);
    this.log.append(root);
    this.scroll();
    return body;
  }

  private scroll(): void {
    this.log.scrollTop = this.log.scrollHeight;
  }

  private toolRow(flow: HTMLElement, tool: Tool): HTMLElement {
    const row = element('div', 'fw-chat-tool');
    row.dataset.state = tool.error ? 'error' : tool.done ? 'done' : 'running';
    row.title = tool.input;
    row.append(element('span', 'fw-chat-dot'), element('span', 'fw-chat-tool-name', tool.name), element('span', 'fw-chat-tool-state', tool.error ? 'failed' : tool.done ? 'done' : 'running'));
    flow.append(row);
    this.tools.set(tool.id, row);
    return row;
  }

  private setRunning(running: boolean): void {
    this.running = running;
    this.send.textContent = '';
    this.send.append(glyph(running ? 'stop' : 'send'));
    this.send.title = running ? 'Stop the answer' : 'Send';
    this.send.setAttribute('aria-label', this.send.title);
    this.send.classList.toggle('is-stop', running);
    this.fresh.disabled = running;
    this.syncHandoff();
  }

  private syncHandoff(): void {
    this.handoff.disabled = this.running || !this.sessionId;
  }

  private async submit(): Promise<void> {
    const message = this.input.value.trim();
    if (!message || this.running) return;
    this.input.value = '';
    this.empty.hidden = true;
    text(this.note, '');
    this.add('user').append(element('p', '', message));
    this.flow = this.add('assistant');
    this.segment = undefined;
    this.setRunning(true);
    this.abort = new AbortController();
    try {
      await stream('/api/chat/send', { text: message, context: this.hooks.context() || undefined }, (name, data) => this.event(name, data), this.abort.signal);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) this.fail(error instanceof Error ? error.message : String(error));
    } finally {
      this.setRunning(false);
      this.segment = undefined;
      this.abort = undefined;
    }
  }

  private event(name: string, data: Record<string, unknown>): void {
    const flow = this.flow;
    if (!flow) return;
    if (name === 'delta' && typeof data.text === 'string') {
      if (!this.segment) this.segment = { node: flow.appendChild(element('div', 'fw-chat-text')), raw: '' };
      this.segment.raw += data.text;
      renderMarkdown(this.segment.node, this.segment.raw);
    } else if (name === 'tool') {
      this.segment = undefined;
      this.toolRow(flow, data as unknown as Tool);
    } else if (name === 'toolDone') {
      const row = this.tools.get(String(data.id));
      if (row) { row.dataset.state = data.error ? 'error' : 'done'; text(row.lastElementChild as HTMLElement, data.error ? 'failed' : 'done'); }
    } else if (name === 'session' || name === 'done') {
      if (typeof data.session === 'string' && data.session) this.sessionId = data.session;
    } else if (name === 'error') {
      this.fail(String(data.message || 'Claude Code reported an error.'));
    }
    this.scroll();
  }

  private fail(message: string): void {
    if (this.flow) this.flow.append(element('p', 'fw-chat-error', message));
    this.hooks.notify(message.split('\n')[0], true);
    this.scroll();
  }

  private async stop(): Promise<void> {
    try { await request('/api/chat/cancel', {}); } catch (error) { this.hooks.notify(error instanceof Error ? error.message : String(error), true); }
  }

  private async reset(): Promise<void> {
    if (this.running) return;
    await request('/api/chat/reset', {});
    this.sessionId = '';
    this.tools.clear();
    while (this.log.lastElementChild && this.log.lastElementChild !== this.empty) this.log.lastElementChild.remove();
    this.empty.hidden = false;
    this.syncHandoff();
    this.focus();
  }
}
