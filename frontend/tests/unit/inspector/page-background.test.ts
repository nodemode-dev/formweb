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
let offers: { message: string; undo: () => Promise<unknown> }[];
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
    offer: (message, undo) => { offers.push({ message, undo }); },
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
  offers = [];
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

describe('text stays readable on a page background', () => {
  const contrast = (a: string, b: string): number => {
    const lum = (hex: string) => {
      const [r, g, b2] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
    };
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it('a dark background on a page with no text color also gives it a readable text color in the same request', async () => {
    pageId = 'about';
    const { handle } = mount();
    handle.field.value = '#0a2540';
    handle.field.dispatchEvent(new Event('change'));
    await settle();
    expect(requests.length).toBe(1);
    const text = state.site.nodes['r-about'].styles.color;
    expect(contrast(text, '#0a2540')).toBeGreaterThanOrEqual(4.5);
  });

  it('a light background afterwards gives back the dark default text', () => {
    let site = threePages();
    site = applyCommands(site, [mod.setBackgroundCommand(site, site.pages[2], '#111111')]);
    site = applyCommands(site, [mod.setBackgroundCommand(site, site.pages[2], '#fafafa')]);
    expect(site.nodes['r-about'].styles.color).toBeUndefined();
  });

  it('a text color the page sets itself is kept', () => {
    const site = threePages();
    site.nodes['r-about'].styles.color = '#ffcc00';
    const after = applyCommands(site, [mod.setBackgroundCommand(site, site.pages[2], '#111111')]);
    expect(after.nodes['r-about'].styles.color).toBe('#ffcc00');
  });

  it('a dark site background, first set or changed later, makes the text readable on the pages that use it', () => {
    let site = threePages();
    site = applyCommands(site, mod.useSiteBackgroundCommands(site, [site.pages[2]], '#101418'));
    expect(contrast(site.nodes['r-about'].styles.color, '#101418')).toBeGreaterThanOrEqual(4.5);
    site = applyCommands(site, [mod.siteBackgroundColorCommand(site, '#f5f5f5'), ...mod.readableTextCommands({ ...site, tokens: { ...site.tokens, 'page-background': '#f5f5f5' } }, mod.siteBackgroundPages(site), 'var(--page-background)')]);
    expect(site.nodes['r-about'].styles.color).toBeUndefined();
  });

  it('the white text is offered in a notice with Undo, and Undo takes back the text color and keeps the background', async () => {
    pageId = 'about';
    const { handle } = mount();
    handle.field.value = '#0a2540';
    handle.field.dispatchEvent(new Event('change'));
    await settle();
    expect(offers.map(offer => offer.message)).toEqual(['Background set. The page text is now #ffffff so it stays readable on it.']);
    await offers[0].undo();
    expect(state.site.nodes['r-about'].styles.color).toBeUndefined();
    expect(state.site.nodes['r-about'].styles.background).toBe('#0a2540');
  });

  it('clearing a dark page background takes its white text away too, so the white page does not get white text', () => {
    let site = threePages();
    site = applyCommands(site, [mod.setBackgroundCommand(site, site.pages[2], '#111111')]);
    expect(site.nodes['r-about'].styles.color).toBe('#ffffff');
    site = applyCommands(site, [mod.setBackgroundCommand(site, site.pages[2], '')]);
    expect(site.nodes['r-about'].styles).toEqual({});
  });

  it('on a site with light and dark themes the text color is never changed, because one fixed color cannot suit both themes', () => {
    const site = threePages();
    site.extensions = { design: { themes: { default: 'dark', followSystem: false, values: { light: { paper: '#ffffff' } } } } };
    expect(mod.setBackgroundCommand(site, site.pages[2], '#111111').params.patch).toEqual({ styles: { background: '#111111' } });
    expect(mod.useSiteBackgroundCommands(site, [site.pages[2]], '#101418').some(step => 'color' in ((step.params.patch as { styles?: object } | undefined)?.styles ?? {}))).toBe(false);
  });

  it('a background with see-through parts is not judged, so the text is left alone', () => {
    const site = threePages();
    expect(mod.setBackgroundCommand(site, site.pages[2], '#00000080').params.patch).toEqual({ styles: { background: '#00000080' } });
  });

  it('a new page that starts on a dark site background gets white text, and on a light one none', () => {
    const dark = applyCommands(threePages(), [{ command: 'token.set', params: { name: 'page-background', value: '#101418' } }]);
    expect(mod.startCommands(dark, 'r-new', undefined)).toEqual([{ command: 'node.update', params: { id: 'r-new', patch: { styles: { background: 'var(--page-background)', color: '#ffffff' } } } }]);
    const light = applyCommands(threePages(), [{ command: 'token.set', params: { name: 'page-background', value: '#f3efe6' } }]);
    expect(mod.startCommands(light, 'r-new', undefined)).toEqual([{ command: 'node.update', params: { id: 'r-new', patch: { styles: { background: 'var(--page-background)' } } } }]);
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

describe('Match another page', () => {
  const pick = (section: HTMLElement, id: string): HTMLSelectElement => {
    const list = section.querySelector<HTMLSelectElement>('[data-field="page.background-from"]')!;
    list.value = id;
    list.dispatchEvent(new Event('change'));
    return list;
  };

  it('lists the home page first, marked as the home page, and leaves out the open page', () => {
    pageId = 'about';
    const { section } = mount();
    const list = section.querySelector<HTMLSelectElement>('[data-field="page.background-from"]')!;
    expect(Array.from(list.options).map(option => option.value)).toEqual(['', 'home', 'fares']);
    expect(list.options[1].textContent).toBe('Home (home page)');
  });

  it('picking the home page gives the open page its background in one request and the list goes back to its prompt', async () => {
    pageId = 'about';
    const { section } = mount();
    const list = pick(section, 'home');
    await settle();
    expect(requests.length).toBe(1);
    expect(mod.pageBackground(state.site, state.site.pages[2])?.value).toBe('var(--paper)');
    expect(list.value).toBe('');
    expect(statuses.at(-1)?.message).toBe('The background and text color of "Home" are now used on "About".');
  });

  it('a background-color the open page had is removed so the copied background shows', async () => {
    pageId = 'fares';
    const { section } = mount();
    pick(section, 'home');
    await settle();
    expect(state.site.nodes['r-fares'].styles['background-color']).toBeUndefined();
    expect(state.site.nodes['r-fares'].styles.background).toBe('var(--paper)');
  });

  it('the text color travels with the background, and goes when the other page has none', async () => {
    state.site.nodes['r-home'].styles.color = 'var(--ink)';
    pageId = 'about';
    const { section } = mount();
    pick(section, 'home');
    await settle();
    expect(state.site.nodes['r-about'].styles.color).toBe('var(--ink)');
    pageId = 'home';
    const again = mount();
    pick(again.section, 'fares');
    await settle();
    expect(state.site.nodes['r-home'].styles.color).toBeUndefined();
    expect(mod.pageBackground(state.site, state.site.pages[0])?.value).toBe('#123456');
  });

  it('Use the home page background is off on the home page and copies it on another page', async () => {
    const onHome = mount();
    expect(command(onHome.handle, 'page.background-home').enabled!()).toBe(false);
    pageId = 'fares';
    const { handle } = mount();
    expect(command(handle, 'page.background-home').enabled!()).toBe(true);
    await command(handle, 'page.background-home').run();
    expect(mod.pageBackground(state.site, state.site.pages[1])?.value).toBe('var(--paper)');
  });
});

describe('the background a new page starts with', () => {
  it('offers the site background, the home page and the page open now, in that order', () => {
    const site = threePages();
    expect(mod.startChoices(site, 'fares').map(choice => choice.name)).toEqual(['Site background (white)', 'Same as Home (home page)', 'Same as Fares, the page open now']);
    expect(mod.startChoices(site, 'home').map(choice => choice.id)).toEqual(['', 'home']);
  });

  it('the site background adds nothing to the new page, and the home page adds its background to the new root', () => {
    const site = threePages();
    expect(mod.startCommands(site, 'r-new', undefined)).toEqual([]);
    expect(mod.startCommands(site, 'r-new', site.pages[0])).toEqual([{ command: 'node.update', params: { id: 'r-new', patch: { styles: { background: 'var(--paper)' } } } }]);
    expect(mod.startCommands(site, 'r-new', site.pages[2])).toEqual([]);
  });
});

describe('the site background', () => {
  const withSiteBackground = (color = '#0b1d2a'): Site => {
    const site = threePages();
    return applyCommands(site, mod.useSiteBackgroundCommands(site, [site.pages[2]], color));
  };

  it('a site without the page-background token has none, and a page with no background of its own shows white as before', () => {
    const site = threePages();
    expect(mod.siteBackgroundColor(site)).toBe('');
    expect(mod.backgroundMode(site, site.pages[2])).toBe('site');
    expect(mod.backgroundMode(site, site.pages[0])).toBe('own');
    expect(mod.startCommands(site, 'r-new', undefined)).toEqual([]);
  });

  it('setting it the first time creates the token with the picked color and points the page at it in one list of commands', () => {
    const site = threePages();
    const list = mod.useSiteBackgroundCommands(site, [site.pages[2]], '#0b1d2a');
    expect(list.map(step => step.command)).toEqual(['token.set', 'node.update']);
    const after = applyCommands(site, list);
    expect(after.tokens['page-background']).toBe('#0b1d2a');
    expect(after.nodes['r-about'].styles.background).toBe('var(--page-background)');
    expect(mod.backgroundMode(after, after.pages[2])).toBe('site');
    expect(mod.siteBackgroundColor(after)).toBe('#0b1d2a');
  });

  it('is not created without a color', () => {
    const site = threePages();
    expect(mod.useSiteBackgroundCommands(site, site.pages, '')).toEqual([]);
  });

  it('on all pages points every page at the token, removes a background-color, and counts every page', () => {
    const site = withSiteBackground();
    const after = applyCommands(site, mod.useSiteBackgroundCommands(site, site.pages));
    expect(after.pages.map(page => after.nodes[page.root].styles.background)).toEqual(['var(--page-background)', 'var(--page-background)', 'var(--page-background)']);
    expect(after.nodes['r-fares'].styles['background-color']).toBeUndefined();
    expect(mod.siteBackgroundPages(after).length).toBe(3);
    expect(mod.useSiteBackgroundCommands(after, after.pages)).toEqual([]);
  });

  it('changing its color changes the one token, so every page on it follows', () => {
    const site = applyCommands(withSiteBackground(), [{ command: 'node.update', params: { id: 'r-home', patch: { styles: { background: 'var(--page-background)' } } } }]);
    const after = applyCommands(site, [mod.siteBackgroundColorCommand(site, '#fdf6e3')]);
    expect(Object.keys(after.tokens).sort()).toEqual(['page-background', 'paper']);
    expect(mod.siteBackgroundPages(after).map(page => mod.resolveColor(after, mod.pageBackground(after, page)!.value))).toEqual(['#fdf6e3', '#fdf6e3']);
  });

  it('offers the theme color the home page already uses, and adopting it adds no second color', () => {
    const site = threePages();
    expect(mod.pageColorToken(site)).toBe('paper');
    const after = applyCommands(site, mod.useSiteBackgroundCommands(site, [site.pages[2]], 'var(--paper)'));
    expect(mod.siteBackgroundColor(after)).toBe('#f3efe6');
    expect(mod.siteBackgroundTarget(after)).toBe('paper');
    const edited = applyCommands(after, [mod.siteBackgroundColorCommand(after, '#202020')]);
    expect(edited.tokens).toEqual({ paper: '#202020', 'page-background': 'var(--paper)' });
    expect(mod.pageColorToken(after)).toBeNull();
  });

  it('a new page starts on it once it exists, and the choice names its color', () => {
    const site = withSiteBackground();
    expect(mod.startChoices(site, 'fares')[0]).toEqual({ id: '', name: 'Site background (#0b1d2a)' });
    expect(mod.startCommands(site, 'r-new', undefined)).toEqual([{ command: 'node.update', params: { id: 'r-new', patch: { styles: { background: 'var(--page-background)', color: '#ffffff' } } } }]);
  });
});

describe('the three choices in the Page background group', () => {
  const radio = (section: HTMLElement, mode: string) => section.querySelector<HTMLInputElement>(`[data-field="page.background-mode-${mode}"]`)!;
  const checked = (section: HTMLElement) => ['site', 'other', 'own'].filter(mode => radio(section, mode).checked);
  const visible = (section: HTMLElement) => ({ site: !section.querySelector<HTMLElement>('.fw-pagebg-site')!.hidden, other: !section.querySelector<HTMLElement>('.fw-pagebg-match')!.hidden, own: !section.querySelector<HTMLElement>('.fw-pagebg-own')!.hidden });
  const siteField = (section: HTMLElement) => section.querySelector<HTMLInputElement>('[data-field="page.site-background"]')!;
  const paths = () => requests.map(entry => entry.path.replace(/^.*(\/api\/)/, '$1'));

  it('are Site background, Same as another page and This page only, and the one in use is chosen', () => {
    pageId = 'about';
    const onAbout = mount();
    expect(Array.from(onAbout.section.querySelectorAll('.fw-pagebg-mode')).map(row => row.textContent)).toEqual(['Site background', 'Same as another page...', 'This page only']);
    expect(checked(onAbout.section)).toEqual(['site']);
    expect(visible(onAbout.section)).toEqual({ site: true, other: false, own: false });
    document.body.replaceChildren();
    pageId = 'home';
    const onHome = mount();
    expect(checked(onHome.section)).toEqual(['own']);
    expect(visible(onHome.section)).toEqual({ site: false, other: false, own: true });
  });

  it('choosing Same as another page shows the page list and changes nothing yet', () => {
    const { section } = mount();
    radio(section, 'other').checked = true;
    radio(section, 'other').dispatchEvent(new Event('change'));
    expect(visible(section)).toEqual({ site: false, other: true, own: false });
    expect(requests).toEqual([]);
  });

  it('the site background field and the theme page color offer are spelled color, like the rest of the app', () => {
    pageId = 'about';
    const { section } = mount();
    expect(siteField(section).closest('.field')!.textContent).toBe('Site background color');
    expect(siteField(section).getAttribute('aria-label')).toBe('Site background color');
    expect(section.querySelector('[data-cmd="page.background-site-theme"]')!.textContent).toBe('Use --paper (#f3efe6), the theme page color');
    expect(section.textContent).not.toMatch(/colour/i);
  });

  it('typing the first site background color creates the token and puts the open page on it in one request', async () => {
    pageId = 'about';
    const { handle, section } = mount();
    siteField(section).value = '#0b1d2a';
    siteField(section).dispatchEvent(new Event('change'));
    await settle();
    expect(paths()).toEqual(['/api/batch']);
    expect(state.site.tokens['page-background']).toBe('#0b1d2a');
    expect(state.site.nodes['r-about'].styles.background).toBe('var(--page-background)');
    handle.fill(state);
    expect(section.textContent).toContain('1 of 3 pages use the site background.');
  });

  it('once it exists, choosing Site background on a page is one request and the count follows', async () => {
    state = { ...state, site: applyCommands(state.site, mod.useSiteBackgroundCommands(state.site, [state.site.pages[2]], '#0b1d2a')) };
    const { handle, section } = mount();
    radio(section, 'site').checked = true;
    radio(section, 'site').dispatchEvent(new Event('change'));
    await settle();
    expect(requests.length).toBe(1);
    expect(state.site.nodes['r-home'].styles.background).toBe('var(--page-background)');
    handle.fill(state);
    expect(checked(section)).toEqual(['site']);
    expect(section.textContent).toContain('2 of 3 pages use the site background.');
  });

  it('Use the site background on all pages is one batch, and is off when every page is on it', async () => {
    state = { ...state, site: applyCommands(state.site, mod.useSiteBackgroundCommands(state.site, [state.site.pages[2]], '#0b1d2a')) };
    const { handle } = mount();
    expect(command(handle, 'page.background-site-all').enabled!()).toBe(true);
    await command(handle, 'page.background-site-all').run();
    expect(paths()).toEqual(['/api/batch']);
    expect(mod.siteBackgroundPages(state.site).length).toBe(3);
    expect(command(handle, 'page.background-site-all').enabled!()).toBe(false);
  });

  it('on a site with themes the second color is the other theme value of the same token', async () => {
    state = { ...state, site: applyCommands(state.site, [...mod.useSiteBackgroundCommands(state.site, [state.site.pages[2]], '#fafafa'), { command: 'design.set', params: { key: 'themes', value: { default: 'light', followSystem: false, values: {} } } }]) };
    pageId = 'about';
    const { section } = mount();
    const dark = section.querySelector<HTMLInputElement>('[data-field="page.site-background-theme"]')!;
    expect(dark.closest<HTMLElement>('.field')!.hidden).toBe(false);
    expect(dark.closest('.field')!.textContent).toContain('Dark');
    dark.value = '#101010';
    dark.dispatchEvent(new Event('change'));
    await settle();
    expect((state.site.extensions.design as { themes: { values: Record<string, Record<string, string>> } }).themes.values.dark).toEqual({ 'page-background': '#101010' });
    expect(state.site.tokens['page-background']).toBe('#fafafa');
  });

  it('offers the theme page color, and using it makes the site background follow it without a second color', async () => {
    pageId = 'about';
    const { handle, section } = mount();
    const offer = section.querySelector<HTMLButtonElement>('[data-cmd="page.background-site-theme"]')!;
    expect(offer.hidden).toBe(false);
    expect(offer.textContent).toContain('--paper (#f3efe6)');
    await command(handle, 'page.background-site-theme').run();
    expect(paths()).toEqual(['/api/batch']);
    expect(state.site.tokens).toEqual({ paper: '#f3efe6', 'page-background': 'var(--paper)' });
    handle.fill(state);
    expect(siteField(section).value).toBe('#f3efe6');
    expect(offer.hidden).toBe(true);
  });

  it('an empty site background color is refused once the token exists', async () => {
    state = { ...state, site: applyCommands(state.site, mod.useSiteBackgroundCommands(state.site, [state.site.pages[2]], '#0b1d2a')) };
    pageId = 'about';
    const { section } = mount();
    siteField(section).value = '';
    siteField(section).dispatchEvent(new Event('change'));
    await settle();
    expect(requests).toEqual([]);
    expect(statuses.at(-1)?.error).toBe(true);
    expect(siteField(section).value).toBe('#0b1d2a');
  });
});
