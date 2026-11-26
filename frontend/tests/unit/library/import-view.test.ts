import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteImport } from '../../../src/features/library/site-import';
import type { LibraryHooks, SiteReview } from '../../../src/features/library/types';

const REFUSED = 'Choose one .zip file, or one or more .html files.';
const ONE_FILE = 'A section takes one file. Choose a single file to add it to this page as a section.';
const STOPWATCH = '<!doctype html><html><head><title>Pocket Lap Timer</title></head><body><h1>Lap timer</h1></body></html>';
const ABOUT = '<!doctype html><html><head><title>About</title></head><body><p>About us</p></body></html>';

type Sent = { path: string; body: unknown };
let sent: Sent[];
let view: SiteImport;
let shown: number;

function reviewOf(files: { name: string }[]): SiteReview {
  return {
    pages: files.map(file => {
      const route = '/' + file.name.replace(/\.html?$/i, '');
      return { file: file.name, name: file.name, title: file.name, description: '', route, newRoute: route, replaces: null, bytes: 100, warnings: [] };
    }),
    assets: { count: 0, bytes: 0 }, supportFiles: 0, skipped: [], ignored: 0, canReplace: false, replaceNote: '', notes: [], revision: 3
  };
}

function answer(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) } as Response);
}

function refusal(detail: string): Promise<Response> {
  return Promise.resolve({ ok: false, status: 400, statusText: 'Bad Request', json: () => Promise.resolve({ detail }) } as Response);
}

let refuse: string;
let noPages: boolean;

beforeEach(() => {
  document.body.replaceChildren();
  sent = [];
  shown = 0;
  refuse = '';
  noPages = false;
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/window/key')) return answer({ key: 'window-key' });
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    sent.push({ path: url, body });
    if (url.endsWith('/api/library/import-site/review')) {
      if (refuse) return refusal(refuse);
      return answer(noPages ? reviewOf([]) : reviewOf((body as { files: { name: string }[] }).files));
    }
    if (url.includes('/api/library/import-site?') || url.endsWith('/api/library/import-html')) return answer({ pages: [] });
    return new Promise(() => undefined);
  });
  const hooks: LibraryHooks = {
    placement: () => ({ page: 'home', parent: 'root' }),
    select: () => undefined,
    openPage: () => undefined,
    notify: () => undefined,
    url: path => path,
    convert: () => Promise.resolve({ message: '', root: null })
  };
  view = new SiteImport(hooks, () => undefined, () => { shown += 1; });
  document.body.append(view.element);
});

afterEach(() => { vi.unstubAllGlobals(); });

const picker = (): HTMLInputElement => view.element.querySelector<HTMLInputElement>('input[type="file"]')!;
const note = (): HTMLElement => view.element.querySelector<HTMLElement>('[role="status"]')!;
const button = (words: string): HTMLButtonElement => Array.from(view.element.querySelectorAll<HTMLButtonElement>('button')).find(found => found.textContent?.trim() === words)!;
const chosen = (): string[] => Array.from(view.element.querySelectorAll<HTMLElement>('.fw-lib-site-chosen')).map(row => row.firstElementChild?.textContent ?? '');
const review = (): HTMLElement => view.element.querySelector<HTMLElement>('.fw-lib-site-review')!;
const importButton = (): HTMLButtonElement => view.element.querySelector<HTMLButtonElement>('.fw-lib-foot button')!;
const reviews = (): Sent[] => sent.filter(entry => entry.path.endsWith('/api/library/import-site/review'));

async function pick(files: File[]): Promise<void> {
  Object.defineProperty(picker(), 'files', { configurable: true, value: files });
  picker().dispatchEvent(new Event('change'));
  await Promise.resolve();
}

const html = (name: string, body: string): File => new File([body], name, { type: 'text/html' });

async function reviewed(files: File[]): Promise<void> {
  await pick(files);
  await vi.waitFor(() => expect(review().hidden).toBe(false));
}

describe('what the pickers accept', () => {
  it('Import HTML files asks the system picker for .html files and allows several at once', () => {
    view.choose('html');
    expect(picker().accept).toBe('.html,.htm,text/html');
    expect(picker().multiple).toBe(true);
  });

  it('Import site from zip asks for a zip and also allows loose .html files', () => {
    view.choose('site');
    expect(picker().accept).toBe('.zip,application/zip,.html,.htm,text/html');
    expect(picker().multiple).toBe(true);
  });
});

describe('which picks are refused', () => {
  it('a zip picked together with an .html file is refused with a reason and nothing is sent to the service', async () => {
    view.choose('site');
    await pick([new File(['PK'], 'site.zip', { type: 'application/zip' }), html('stopwatch.html', STOPWATCH)]);
    expect(note().textContent).toBe(REFUSED);
    expect(note().classList.contains('is-error')).toBe(true);
    expect(sent).toEqual([]);
    expect(importButton().disabled).toBe(true);
  });

  it('a file that is not HTML picked through Import HTML files is refused with the same reason', async () => {
    view.choose('html');
    await pick([new File(['shopping list'], 'notes.txt', { type: 'text/plain' })]);
    expect(note().textContent).toBe(REFUSED);
    expect(sent).toEqual([]);
    expect(importButton().disabled).toBe(true);
  });
});

