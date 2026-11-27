import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Folder = typeof import('../../../src/features/export-folder');
type Downloads = typeof import('../../../src/ui/downloads');
type Answer = unknown | ((args: Record<string, unknown> | undefined) => unknown);

const KEY = 'formweb.export-folder';
const WORDS = { desktop: 'Saved {0} to your Downloads folder.', placed: 'Saved {0} to {1}.', browser: 'Downloaded {0}. Your browser lists it with its downloads.' };

let calls: Array<[string, Record<string, unknown> | undefined]>;
let answers: Record<string, Answer>;

function shell(): void {
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    core: {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
        calls.push([command, args]);
        const answer = answers[command];
        if (answer instanceof Error) return Promise.reject(answer);
        return Promise.resolve(typeof answer === 'function' ? (answer as (a: typeof args) => unknown)(args) : answer);
      },
    },
  };
}

async function load(stored: string | null, desktop = true): Promise<{ folder: Folder; downloads: Downloads }> {
  if (stored === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, stored);
  if (desktop) shell();
  vi.resetModules();
  const folder = await import('../../../src/features/export-folder');
  const downloads = await import('../../../src/ui/downloads');
  return { folder, downloads };
}

function notice(): { show: (message: string) => void; said: string[] } {
  const said: string[] = [];
  return { said, show: (message: string) => { said.push(message); } };
}

beforeEach(() => {
  calls = [];
  answers = { set_export_place: (args: Record<string, unknown> | undefined) => ({ mode: args?.mode, folder: args?.path }) };
  localStorage.clear();
});

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  localStorage.clear();
});

describe('the stored choice of where exports are saved', () => {
  it('means the Downloads folder for every malformed stored value', async () => {
    const malformed = ['{not json', 'null', '[]', '"ask"', '42', '{"mode":"folder"}', '{"mode":"folder","path":""}', '{"mode":"folder","path":7}', '{"mode":"elsewhere","path":"/home/me/Exports"}', '{"mode":"ASK","path":""}', JSON.stringify({ mode: 'folder', path: '/' + 'a'.repeat(5000) })];
    for (const value of malformed) {
      const { folder } = await load(value);
      expect(folder.exportChoice(), `stored ${value.slice(0, 40)}`).toEqual({ mode: 'downloads', path: '' });
    }
  });

  it('keeps a well formed ask or folder choice, so a malformed one really is refused', async () => {
    expect((await load('{"mode":"ask","path":""}')).folder.exportChoice()).toEqual({ mode: 'ask', path: '' });
    expect((await load('{"mode":"folder","path":"/home/me/Exports/café sites/"}')).folder.exportChoice()).toEqual({ mode: 'folder', path: '/home/me/Exports/café sites/' });
  });

  it('is handed to the shell once when the page loads', async () => {
    await load('{"mode":"folder","path":"/home/me/Exports"}');
    expect(calls).toEqual([['set_export_place', { mode: 'folder', path: '/home/me/Exports', forget: false }]]);
  });

  it('falls back to Downloads and forgets the stored folder when the shell answers it has no such folder', async () => {
    answers.set_export_place = { mode: 'downloads', folder: '' };
    const { folder } = await load('{"mode":"folder","path":"C:\\\\Users\\\\me\\\\Startup"}');
    await vi.waitFor(() => expect(folder.exportChoice()).toEqual({ mode: 'downloads', path: '' }));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('after Reset All Preferences is Downloads again and the shell is told to forget its folder', async () => {
    const { folder } = await load('{"mode":"folder","path":"/home/me/Exports"}');
    expect(localStorage.getItem(KEY)).not.toBeNull();
    calls = [];
    folder.resetExportFolder();
    expect(folder.exportChoice()).toEqual({ mode: 'downloads', path: '' });
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(calls).toEqual([['set_export_place', { mode: 'downloads', path: '', forget: true }]]);
  });
});

describe('asking the shell before a download', () => {
  it('goes on without asking in Downloads mode and in folder mode', async () => {
    answers.ask_export_place = false;
    expect(await (await load(null)).folder.beforeDownload('site.zip')).toBe(true);
    expect(await (await load('{"mode":"folder","path":"/home/me/Exports"}')).folder.beforeDownload('site.zip')).toBe(true);
    expect(calls.filter(([command]) => command === 'ask_export_place')).toEqual([]);
  });

  it('in ask mode goes on only when the shell answers yes, and asks with the file name', async () => {
    const { folder } = await load('{"mode":"ask","path":""}');
    answers.ask_export_place = true;
    expect(await folder.beforeDownload('harbour-site.zip')).toBe(true);
    expect(calls.at(-1)).toEqual(['ask_export_place', { name: 'harbour-site.zip' }]);
    for (const no of [false, null, 'true', 1, {}]) {
      answers.ask_export_place = no;
      expect(await folder.beforeDownload('harbour-site.zip'), `shell answered ${JSON.stringify(no)}`).toBe(false);
    }
  });

  it('in ask mode treats an error from the shell as no', async () => {
    const { folder } = await load('{"mode":"ask","path":""}');
    answers.ask_export_place = new Error('the dialog could not open');
    expect(await folder.beforeDownload('harbour-site.zip')).toBe(false);
  });

  it('in a browser goes on without asking, whatever is stored', async () => {
    const { folder } = await load('{"mode":"ask","path":""}', false);
    expect(await folder.beforeDownload('harbour-site.zip')).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe('delivering a download', () => {
  it('in ask mode returns the cancelled value and never fetches when the shell answers no or fails', async () => {
    for (const no of [false, new Error('the dialog could not open')]) {
      const { downloads } = await load('{"mode":"ask","path":""}');
      answers.ask_export_place = no;
      const fetch = vi.fn(() => Promise.resolve(new Headers()));
      const done = await downloads.deliver('harbour-site.zip', WORDS, notice() as never, fetch);
      expect(done).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it('in ask mode fetches exactly once after a yes and returns the headers', async () => {
    const { downloads } = await load('{"mode":"ask","path":""}');
    const order: string[] = [];
    answers.ask_export_place = () => { order.push('asked'); return true; };
    const headers = new Headers({ 'X-Probe': 'one' });
    const fetch = vi.fn(() => { order.push('fetched'); return Promise.resolve(headers); });
    const done = await downloads.deliver('harbour-site.zip', WORDS, notice() as never, fetch);
    expect(done?.get('X-Probe')).toBe('one');
    expect(order).toEqual(['asked', 'fetched']);
  });

  it('through deliverFile says Nothing was saved. after a cancel and reports false', async () => {
    const { downloads } = await load('{"mode":"ask","path":""}');
    answers.ask_export_place = false;
    const shown = notice();
    downloads.useNotice(shown as never);
    const fetch = vi.fn(() => Promise.resolve(new Headers()));
    expect(await downloads.deliverFile('qr-home.png', fetch)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(shown.said).toEqual(['Nothing was saved.']);
  });
});
