import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorState, Site } from '../../../src/types';
import { applyCommands, makeSite } from '../site';

type Module = typeof import('../../../src/features/inspector/page-background');

const readsAsBackground = (value: string): boolean =>
  /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) || ['transparent', 'white', 'black', 'navy'].includes(value) || /^(?:linear|radial)-gradient\(.+\)$/.test(value);

function threePages(settings: Record<string, string> = {}): Site {
  const site = makeSite([
    { id: 'home', name: 'Home', slug: '/', root: 'r-home' },
    { id: 'fares', name: 'Fares', slug: '/fares', root: 'r-fares' },
    { id: 'about', name: 'About', slug: '/about', root: 'r-about' }
  ], {
    'r-home': { tag: 'main', styles: { background: 'var(--paper)' } },
    'r-fares': { tag: 'main', styles: { 'background-color': '#123456' } },
    'r-about': { tag: 'main' }
  });
  site.tokens = { paper: '#f3efe6' };
  site.settings = settings;
  return site;
}

let mod: Module;
let requests: { path: string; body: Record<string, unknown> }[];
let statuses: { message: string; error: boolean }[];
let state: EditorState;
let pageId: string;

function mount() {
  const sectionEl = document.createElement('div');
  document.body.append(sectionEl);
  const handle = mod.installPageBackground({
    section: () => sectionEl,
    input: placeholder => { const input = document.createElement('input'); input.placeholder = placeholder || ''; return input; },
    button: label => { const button = document.createElement('button'); button.textContent = label; return button; },
    page: () => state.site.pages.find(page => page.id === pageId)!,
    state: () => state,
    run: async action => { try { await action(); } catch (error) { statuses.push({ message: (error as Error).message, error: true }); } },
    status: (message, error = false) => { statuses.push({ message, error }); },
    showPageTab: () => undefined
  });
  handle.fill(state);
  return { handle, section: sectionEl };
}
const command = (handle: ReturnType<typeof mount>['handle'], id: string) => handle.commands.find(entry => entry.id === id)!;
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => { vi.unstubAllGlobals(); });