describe('loose .html files', () => {
  it('one picked file is named in the view and sent for review as its name and text, with no zip', async () => {
    view.choose('html');
    await reviewed([html('stopwatch.html', STOPWATCH)]);
    expect(chosen()).toEqual(['stopwatch.html']);
    expect(reviews()).toEqual([{ path: '/api/library/import-site/review', body: { files: [{ name: 'stopwatch.html', html: STOPWATCH }] } }]);
    expect(review().textContent).toContain('stopwatch.html');
    expect(importButton().disabled).toBe(false);
    expect(importButton().textContent).toBe('Import 1 page');
  });

  it('for one file both ways are offered and As new pages is chosen first', async () => {
    view.choose('html');
    await reviewed([html('stopwatch.html', STOPWATCH)]);
    expect(button('As new pages').getAttribute('aria-checked')).toBe('true');
    expect(button('As a section of this page').disabled).toBe(false);
    expect(button('As a section of this page').getAttribute('aria-checked')).toBe('false');
  });

  it('for two files both are named, As a section is turned off and the note says a section takes one file', async () => {
    view.choose('html');
    await reviewed([html('stopwatch.html', STOPWATCH), html('about.html', ABOUT)]);
    expect(chosen()).toEqual(['stopwatch.html', 'about.html']);
    expect(button('As a section of this page').disabled).toBe(true);
    expect(view.element.textContent).toContain(ONE_FILE);
    expect(importButton().textContent).toBe('Import 2 pages');
  });

  it('choosing As a section hides the page review and offers to import a section', async () => {
    view.choose('html');
    await reviewed([html('stopwatch.html', STOPWATCH)]);
    button('As a section of this page').click();
    expect(review().hidden).toBe(true);
    expect(importButton().textContent).toBe('Import as section');
    expect(importButton().disabled).toBe(false);
  });

  it('the view comes forward once files are chosen', async () => {
    view.choose('html');
    await reviewed([html('stopwatch.html', STOPWATCH)]);
    expect(shown).toBe(1);
  });
});

describe('the bring choice', () => {
  const heading = (): string => view.element.querySelector('[data-bring="elements"]')!.parentElement!.previousElementSibling!.textContent ?? '';

  it('there is exactly one choice of editable elements or code sections in the view', async () => {
    view.choose('html');
    await reviewed([html('stopwatch.html', STOPWATCH)]);
    expect(view.element.querySelectorAll('[data-bring="elements"]').length).toBe(1);
    button('As a section of this page').click();
    expect(view.element.querySelectorAll('[data-bring="elements"]').length).toBe(1);
  });

  it('its heading reads Bring pages in as for pages and Bring it in as for a section, on the same mounted choice', async () => {
    view.choose('html');
    await reviewed([html('stopwatch.html', STOPWATCH)]);
    const choice = view.element.querySelector('[data-bring="elements"]');
    expect(heading()).toBe('Bring pages in as');
    button('As a section of this page').click();
    expect(heading()).toBe('Bring it in as');
    button('As new pages').click();
    expect(heading()).toBe('Bring pages in as');
    expect(view.element.querySelector('[data-bring="elements"]')).toBe(choice);
  });
});

describe('starting a new pick', () => {
  it('a new pick after a review starts from the clean waiting view: no files, no review, no note', async () => {
    view.choose('html');
    await reviewed([html('stopwatch.html', STOPWATCH), html('about.html', ABOUT)]);
    view.choose('site');
    expect(chosen()).toEqual([]);
    expect(review().hidden).toBe(true);
    expect(note().textContent).toBe('');
    expect(importButton().textContent).toBe('Import site');
    expect(importButton().disabled).toBe(true);
  });

  it('a new pick after a refusal clears the refusal', async () => {
    view.choose('html');
    await pick([new File(['x'], 'notes.txt')]);
    expect(note().textContent).toBe(REFUSED);
    view.choose('html');
    expect(note().textContent).toBe('');
    expect(note().classList.contains('is-error')).toBe(false);
  });

  it('the review rows of the earlier pick are replaced by those of the next pick, and the view itself stays mounted', async () => {
    const scroller = view.element.firstElementChild;
    view.choose('html');
    await reviewed([html('stopwatch.html', STOPWATCH)]);
    view.choose('html');
    await reviewed([html('about.html', ABOUT)]);
    expect(chosen()).toEqual(['about.html']);
    expect(review().textContent).toContain('about.html');
    expect(review().textContent).not.toContain('stopwatch.html');
    expect(view.element.firstElementChild).toBe(scroller);
  });
});

