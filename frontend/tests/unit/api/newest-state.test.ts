import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorState } from '../../../src/types';

type Api = typeof import('../../../src/api');
type Reply = { ok: boolean; status: number; statusText: string; json: () => Promise<unknown> };

function site(revision: number, id = 'site-one'): EditorState {
  return { revision, site: { id } } as unknown as EditorState;
}
function reply(body: unknown): Reply {
  return { ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) };
}

class Stream {
  static OPEN = 1;
  static latest: Stream;
  readyState = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private heard = new Map<string, (event: { data: string }) => void>();
  constructor() { Stream.latest = this; }
  addEventListener(kind: string, listener: (event: { data: string }) => void): void { this.heard.set(kind, listener); }
  close(): void {}
  say(state: EditorState): void { this.heard.get('state')?.({ data: JSON.stringify(state) }); }
}

let api: Api;
let held: Array<{ path: string; answer: (body: unknown) => void }>;
let shown: number[];

async function asked(path: string): Promise<(body: unknown) => void> {
  await vi.waitFor(() => expect(held.some(entry => entry.path === path)).toBe(true));
  const index = held.findIndex(entry => entry.path === path);
  return held.splice(index, 1)[0].answer;
}

beforeEach(async () => {
  held = [];
  shown = [];
  sessionStorage.clear();
  vi.resetModules();
  vi.stubGlobal('EventSource', Stream);
  vi.stubGlobal('fetch', (url: string) => {
    if (url === '/api/window/key') return Promise.resolve(reply({ key: 'window-key' }));
    if (url === '/api/state') return Promise.resolve(reply(site(3)));
    return new Promise<Reply>(resolve => { held.push({ path: url, answer: body => resolve(reply(body)) }); });
  });
  api = await import('../../../src/api');
  await api.connect(() => undefined);
  api.subscribe(next => { shown.push(next.revision); });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('the window keeps the newest state of the site it has open', () => {
  it('keeps a newer state from the event stream when the answer to its own command arrives late', async () => {
    const sent = api.command('node.insert');
    const answer = await asked('/api/command');
    Stream.latest.say(site(4));
    Stream.latest.say(site(5));
    answer(site(4));
    expect((await sent).revision).toBe(5);
    expect(api.state().revision).toBe(5);
    expect(shown).toEqual([4, 5]);
  });

  it('keeps a newer state when the answer to its own batch arrives late', async () => {
    const sent = api.commands([{ command: 'node.insert', params: {} }]);
    const answer = await asked('/api/batch');
    Stream.latest.say(site(5));
    answer(site(4));
    await sent;
    expect(api.state().revision).toBe(5);
    expect(shown).toEqual([5]);
  });

  it('takes the answer to its own command when nothing newer has arrived', async () => {
    const sent = api.command('node.insert');
    (await asked('/api/command'))(site(4));
    expect((await sent).revision).toBe(4);
    expect(api.state().revision).toBe(4);
    expect(shown).toEqual([4]);
  });

  it('takes the answer once when the event stream delivered the same revision first', async () => {
    const sent = api.command('node.insert');
    const answer = await asked('/api/command');
    Stream.latest.say(site(4));
    answer(site(4));
    await sent;
    expect(api.state().revision).toBe(4);
  });

  it('takes an earlier revision when a version of the site is restored', async () => {
    Stream.latest.say(site(9));
    const sent = api.replace('/api/history/restore', { id: 'earlier' });
    (await asked('/api/history/restore'))(site(2));
    await sent;
    expect(api.state().revision).toBe(2);
  });

  it('takes a lower revision when the answer belongs to another site', async () => {
    Stream.latest.say(site(9));
    const sent = api.command('site.adopt');
    (await asked('/api/command'))(site(1, 'site-two'));
    await sent;
    expect(api.state().site.id).toBe('site-two');
    expect(api.state().revision).toBe(1);
  });
});
