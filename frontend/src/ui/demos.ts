import type { CommandDef } from './shell';

export interface DemoInfo {
  id: string;
  title: string;
  line: string;
  picture: string;
  file: string;
}

const BASE = `${import.meta.env.BASE_URL}demos/`;

export const demo = (id: string, title: string, line: string): DemoInfo => ({ id, title, line, picture: `${BASE}${id}/cover.webp`, file: `${BASE}${id}/site.fweb` });

export const DEMOS: readonly DemoInfo[] = [];

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

export function demoCommands(hooks: DemoHooks, ready: () => boolean): CommandDef[] {
  return DEMOS.map(d => ({
    id: demoCommand(d),
    label: d.title,
    menu: 'Help',
    group: 1,
    description: `Open the demo site "${d.title}" as a new, unsaved site. ${d.line}`,
    when: 'Use when the person asks for a demo or an example site; it replaces the open site and asks first when that site has changes not saved as a project. Saved projects are not changed.',
    mutates: true,
    risky: true,
    enabled: () => ready() && opening === null,
    run: () => openDemo(hooks, d.id),
  }));
}