describe('the text of a picked page in any of the usual encodings', () => {
  const PAGE = '<!doctype html><html><head><title>Café</title></head><body><h1>Crème brûlée à €4,50</h1><p>“Déjà vu” – naïve façade, Œuvre, señor, Zürich, ‘quoted’.</p></body></html>';
  const WINDOWS_1252: Record<string, number> = { '€': 0x80, 'Œ': 0x8c, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96 };
  const windows1252 = (source: string): Uint8Array<ArrayBuffer> => Uint8Array.from(Array.from(source), char => {
    const code = char.codePointAt(0)!;
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) return code;
    if (char in WINDOWS_1252) return WINDOWS_1252[char];
    throw new Error(`${char} has no Windows-1252 byte`);
  });
  const utf8 = (source: string): Uint8Array<ArrayBuffer> => Uint8Array.from(new TextEncoder().encode(source));
  const withMark = (source: string): Uint8Array<ArrayBuffer> => Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8(source)]);
  const page = (bytes: Uint8Array<ArrayBuffer>): File => new File([bytes], 'cafe.html', { type: 'text/html' });
  const parts = (source: string): string[] => {
    const read = new DOMParser().parseFromString(source, 'text/html');
    return ['title', 'h1', 'p'].map(tag => read.querySelector(tag)?.textContent ?? '');
  };
  const sentText = (): string => (reviews()[0].body as { files: { html: string }[] }).files[0].html;

  it('a page saved as Windows-1252 is sent for review with its accents, euro sign and curly quotes intact', async () => {
    view.choose('html');
    await reviewed([page(windows1252(PAGE))]);
    expect(parts(sentText())).toEqual(parts(PAGE));
    expect(sentText()).toBe(PAGE);
    expect(sentText()).not.toContain(String.fromCharCode(0xfffd));
  });

  it('a page saved as UTF-8 is sent unchanged', async () => {
    view.choose('html');
    await reviewed([page(utf8(PAGE))]);
    expect(parts(sentText())).toEqual(parts(PAGE));
    expect(sentText()).toBe(PAGE);
  });

  it('a page saved as UTF-8 with a byte order mark is sent without the mark', async () => {
    view.choose('html');
    await reviewed([page(withMark(PAGE))]);
    expect(parts(sentText())).toEqual(parts(PAGE));
    expect(sentText()).toBe(PAGE);
    expect(sentText().charCodeAt(0)).not.toBe(0xfeff);
  });

  it('a Windows-1252 page brought in as a section sends the same correctly decoded text', async () => {
    view.choose('html');
    await reviewed([page(windows1252(PAGE))]);
    button('As a section of this page').click();
    importButton().click();
    await vi.waitFor(() => expect(sent.some(entry => entry.path.endsWith('/api/library/import-html'))).toBe(true));
    const section = (sent.find(entry => entry.path.endsWith('/api/library/import-html'))!.body as { html: string }).html;
    expect(parts(section)).toEqual(parts(PAGE));
    expect(section).toBe(PAGE);
  });
});

describe('after the review of loose files is refused', () => {
  const HIDDEN = 'The file name .hidden.html cannot be imported. Give the file an ordinary name such as about.html. Nothing was imported.';
  const NONE = 'None of the files is an HTML page that can be imported.';
  const imports = (): Sent[] => sent.filter(entry => entry.path.includes('/api/library/import-site?') || entry.path.endsWith('/api/library/import-html'));
  const settled = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
  const force = async (): Promise<void> => {
    const go = importButton();
    go.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const was = go.disabled;
    go.disabled = false;
    go.click();
    go.disabled = was;
    await settled();
  };

  async function triedEveryWay(sentence: string): Promise<void> {
    await vi.waitFor(() => expect(note().textContent).toBe(sentence));
    expect(importButton().disabled).toBe(true);
    await force();
    button('As a section of this page').click();
    expect(importButton().disabled).toBe(true);
    await force();
    button('As new pages').click();
    await force();
    expect(imports()).toEqual([]);
    expect(note().textContent).toBe(sentence);
  }

  it('when the service refuses the review, neither the import button nor the section path sends anything', async () => {
    refuse = HIDDEN;
    view.choose('html');
    await pick([html('.hidden.html', STOPWATCH)]);
    await triedEveryWay(HIDDEN);
  });

  it('when the review finds no importable page, neither the import button nor the section path sends anything', async () => {
    noPages = true;
    view.choose('html');
    await pick([html('huge.html', STOPWATCH)]);
    await triedEveryWay(NONE);
  });

  it('a new pick after a refusal can be imported again', async () => {
    refuse = HIDDEN;
    view.choose('html');
    await pick([html('.hidden.html', STOPWATCH)]);
    await vi.waitFor(() => expect(note().textContent).toBe(HIDDEN));
    refuse = '';
    view.choose('html');
    await reviewed([html('stopwatch.html', STOPWATCH)]);
    importButton().click();
    await vi.waitFor(() => expect(imports().map(entry => entry.path.split('?')[0])).toEqual(['/api/library/import-site']));
  });
});
