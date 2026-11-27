import { t } from '../i18n';
import type { Notice } from './notice';
import { beforeDownload, exportChoice, forgetAnswer } from '../features/export-folder';

type Core = { invoke(command: string): Promise<unknown> };
type Saved = { ok: boolean; file: string; folder: string; unusable: string };
export type Words = { desktop: string; placed: string; browser: string };

const core = (): Core | undefined => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core;
const waiting = new Map<string, (saved: Saved) => void>();
const LISTEN_MS = 10 * 60 * 1000;

window.addEventListener('formweb-download', event => {
  const detail = (event as CustomEvent).detail as { url?: unknown; ok?: unknown; file?: unknown; folder?: unknown; unusable?: unknown } | null;
  if (!detail) return;
  const key = typeof detail.url === 'string' && waiting.has(detail.url) ? detail.url : waiting.size === 1 ? [...waiting.keys()][0] : '';
  const done = waiting.get(key);
  if (!done) return;
  waiting.delete(key);
  done({ ok: detail.ok === true, file: typeof detail.file === 'string' ? detail.file : '', folder: typeof detail.folder === 'string' ? detail.folder : '', unusable: typeof detail.unusable === 'string' ? detail.unusable.slice(0, 4096) : '' });
});

function whenSaved(url: string): Promise<Saved | null> {
  return new Promise(resolve => {
    const timer = window.setTimeout(() => { waiting.delete(url); resolve(null); }, LISTEN_MS);
    waiting.set(url, saved => { window.clearTimeout(timer); resolve(saved); });
  });
}

type ShellError = { code?: unknown; file?: unknown; folder?: unknown; detail?: unknown };

export function shellSentence(error: unknown): string {
  const answer = (error && typeof error === 'object' ? error : {}) as ShellError;
  const text = (value: unknown): string => typeof value === 'string' ? value : '';
  if (answer.code === 'download.none') return t('No file has been saved yet.');
  if (answer.code === 'download.moved') return t('{0} is no longer in {1}. It was moved or deleted.', [text(answer.file), text(answer.folder)]);
  if (answer.code === 'download.reveal-failed') return t('The file manager could not show {0}: {1}', [text(answer.file), text(answer.detail)]);
  return error instanceof Error ? error.message : typeof error === 'string' ? error : t('The file manager could not show the file.');
}

async function showInFolder(notice: Notice): Promise<void> {
  try {
    await core()?.invoke('reveal_download');
  } catch (error) {
    notice.show(shellSentence(error), { error: true });
  }
}

export const isBusy = (button: HTMLButtonElement): boolean => button.getAttribute('aria-busy') === 'true';

let shared: Notice | null = null;
const SAVED: Words = { desktop: 'Saved {0} to your Downloads folder.', placed: 'Saved {0} to {1}.', browser: 'Downloaded {0}. Your browser lists it with its downloads.' };

export const useNotice = (notice: Notice): void => { shared = notice; };

export async function deliverFile(file: string, fetch: (started: (url: string) => void) => Promise<Headers>): Promise<boolean> {
  if (!shared) { await fetch(() => undefined); return true; }
  const done = await deliver(file, SAVED, shared, fetch);
  if (!done) shared.show(t('Nothing was saved.'));
  return !!done;
}

export function saveBlob(blob: Blob, name: string, started: (url: string) => void): Promise<Headers> {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  link.hidden = true;
  document.body.append(link);
  started(url);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return Promise.resolve(new Headers());
}

let turns: Promise<unknown> = Promise.resolve();

export function deliver(file: string, words: Words, notice: Notice, fetch: (started: (url: string) => void) => Promise<Headers>, button?: HTMLButtonElement): Promise<Headers | null> {
  if (!core() || exportChoice().mode !== 'ask') return send(file, words, notice, fetch, button, false);
  const turn = turns.then(() => send(file, words, notice, fetch, button, true));
  turns = turn.catch(() => undefined);
  return turn;
}

async function send(file: string, words: Words, notice: Notice, fetch: (started: (url: string) => void) => Promise<Headers>, button: HTMLButtonElement | undefined, asking: boolean): Promise<Headers | null> {
  let pending: Promise<Saved | null> | null = null;
  const desktop = !!core();
  if (button) { button.setAttribute('aria-disabled', 'true'); button.setAttribute('aria-busy', 'true'); }
  let headers: Headers;
  try {
    if (asking && !(await beforeDownload(file))) return null;
    headers = await fetch(url => { if (desktop) pending = whenSaved(url); });
  } catch (error) {
    if (asking) forgetAnswer();
    notice.show(error instanceof Error ? error.message : String(error), { error: true });
    throw error;
  } finally {
    if (button) { button.removeAttribute('aria-disabled'); button.removeAttribute('aria-busy'); }
  }
  const usual = !desktop || exportChoice().mode === 'downloads';
  notice.show(usual ? t(desktop ? words.desktop : words.browser, [file]) : t('Saving {0}...', [file]));
  void (pending as Promise<Saved | null> | null)?.then(saved => {
    if (!saved) return;
    const reveal = { label: 'Show in folder', run: () => showInFolder(notice) };
    if (!saved.ok) notice.show(saved.folder && !usual ? t('{0} could not be saved to {1}. Check that the folder exists and has free space, then try again.', [file, saved.folder]) : t('{0} could not be saved to your Downloads folder. Check that the folder exists and has free space, then try again.', [file]), { error: true });
    else if (saved.unusable && saved.folder) notice.show(t('The chosen folder {0} could not be used, so {1} was saved to {2}.', [saved.unusable, saved.file || file, saved.folder]), { error: true, action: reveal });
    else if (saved.folder) notice.show(t(words.placed, [saved.file || file, saved.folder]), { action: reveal });
    else notice.show(t(words.desktop, [saved.file || file]));
  });
  return headers;
}
