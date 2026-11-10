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
function authHeaders(): Record<string, string> {
  try {
    const token = sessionStorage.getItem('formweb_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}
export async function request<T>(path: string, body?: unknown, method?: string): Promise<T> {
  if (['/api/projects/save', '/api/publish', '/api/audit', '/api/preview'].includes(path) || path.startsWith('/api/libraries') || path.startsWith('/api/cms/') || path.startsWith('/api/branches') || path.startsWith('/api/providers/')) await queue.catch(() => undefined);
  const response = await fetch(apiBase + path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { ...authHeaders(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const error = await response.json();
      detail = typeof error.detail === 'string' ? error.detail : JSON.stringify(error.detail || error.error || error);
    } catch {}
    if (response.status === 409 && path !== '/api/state' && /revision conflict|revision is stale|stale.*revision/i.test(detail)) {
      accept(await request<EditorState>('/api/state'));
      throw new Error(`${detail}. Latest state loaded; your focused input is retained. Review the current state and apply your change again.`);
    }
    throw new Error(detail);
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
let events: EventSource | undefined;
let connectionListener: (connected: boolean) => void = () => undefined;
export function reconnect(): Promise<void> { return connect(connectionListener); }
export async function connect(onConnection: (connected: boolean) => void): Promise<void> {
  connectionListener = onConnection;
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
  events.onopen = () => onConnection(true);
  events.onerror = () => onConnection(false);
}
export async function download(path: string, filename: string): Promise<void> {
  await queue.catch(() => undefined);
  const response = await fetch(apiBase + path, { headers: authHeaders(), credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function upload(file: File): Promise<{ id: string; url: string; mime: string; size: number }> {
  const type = /\.woff2$/i.test(file.name) ? 'font/woff2' : file.type;
  const caps: Record<string, number> = { 'image/png': 8, 'image/jpeg': 8, 'image/webp': 8, 'image/gif': 8, 'video/mp4': 64, 'video/webm': 64, 'font/woff2': 4 };
  if (!caps[type]) throw new Error('Choose a PNG, JPEG, WebP or GIF image, an MP4 or WebM video, or a WOFF2 font.');
  if (file.size > caps[type] * 1024 * 1024) throw new Error(type.startsWith('image/') ? 'Images must be 8 MiB or smaller.' : type.startsWith('video/') ? 'Videos must be 64 MiB or smaller.' : 'Fonts must be 4 MiB or smaller.');
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
