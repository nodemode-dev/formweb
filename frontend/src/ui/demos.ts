import type { CommandDef } from './shell';

// The kind of site a demo is, so a starter can be offered by type. Each demo folder carries the same value in
// demo.json ({name, description, type}) beside its site.fweb, for tools that read the folder and not this file.
export type DemoType = 'business' | 'portfolio' | 'blog' | 'event' | 'shop';

export interface DemoInfo {
  id: string;
  title: string;
  line: string;
  type: DemoType;
  picture: string;
  file: string;
}

const BASE = `${import.meta.env.BASE_URL}demos/`;

export const demo = (id: string, title: string, line: string, type: DemoType): DemoInfo => ({ id, title, line, type, picture: `${BASE}${id}/cover.webp`, file: `${BASE}${id}/site.fweb` });

export const DEMOS: readonly DemoInfo[] = [
  demo('lowlight', 'Lowlight', 'A studio site made from library sections, with scroll scenes and animated components.', 'business'),
  demo('looking-back', 'Looking Back', 'A photo essay told in pinned scroll scenes, with a filterable gallery and a lightbox.', 'portfolio'),
  demo('harbour-ferries', 'Harbour Ferries', 'A service site with a fare calculator, CMS route pages, site search and redirects.', 'business'),
  demo('coldmere-plumbing', 'Coldmere Plumbing', 'A plumbing and heating firm with services and prices, a team page and contact by phone and email.', 'business'),
  demo('northfold-studio', 'Northfold Studio', 'A design studio portfolio with project pages from the CMS, an about page and contact by email.', 'portfolio'),
  demo('slow-allotment', 'The Slow Allotment', 'A gardening blog with recent posts on the home page, a post archive and post pages from the CMS.', 'blog'),
  demo('wenlow-type-day', 'Wenlow Type Day', 'A one-day conference with a programme, speakers from the CMS, venue and travel, and tickets by email.', 'event'),
  demo('fernhollow-pottery', 'Fernhollow Pottery', 'A potter\'s shop window with product pages from the CMS and ordering by email, without a checkout.', 'shop'),
];

export const DEMO_PREVIEW = `${BASE}preview.html`;

export const demoCommand = (d: DemoInfo): string => `demo.${d.id}`;

export interface DemoHooks {
  mayReplace: () => Promise<boolean>;
  load: (file: Blob) => Promise<void>;
  opened: () => void;
  notify: (message: string) => void;
  failed: (message: string) => void;
}

let opening: string | null = null;
const watchers = new Set<(id: string | null) => void>();

export function onDemoOpening(fn: (id: string | null) => void): void {
  watchers.add(fn);
}

function setOpening(id: string | null): void {
  opening = id;
  for (const fn of watchers) fn(id);
}

export async function openDemo(hooks: DemoHooks, id: string): Promise<void> {
  const found = DEMOS.find(d => d.id === id);
  if (!found) return;
  if (opening !== null) { hooks.notify('A demo is still opening.'); return; }
  setOpening(id);
  try {
    if (!(await hooks.mayReplace())) return;
    hooks.notify('Opening the demo...');
    const response = await fetch(found.file);
    if (!response.ok) throw new Error(String(response.status));
    await hooks.load(await response.blob());
    hooks.opened();
    hooks.notify('The demo is open. Save it to keep your changes.');
  } catch {
    hooks.failed('The demo could not open.');
  } finally {
    setOpening(null);
  }
}

export interface DemoPreviewHooks {
  show: (id: string) => void;
  close: () => void;
  isOpen: () => boolean;
}

export function demoCommands(hooks: DemoHooks, ready: () => boolean, preview: DemoPreviewHooks): CommandDef[] {
  const open: CommandDef[] = DEMOS.map(d => ({
    id: demoCommand(d),
    label: d.title,
    menu: 'Help',
    submenu: 'Demos',
    group: 1,
    description: `Open the demo site "${d.title}" as a new, unsaved site. ${d.line}`,
    when: 'Use when the person asks for a demo or an example site; it replaces the open site and asks first when that site has changes not saved as a project. Saved projects are not changed.',
    mutates: true,
    risky: true,
    enabled: () => ready() && opening === null,
    run: () => openDemo(hooks, d.id),
  }));
  if (!DEMOS.length) return open;
  return [...open, {
    id: 'demo.preview',
    label: 'Preview the demo sites',
    menu: 'Help',
    submenu: 'Demos',
    group: 2,
    description: 'Show a finished demo site in a preview over the window: every page, working, with a bar that switches between the demos. The open site is not changed.',
    when: 'Use when the person wants to look at a demo before opening it for editing.',
    params: { id: { type: 'string', enum: DEMOS.map(d => d.id), description: `The demo to show first: ${DEMOS.map(d => d.id).join(', ')}. Default: ${DEMOS[0].id}.` } },
    run: params => preview.show(typeof params?.id === 'string' ? params.id : DEMOS[0].id),
  }, {
    id: 'demo.preview-close',
    label: 'Close the demo preview',
    description: 'Close the demo preview and return to the window behind it.',
    when: 'Use after demo.preview, before any other command: while the preview is open only the demo commands are enabled.',
    enabled: preview.isOpen,
    run: () => preview.close(),
  }];
}
