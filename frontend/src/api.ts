import type { Command, EditorState } from './types';

export const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
let current: EditorState | undefined;
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<(state: EditorState) => void>();

export function state(): EditorState {
  if (!current) throw new Error('The site engine is not connected.');
  return current;
}
export function accept(next: EditorState): EditorState {
  current = next;
  listeners.forEach(listener => listener(next));
  return next;
}
export function subscribe(listener: (next: EditorState) => void): void { listeners.add(listener); }
let windowKey = '';
function bearer(): Record<string, string> {
  try {
    const token = sessionStorage.getItem('formweb_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}
function authHeaders(): Record<string, string> {
  return windowKey ? { ...bearer(), 'X-FormWeb-Window-Key': windowKey } : bearer();
}
let keyClaim: Promise<void> | undefined;
let keyClaimed = false;
function loadWindowKey(): Promise<void> {
  if (!keyClaim || (keyClaimed && !windowKey)) {
    keyClaimed = false;
    keyClaim = claimWindowKey().catch(() => undefined).then(() => { keyClaimed = true; });
  }
  return keyClaim;
}
function windowKeyReady(): Promise<void> {
  return keyClaim ?? loadWindowKey();
}
async function claimWindowKey(): Promise<void> {
  if (windowKey) return;
  const holder = window as unknown as { __FORMWEB_WINDOW_KEY?: unknown };
  const given = holder.__FORMWEB_WINDOW_KEY;
  delete holder.__FORMWEB_WINDOW_KEY;
  if (typeof given === 'string' && given) { windowKey = given; return; }
  try { windowKey = sessionStorage.getItem('formweb_window_key') || ''; } catch {}
  if (windowKey && await send<{ ticket?: string }>('/api/window/ticket', {}).then(reply => reply.ticket || '', () => '')) return;
  windowKey = '';
  try {
    const response = await fetch(apiBase + '/api/window/key', { method: 'POST', headers: bearer(), credentials: 'same-origin' });
    const body = response.ok ? await response.json() as { key?: unknown } : {};
    if (typeof body.key === 'string' && body.key) {
      windowKey = body.key;
      try { sessionStorage.setItem('formweb_window_key', windowKey); } catch {}
      return;
    }
  } catch {}
  try { windowKey = sessionStorage.getItem('formweb_window_key') || ''; } catch {}
}
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}
export type ApprovalEvent = { type: 'open' | 'request' | 'withdrawn'; id?: string; reason?: string };
const approvalListeners = new Set<(event: ApprovalEvent) => void>();
export function onApproval(listener: (event: ApprovalEvent) => void): void {
  approvalListeners.add(listener);
  if (events?.readyState === EventSource.OPEN) listener({ type: 'open' });
}
export async function terminalTicket(): Promise<string> {
  try { return (await request<{ ticket: string }>('/api/window/ticket', {})).ticket || ''; } catch { return ''; }
}
export async function request<T>(path: string, body?: unknown, method?: string): Promise<T> {
  await windowKeyReady();
  return send<T>(path, body, method);
}
async function send<T>(path: string, body?: unknown, method?: string): Promise<T> {
  if (['/api/projects/save', '/api/publish', '/api/audit', '/api/preview'].includes(path) || path.startsWith('/api/libraries') || path.startsWith('/api/cms/') || path.startsWith('/api/branches') || path.startsWith('/api/providers/')) await queue.catch(() => undefined);
  const response = await fetch(apiBase + path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { ...authHeaders(), ...(body === undefined ? {} : { 'Content-Type': body instanceof Blob ? (body.type || 'application/octet-stream') : 'application/json' }) },
    credentials: 'same-origin',
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body)
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    let code = '';
    try {
      const error = await response.json();
      detail = typeof error.detail === 'string' ? error.detail : JSON.stringify(error.detail || error.error || error);
      if (typeof error.code === 'string') code = error.code;
    } catch {}
    if (response.status === 409 && path !== '/api/state' && /revision conflict|revision is stale|stale.*revision/i.test(detail)) {
      accept(await request<EditorState>('/api/state'));
      throw new Error(`${detail}. Latest state loaded; your focused input is retained. Review the current state and apply your change again.`);
    }
    throw new ApiError(detail, response.status, code);
  }
  return response.json() as Promise<T>;
}
export function commands(commands: Command[]): Promise<EditorState> {
  const work = queue.catch(() => undefined).then(async () => accept(await request<EditorState>('/api/batch', {
    commands, expectedRevision: current?.revision
  })));
  queue = work;
  return work;
}
export function command(command: string, params: Record<string, unknown> = {}): Promise<EditorState> {
  const work = queue.catch(() => undefined).then(async () => accept(await request<EditorState>('/api/command', {
    command, params, expectedRevision: current?.revision
  })));
  queue = work;
  return work;
}
export function replace(path: string, body: unknown): Promise<EditorState> {
  const work = queue.catch(() => undefined).then(async () => accept(await request<EditorState>(path, body)));
  queue = work;
  return work;
}
/** Binary responses (an asset's bytes, a background mask) with the same auth and error handling as request(). */
export async function requestBlob(path: string, body?: unknown): Promise<{ blob: Blob; headers: Headers }> {
  const response = await fetch(apiBase + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...authHeaders(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { const error = await response.json(); if (typeof error.detail === 'string') detail = error.detail; } catch {}
    throw new Error(detail);
  }
  return { blob: await response.blob(), headers: response.headers };
}
/** POST that answers with Server-Sent Events (the Chat pane); same auth and error handling as request(). */
export async function stream(path: string, body: unknown, onEvent: (name: string, data: Record<string, unknown>) => void, signal?: AbortSignal): Promise<void> {
  const response = await fetch(apiBase + path, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok || !response.body) {
    let detail = `${response.status} ${response.statusText}`;
    try { const error = await response.json(); if (typeof error.detail === 'string') detail = error.detail; } catch {}
    throw new Error(detail);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    for (let at = buffer.indexOf('\n\n'); at >= 0; at = buffer.indexOf('\n\n')) {
      const frame = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      let name = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      try { onEvent(name, JSON.parse(data) as Record<string, unknown>); } catch {}
    }
  }
}
/** For service routes that change the site and return `{ state, ... }` (team library link and sync). */
export function mutateVia<T extends { state: EditorState }>(path: string, body: unknown): Promise<T> {
  const work = queue.catch(() => undefined).then(async () => { const result = await request<T>(path, body); accept(result.state); return result; });
  queue = work;
  return work;
}
/** Library routes (section insert, preset and starter apply, Import HTML) answer with the /api/batch state plus extras (`root`, `pages`, `warnings`, `changed`). The state is accepted when the answer carries one; the whole answer comes back. */
export function libraryMutate<T extends object>(path: string, body: unknown): Promise<T> {
  const work = queue.catch(() => undefined).then(async () => {
    const result = await request<T>(path, body);
    if ('site' in result && 'revision' in result) accept(result as unknown as EditorState);
    return result;
  });
  queue = work;
  return work;
}
let events: EventSource | undefined;
let connectionListener: (connected: boolean) => void = () => undefined;
export function reconnect(): Promise<void> { return connect(connectionListener); }
export async function connect(onConnection: (connected: boolean) => void): Promise<void> {
  connectionListener = onConnection;
  await loadWindowKey();
  if (authHeaders().Authorization) await request('/api/auth', {});
  accept(await request<EditorState>('/api/state'));
  onConnection(true);
  events?.close();
  events = new EventSource(apiBase + '/api/events');
  events.addEventListener('state', event => {
    try {
      const incoming = JSON.parse((event as MessageEvent).data) as EditorState;
      if (!current || incoming.revision > current.revision || incoming.site.id !== current.site.id) accept(incoming);
    } catch {}
  });
  events.addEventListener('approval', event => {
    try {
      const incoming = JSON.parse((event as MessageEvent).data) as ApprovalEvent;
      approvalListeners.forEach(listener => listener(incoming));
    } catch {}
  });
  events.onopen = () => { onConnection(true); approvalListeners.forEach(listener => listener({ type: 'open' })); };
  events.onerror = () => onConnection(false);
}
export async function download(path: string, filename: string): Promise<Headers> {
  await queue.catch(() => undefined);
  const response = await fetch(apiBase + path, { headers: authHeaders(), credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return response.headers;
}
export async function upload(file: File): Promise<{ id: string; url: string; mime: string; size: number }> {
  const type = /\.woff2$/i.test(file.name) ? 'font/woff2' : file.type;
  const caps: Record<string, number> = { 'image/png': 8, 'image/jpeg': 8, 'image/webp': 8, 'image/gif': 8, 'image/svg+xml': 2, 'video/mp4': 64, 'video/webm': 64, 'font/woff2': 4 };
  if (!caps[type]) throw new Error('Choose a PNG, JPEG, WebP or GIF image, an MP4 or WebM video, or a WOFF2 font.');
  if (file.size > caps[type] * 1024 * 1024) throw new Error(type === 'image/svg+xml' ? 'SVG images must be 2 MiB or smaller.' : type.startsWith('image/') ? 'Images must be 8 MiB or smaller.' : type.startsWith('video/') ? 'Videos must be 64 MiB or smaller.' : 'Fonts must be 4 MiB or smaller.');
  const response = await fetch(apiBase + '/api/assets', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { ...authHeaders(), 'Content-Type': type, 'X-Filename': encodeURIComponent(file.name) },
    body: await file.arrayBuffer()
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Upload failed.');
  }
  return response.json();
}
export type SiteReference = { kind: 'pdf' | 'image'; name: string; text?: string; pages?: number; truncated?: boolean; colors?: string[] };
/** Reads a reference PDF's text or an image's colours for page generation; the server keeps no copy. */
export async function readReference(file: File): Promise<SiteReference> {
  if (file.size > 15 * 1024 * 1024) throw new Error('A reference must be 15 MB or smaller.');
  const response = await fetch(apiBase + '/api/ai/site/reference', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { ...authHeaders(), 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
    body: await file.arrayBuffer()
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'The reference could not be read.');
  return body as SiteReference;
}
