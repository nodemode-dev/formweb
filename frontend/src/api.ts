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
export async function request<T>(path: string, body?: unknown): Promise<T> {
  if (path === '/api/projects/save' || path === '/api/publish' || path === '/api/audit') await queue.catch(() => undefined);
  const response = await fetch(apiBase + path, {
    method: body === undefined ? 'GET' : 'POST',
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
    if (response.status === 409 && path !== '/api/state') {
      accept(await request<EditorState>('/api/state'));
      throw new Error('Another editor changed the site. Latest state loaded; your focused input is retained. Apply your change again.');
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
export async function connect(onConnection: (connected: boolean) => void): Promise<void> {
  if (authHeaders().Authorization) await request('/api/auth', {});
  accept(await request<EditorState>('/api/state'));
  onConnection(true);
  const events = new EventSource(apiBase + '/api/events');
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
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Images must be 8 MiB or smaller.');
  const response = await fetch(apiBase + '/api/assets', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { ...authHeaders(), 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name) },
    body: await file.arrayBuffer()
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Image upload failed.');
  }
  return response.json();
}
