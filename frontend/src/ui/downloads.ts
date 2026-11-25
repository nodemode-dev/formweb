import { t } from '../i18n';
import type { Notice } from './notice';

type Core = { invoke(command: string): Promise<unknown> };
type Saved = { ok: boolean; file: string; folder: string };
export type Words = { desktop: string; placed: string; browser: string };

const core = (): Core | undefined => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core;
const waiting = new Map<string, (saved: Saved) => void>();
const LISTEN_MS = 10 * 60 * 1000;

window.addEventListener('formweb-download', event => {
  const detail = (event as CustomEvent).detail as { url?: unknown; ok?: unknown; file?: unknown; folder?: unknown } | null;
  if (!detail) return;
  const key = typeof detail.url === 'string' && waiting.has(detail.url) ? detail.url : waiting.size === 1 ? [...waiting.keys()][0] : '';
  const done = waiting.get(key);
  if (!done) return;
  waiting.delete(key);
  done({ ok: detail.ok === true, file: typeof detail.file === 'string' ? detail.file : '', folder: typeof detail.folder === 'string' ? detail.folder : '' });
});

function whenSaved(url: string): Promise<Saved | null> {
  return new Promise(resolve => {
    const timer = window.setTimeout(() => { waiting.delete(url); resolve(null); }, LISTEN_MS);
    waiting.set(url, saved => { window.clearTimeout(timer); resolve(saved); });
  });
}

async function showInFolder(notice: Notice): Promise<void> {
  try {
    await core()?.invoke('reveal_download');
  } catch (error) {
    notice.show(error instanceof Error ? error.message : String(error), { error: true });
  }
}

export const isBusy = (button: HTMLButtonElement): boolean => button.getAttribute('aria-busy') === 'true';

export async function deliver(file: string, words: Words, notice: Notice, fetch: (started: (url: string) => void) => Promise<Headers>, button?: HTMLButtonElement): Promise<Headers> {
  let pending: Promise<Saved | null> | null = null;
  const desktop = !!core();
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  let headers: Headers;
  try {
    headers = await fetch(url => { if (desktop) pending = whenSaved(url); });
  } catch (error) {
    notice.show(error instanceof Error ? error.message : String(error), { error: true });
    throw error;
  } finally {
    if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
  }
  notice.show(t(desktop ? words.desktop : words.browser, [file]));
  void (pending as Promise<Saved | null> | null)?.then(saved => {
    if (!saved) return;
    if (!saved.ok) notice.show(t('{0} could not be saved to your Downloads folder. Check that the folder exists and has free space, then try again.', [file]), { error: true });
    else if (saved.folder) notice.show(t(words.placed, [saved.file || file, saved.folder]), { action: { label: 'Show in folder', run: () => showInFolder(notice) } });
    else notice.show(t(words.desktop, [saved.file || file]));
  });
  return headers;
}