beforeEach(async () => {
  vi.resetModules();
  document.body.replaceChildren();
  (window as unknown as { __FORMWEB_WINDOW_KEY?: string }).__FORMWEB_WINDOW_KEY = 'test-window';
  requests = [];
  statuses = [];
  state = { site: threePages(), revision: 1, canUndo: false, canRedo: false };
  pageId = 'home';
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    requests.push({ path: url, body });
    const list = url.endsWith('/api/batch') ? body.commands as never : url.endsWith('/api/command') ? [{ command: body.command, params: body.params }] as never : [];
    state = { ...state, site: applyCommands(state.site, list), revision: state.revision + 1 };
    return new Response(JSON.stringify(state), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  vi.stubGlobal('CSS', { supports: (_property: string, value?: string) => readsAsBackground(String(value)) });
  mod = await import('../../../src/features/inspector/page-background');
});

describe('typing a page background', () => {
  it('a value that is not a CSS background is refused and the field shows the page value again', async () => {
    const { handle } = mount();
    handle.field.value = 'sea blue';
    handle.field.dispatchEvent(new Event('change'));
    await settle();
    expect(handle.field.value).toBe('var(--paper)');
    expect(statuses.at(-1)?.error).toBe(true);
    expect(statuses.at(-1)?.message).toContain('sea blue');
    expect(requests).toEqual([]);
  });

  it('a colour is written to the page root', async () => {
    const { handle } = mount();
    handle.field.value = '#0a2540';
    handle.field.dispatchEvent(new Event('change'));
    await settle();
    expect(state.site.nodes['r-home'].styles.background).toBe('#0a2540');
    expect(requests.length).toBe(1);
  });

  it('a theme colour and a gradient built on one are accepted', () => {
    const site = threePages();
    expect(mod.backgroundRefusal(site, 'var(--paper)')).toBe('');
    expect(mod.backgroundRefusal(site, 'linear-gradient(var(--paper), white)')).toBe('');
    expect(mod.backgroundRefusal(site, 'sea blue')).not.toBe('');
  });

  it('with the brand restriction on a colour outside the brand is refused and a brand value is not', async () => {
    state = { ...state, site: threePages({ brandRestrict: 'true' }) };
    expect(mod.brandRefusal(state, '#ff0000')).not.toBe('');
    expect(mod.brandRefusal(state, 'var(--brand-sea)')).toBe('');
    const { handle } = mount();
    handle.field.value = '#ff0000';
    handle.field.dispatchEvent(new Event('change'));
    await settle();
    expect(requests).toEqual([]);
    expect(handle.field.value).toBe('var(--paper)');
  });
});

describe('what the line under the field says', () => {
  it('a page with no background of its own says it uses the site background and hides Clear', () => {
    pageId = 'about';
    const { section } = mount();
    expect(section.textContent).toContain('Using the site background');
    expect(section.querySelector<HTMLElement>('[data-cmd="page.background-clear"]')!.hidden).toBe(true);
  });

  it('a page with a theme colour names the colour it resolves to and shows Clear', () => {
    const { section } = mount();
    expect(section.textContent).toContain('var(--paper)');
    expect(section.textContent).toContain('#f3efe6');
    expect(section.querySelector<HTMLElement>('[data-cmd="page.background-clear"]')!.hidden).toBe(false);
  });

  it('Apply to all pages is off when the site has one page', () => {
    state = { ...state, site: { ...state.site, pages: [state.site.pages[0]] } };
    const { section } = mount();
    expect(section.querySelector<HTMLButtonElement>('[data-cmd="page.background-all"]')!.disabled).toBe(true);
  });
});

describe('Clear', () => {
  it('removes the page background and the page uses the site background again', async () => {
    const { handle } = mount();
    await command(handle, 'page.background-clear').run();
    expect(state.site.nodes['r-home'].styles.background).toBeUndefined();
    expect(mod.pageBackground(state.site, state.site.pages[0])).toBeNull();
  });

  it('also removes a background-color set elsewhere', () => {
    const site = threePages();
    const after = applyCommands(site, [mod.setBackgroundCommand(site, site.pages[1], '')]);
    expect(after.nodes['r-fares'].styles['background-color']).toBeUndefined();
    expect(mod.pageBackground(after, after.pages[1])).toBeNull();
  });

  it('is off when the page has no background of its own', () => {
    pageId = 'about';
    const { handle } = mount();
    expect(command(handle, 'page.background-clear').enabled!()).toBe(false);
  });
});

describe('Apply to all pages', () => {
  it('gives every page this page background in one batch', async () => {
    const { handle } = mount();
    await command(handle, 'page.background-all').run();
    expect(requests.map(entry => entry.path.replace(/^.*(\/api\/)/, '$1'))).toEqual(['/api/batch']);
    expect(state.site.pages.map(page => mod.pageBackground(state.site, page)?.value)).toEqual(['var(--paper)', 'var(--paper)', 'var(--paper)']);
    expect(state.site.nodes['r-fares'].styles['background-color']).toBeUndefined();
  });

  it('from a page without a background clears every page in one batch', async () => {
    pageId = 'about';
    const { handle } = mount();
    await command(handle, 'page.background-all').run();
    expect(requests.length).toBe(1);
    expect(state.site.pages.map(page => mod.pageBackground(state.site, page))).toEqual([null, null, null]);
  });

  it('sends nothing when every page already has this background', async () => {
    state = { ...state, site: applyCommands(state.site, mod.allPagesCommands(state.site, 'var(--paper)')) };
    const { handle } = mount();
    await command(handle, 'page.background-all').run();
    expect(requests).toEqual([]);
  });

  it('refuses a page value that is not a CSS background', async () => {
    state.site.nodes['r-home'].styles.background = 'sea blue';
    const { handle } = mount();
    await command(handle, 'page.background-all').run();
    expect(requests).toEqual([]);
    expect(statuses.at(-1)?.error).toBe(true);
  });
});
