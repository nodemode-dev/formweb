import { commands as send, state } from '../../api';
import { commands as registry } from '../../commands/registry';
import { element, keyed, text } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { label, t, tn } from '../../i18n';
import type { CommandDef } from '../../ui/shell';
import type { MenuEntry } from '../../ui/context-menu';
import type { Command, EditorState, SiteNode } from '../../types';
import { blocks, measure, SCOPE, TooLarge, type Block, type Plan, type Planned, type Source } from './measure';
import { refusal, ROOT_FORCED, scriptWords, summary, type SiteFont } from './rules';
import { runSealed } from './sealed';
import '../../styles/convert.css';

export const CONVERT_ID = 'library.convert-section';
/** The most elements one section's conversion makes, which keeps its measuring short. */
export const LIMIT = 480;
/** The engine's batch takes up to 4000 commands; sections that would pass it in one conversion wait for their own. */
const BATCH = 4000;
const DEPTH = 60;
const SECONDS = 20;
const RETRIES = 40;

export interface ConvertHost {
  overlay: HTMLElement;
  selected(): string;
  select(id: string): void;
  ready(): boolean;
  notify(message: string, undo?: () => unknown): void;
  status(message: string, error?: boolean): void;
  run(action: () => unknown): Promise<void>;
  undo(): Promise<unknown>;
}

export interface Converted { message: string; converted: number; root: string | null }

interface SectionRecord { enabled?: boolean; html?: string; css?: string; js?: string; module?: boolean }

const sectionOf = (site: EditorState['site'], id: string): SectionRecord | undefined => ((site.extensions?.code as { sections?: Record<string, SectionRecord> } | undefined)?.sections || {})[id];
export const convertible = (id: string): boolean => { try { return !!sectionOf(state().site, id)?.html?.trim(); } catch { return false; } };
const anySection = (): boolean => { try { return Object.values(((state().site.extensions?.code as { sections?: Record<string, SectionRecord> } | undefined)?.sections) || {}).some(record => !!record.html?.trim()); } catch { return false; } };
const sourceOf = (record: SectionRecord): Source => ({ html: record.html || '', css: record.css || '', js: record.js || '', module: !!record.module });
const parentOf = (site: EditorState['site'], id: string): SiteNode | undefined => Object.values(site.nodes).find(node => node.children.includes(id));

function nodeOf(item: Planned): Record<string, unknown> {
  return { id: item.id, tag: item.tag, name: item.name, text: item.text, children: [], attrs: item.attrs, styles: item.styles, breakpoints: {} };
}

function adds(plan: Plan, parent: (planned: string) => string): Command[] {
  const list: Command[] = [];
  for (const item of plan.nodes) {
    list.push({ command: 'node.add', params: { parent: parent(item.parent), node: nodeOf(item) } });
    if (item.code) list.push({ command: 'code.section.set', params: { node: item.id, value: item.code } });
  }
  return list;
}

/**
 * The commands that turn one whole code section into elements: the section's element becomes the page's body. When
 * it is the only thing on its page (an imported page), the page drops its padding so the page fills the window as
 * the original did.
 */
function wholeCommands(site: EditorState['site'], host: SiteNode, plan: Plan): Command[] {
  const styles: Record<string, string | null> = {};
  for (const name of Object.keys(host.styles)) styles[name] = null;
  Object.assign(styles, plan.rootStyles);
  const owner = parentOf(site, host.id);
  const alone = !!owner && owner.children.length === 1 && site.pages.some(page => page.root === owner.id);
  if (alone && (plan.rootStyles['background-color'] || plan.rootStyles['background-image']) && !plan.rootStyles['min-height']) styles['min-height'] = '100vh';
  return [
    { command: 'code.section.remove', params: { node: host.id } },
    { command: 'node.update', params: { id: host.id, patch: { styles } } },
    ...(alone && /[1-9]/.test(owner!.styles.padding || '') ? [{ command: 'node.update', params: { id: owner!.id, patch: { styles: { padding: '0' } } } }] : []),
    ...adds(plan, parent => parent || host.id)
  ];
}

/** The commands that turn one top-level block into elements in place: the code before it and after it stays code. */
function partCommands(site: EditorState['site'], host: SiteNode, record: SectionRecord, plan: Plan, fresh: string): Command[] {
  const owner = parentOf(site, host.id);
  if (!owner || !plan.rest) throw new Error(t('This code section has no parent to put the elements in.'));
  let at = owner.children.indexOf(host.id);
  const list: Command[] = [];
  const root = plan.nodes.find(item => item.parent === '');
  if (root) for (const name of ROOT_FORCED) if (plan.rootStyles[name] && !root.styles[name]) root.styles[name] = plan.rootStyles[name];
  const scoped = (id: string): string => plan.rest!.css.split(SCOPE).join(id);
  if (plan.rest.before) {
    list.push({ command: 'node.add', params: { parent: owner.id, node: { id: fresh, tag: host.tag, name: host.name, text: '', children: [], attrs: {}, styles: { ...host.styles }, breakpoints: {} } } });
    list.push({ command: 'node.move', params: { id: fresh, parent: owner.id, index: at++ } });
    list.push({ command: 'code.section.set', params: { node: fresh, value: { enabled: true, html: plan.rest.before, css: scoped(fresh) } } });
  }
  list.push(...adds(plan, parent => parent || owner.id));
  if (root) list.push({ command: 'node.move', params: { id: root.id, parent: owner.id, index: at } });
  if (plan.rest.after || record.js) list.push({ command: 'code.section.set', params: { node: host.id, value: { ...record, enabled: record.enabled !== false, html: plan.rest.after, css: scoped(host.id) + (record.js && plan.rest.kept ? `\n${plan.rest.kept}` : '') } } });
  else list.push({ command: 'node.remove', params: { id: host.id } });
  return list;
}

/** The words the site's own styles, tokens, fonts and code use, lower case, leaving out the sections being converted:
 * page-wide names (keyframes, font faces, registered properties) a kept stylesheet must not take. */
function siteNames(site: EditorState['site'], skip: Set<string>): Set<string> {
  const code = site.extensions?.code as { sections?: Record<string, unknown> } | undefined;
  const sections = Object.fromEntries(Object.entries(code?.sections || {}).filter(([id]) => !skip.has(id)));
  const text = JSON.stringify([Object.values(site.nodes).map(node => [node.styles, node.breakpoints]), site.tokens, site.extensions?.design, { ...code, sections }]);
  const names = new Set<string>();
  scriptWords(text.toLowerCase(), names, 500000);
  return names;
}

function fontsCommand(site: EditorState['site'], fonts: Record<string, SiteFont> | null): Command[] {
  if (!fonts) return [];
  const before = ((site.extensions?.design as { fonts?: Record<string, SiteFont> } | undefined)?.fonts) || {};
  return JSON.stringify(before) === JSON.stringify(fonts) ? [] : [{ command: 'design.set', params: { key: 'fonts', value: fonts } }];
}

/** Takes what the engine refused out of the plans: the named style or attribute, on the named element or on all. */
function drop(plans: [Plan, string][], message: string): number {
  const found = refusal(message);
  if (!found) return 0;
  let removed = 0;
  for (const [plan, hostId] of plans) {
    for (const item of [...plan.nodes, { id: hostId, styles: plan.rootStyles, attrs: {} as Record<string, string> }]) {
      if (found.node && found.node !== item.id) continue;
      if (found.style && found.style in item.styles) { delete item.styles[found.style]; removed++; }
      if (found.attr && found.attr in item.attrs) { delete item.attrs[found.attr]; removed++; }
      if (found.url) for (const name of ['href', 'src', 'poster', 'action', 'srcset']) if (name in item.attrs) { delete item.attrs[name]; removed++; }
    }
  }
  return removed;
}

/** Takes the style rules kept for scripts out of the plans when the engine refused the batch for a section's CSS or the site's size. */
function dropKept(plans: [Plan, string][], message: string): number {
  if (!message.includes('invalid css') && !message.includes('site exceeds')) return 0;
  let removed = 0;
  for (const [plan] of plans) {
    for (const item of plan.nodes) if (item.code?.css) { delete item.code.css; removed++; }
    if (plan.rest?.kept) { plan.rest.kept = ''; removed++; }
    if (plan.outcome.kept) { plan.outcome.keptDropped += plan.outcome.kept; plan.outcome.kept = 0; plan.outcome.keptAll = 0; }
  }
  return removed;
}

async function apply(build: () => Command[], plans: [Plan, string][]): Promise<{ state: EditorState; left: number }> {
  let left = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return { state: await send(build()), left };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < RETRIES && dropKept(plans, message)) continue;
      const removed = attempt < RETRIES ? drop(plans, message) : 0;
      if (!removed) throw error;
      left += removed;
    }
  }
}

/** Measures and converts code sections in one batch (one undo step). `part` converts one top-level block of one section. */
export async function convertSections(ids: string[], keepScript: boolean, part?: number, run?: boolean): Promise<Converted> {
  const site = state().site;
  const hosts = ids.map(id => site.nodes[id]).filter((node): node is SiteNode => !!node && !!sectionOf(site, node.id)?.html?.trim());
  if (!hosts.length) throw new Error(t('Select a code section that holds HTML to convert.'));
  const taken = new Set(Object.keys(site.nodes));
  const names = keepScript ? siteNames(site, new Set(hosts.map(host => host.id))) : undefined;
  let fonts = { ...(((site.extensions?.design as { fonts?: Record<string, SiteFont> } | undefined)?.fonts) || {}) };
  const plans: Plan[] = [];
  const done: SiteNode[] = [];
  let skipped: TooLarge | null = null, skips = 0, size = 0, unrun = 0;
  for (const host of hosts) {
    let plan: Plan;
    let source = sourceOf(sectionOf(site, host.id)!);
    if (run === true && source.js.trim()) {
      const sealed = await runSealed(source);
      if (sealed) source = { ...source, html: sealed.html, css: [source.css, sealed.css].filter(Boolean).join('\n') };
      else unrun++;
    }
    try {
      plan = await measure(source, {
        origin: location.origin, keepScript, fonts, taken: id => taken.has(id), limit: LIMIT, depth: DEPTH, seconds: SECONDS, scope: host.id, siteNames: names
      }, part);
    } catch (error) {
      if (!(error instanceof TooLarge) || hosts.length === 1) throw error;
      skipped ??= error;
      skips++;
      continue;
    }
    const need = plan.nodes.length * 2 + 4;
    if (hosts.length > 1 && size + need > BATCH) { skipped ??= new TooLarge('count', plan.nodes.length, LIMIT); skips++; continue; }
    size += need;
    plan.nodes.forEach(item => taken.add(item.id));
    if (plan.fonts) fonts = plan.fonts;
    plans.push(plan);
    done.push(host);
  }
  if (!plans.length) throw skipped!;
  let fresh = `cvpart-${Math.random().toString(36).slice(2, 7)}`;
  while (taken.has(fresh)) fresh += 'x';
  const build = (): Command[] => [
    ...fontsCommand(site, plans.reduce<Record<string, SiteFont> | null>((last, plan) => plan.fonts || last, null)),
    ...done.flatMap((host, index) => part === undefined ? wholeCommands(site, host, plans[index]) : partCommands(site, host, sectionOf(site, host.id)!, plans[index], fresh))
  ];
  if (build().length > BATCH) throw new TooLarge('count', plans.reduce((sum, plan) => sum + plan.nodes.length, 0), LIMIT);
  const { left } = await apply(build, plans.map((plan, index): [Plan, string] => [plan, done[index].id]));
  const outcome = plans.map(plan => plan.outcome).reduce((all, one) => ({
    converted: all.converted + one.converted, responsive: all.responsive + one.responsive, effects: all.effects + one.effects, floats: all.floats + one.floats,
    pictures: all.pictures + one.pictures, refused: all.refused + one.refused, scripted: all.scripted + one.scripted, left: all.left + one.left,
    kept: all.kept + one.kept, keptAll: all.keptAll + one.keptAll, keptOver: all.keptOver + one.keptOver, keptClash: all.keptClash + one.keptClash, keptDropped: all.keptDropped + one.keptDropped,
    parts: Object.fromEntries([...new Set([...Object.keys(all.parts), ...Object.keys(one.parts)])].map(key => [key, (all.parts[key as keyof typeof all.parts] || 0) + (one.parts[key as keyof typeof one.parts] || 0)]))
  }));
  outcome.left += left;
  const root = part === undefined ? done[0].id : plans[0].nodes.find(item => item.parent === '')?.id || null;
  const stayed = skips ? ' ' + tn(skips, '1 page was too large to convert at once and stayed a code section: convert it one part at a time with Convert to editable elements.', '{0} pages were too large to convert at once and stayed code sections: convert each one part at a time with Convert to editable elements.', [skips]) : '';
  const quiet = unrun ? ' ' + tn(unrun, 'The script of 1 page did not finish in time, so that page was measured without running it.', 'The scripts of {0} pages did not finish in time, so those pages were measured without running them.', [unrun]) : '';
  return { message: summary(outcome, t, tn) + stayed + quiet, converted: outcome.converted, root };
}

/**
 * Convert to editable elements: the command, its dialog (a script choice, and the parts of a page too large for one
 * conversion), and the entry the canvas and layer menus show on a code section. The dialog is mounted once.
 */
export function installConvert(host: ConvertHost): { commands: CommandDef[]; entries(id: string): MenuEntry[] } {
  const box = element('div', 'fw-convert');
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'false');
  box.tabIndex = -1;
  box.dataset.ownKeys = '';
  const title = element('h2', 'fw-convert-title');
  label(title, 'Convert to editable elements');
  box.setAttribute('aria-label', t('Convert to editable elements'));
  const about = element('p', 'fw-convert-text');
  label(about, 'Turns this code section\'s HTML and CSS into elements you can click, retype, restyle and drag. The look is measured at desktop width; responsive rules are not carried over. One undo step.');
  const scriptRow = element('label', 'checkbox-field fw-convert-script');
  const scriptBox = element('input');
  scriptBox.type = 'checkbox';
  scriptBox.checked = true;
  const scriptLabel = element('span');
  label(scriptLabel, 'Keep the page\'s script as a code section');
  scriptRow.append(scriptBox, scriptLabel);
  const partsHead = element('p', 'fw-convert-text');
  const parts = element('div', 'fw-convert-parts');
  const note = element('p', 'fw-convert-note');
  note.setAttribute('role', 'status');
  const go = element('button', 'primary');
  go.type = 'button';
  const goLabel = element('span');
  label(goLabel, 'Convert');
  go.append(icon('check'), goLabel);
  const cancel = element('button');
  cancel.type = 'button';
  const cancelLabel = element('span');
  label(cancelLabel, 'Cancel');
  cancel.append(cancelLabel);
  const foot = element('div', 'fw-convert-foot');
  foot.append(note, cancel, go);
  box.append(title, about, scriptRow, partsHead, parts, foot);
  host.overlay.append(box);
  partsHead.hidden = true;
  parts.hidden = true;

  let target = '';
  let busy = false;

  const close = (): void => {
    if (box.hidden) return;
    if (box.contains(document.activeElement)) {
      const shown = (node: HTMLElement | null): node is HTMLElement => !!node && node.getClientRects().length > 0;
      const tab = document.querySelector<HTMLElement>('.inspector-tabs button.active'), audit = document.querySelector<HTMLElement>('[data-cmd="page.audit"]');
      (shown(tab) ? tab : shown(audit) ? audit : null)?.focus({ preventScroll: true });
    }
    box.hidden = true;
  };
  const say = (message: string, error = false): void => { text(note, message); note.classList.toggle('is-error', error); };
  const setBusy = (on: boolean): void => { if (on && box.contains(document.activeElement)) box.focus({ preventScroll: true }); busy = on; go.disabled = on || !parts.hidden; box.setAttribute('aria-busy', String(on)); for (const button of Array.from(parts.querySelectorAll('button'))) (button as HTMLButtonElement).disabled = on || (button as HTMLButtonElement).dataset.big === '1'; };

  function paintParts(list: Block[]): void {
    if (partsHead.hidden !== !list.length) { partsHead.hidden = !list.length; parts.hidden = !list.length; }
    go.disabled = busy || !!list.length;
    keyed(parts, list, item => String(item.index), () => {
      const row = element('div', 'fw-convert-part');
      const button = element('button');
      button.type = 'button';
      button.append(element('span'));
      button.addEventListener('click', () => void host.run(() => convert(Number(row.dataset.index))));
      row.append(element('span', 'fw-convert-part-name'), element('span', 'fw-convert-part-count'), button);
      return row;
    }, (row, item) => {
      row.dataset.index = String(item.index);
      const [name, count, button] = Array.from(row.children) as HTMLElement[];
      text(name, item.label);
      text(count, tn(item.count, '1 element', '{0} elements', [item.count]));
      const big = item.count > LIMIT;
      (button as HTMLButtonElement).dataset.big = big ? '1' : '0';
      (button as HTMLButtonElement).disabled = busy || big;
      label(button.firstElementChild as HTMLElement, big ? 'Too large' : 'Convert this part');
    });
  }

  function open(id: string): void {
    target = id;
    const record = sectionOf(state().site, id);
    if (scriptRow.hidden === !!record?.js?.trim()) scriptRow.hidden = !record?.js?.trim();
    scriptBox.checked = true;
    paintParts([]);
    say('');
    box.hidden = false;
    go.focus({ preventScroll: true });
  }

  async function convert(part?: number): Promise<Converted | undefined> {
    if (busy || !target) return undefined;
    setBusy(true);
    say(t('Converting...'));
    const chosen = host.selected();
    try {
      const done = await convertSections([target], scriptBox.checked || scriptRow.hidden === true, part);
      finish(done, chosen);
      if (part !== undefined) {
        const record = sectionOf(state().site, target);
        if (record?.html?.trim()) { const next = blocks(sourceOf(record)); paintParts(next.blocks); say(done.message); return done; }
      }
      close();
      return done;
    } catch (error) {
      if (error instanceof TooLarge) {
        const record = sectionOf(state().site, target);
        if (record) paintParts(blocks(sourceOf(record)).blocks);
        text(partsHead, error.message);
        say('');
        return undefined;
      }
      say(error instanceof Error ? error.message : String(error), true);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  /** Selects what the conversion made, unless the person chose another element while it ran. */
  function finish(done: Converted, chosen: string): void {
    const after = state().revision, now = host.selected();
    if (done.root && state().site.nodes[done.root] && (now === chosen || !state().site.nodes[now])) host.select(done.root);
    host.notify(done.message, () => {
      if (state().revision !== after) { host.status(t('The site changed after the conversion. Use Edit > Undo to step back.'), true); return; }
      return host.undo();
    });
  }

  go.addEventListener('click', () => void host.run(() => convert()));
  cancel.addEventListener('click', close);
  box.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });

  const definitions: CommandDef[] = [{
    id: CONVERT_ID,
    label: 'Convert to editable elements...',
    menu: 'Edit',
    group: 1,
    mutates: true,
    params: {
      node: { type: 'string', description: 'The code section element to convert. Default: the selected element.' },
      nodes: { type: 'array', description: 'Several code section elements to convert in one undo step.' },
      keepScript: { type: 'boolean', description: 'Keep the page\'s script as a small code section, with the style rules the converted elements do not use, for what the script builds (default true).' },
      part: { type: 'integer', min: 0, description: 'Convert only this top-level block of the section (0 is the first), for a page too large for one conversion.' },
      run: { type: 'boolean', description: 'Run the page\'s script first in a sealed frame with no network, and measure the page as it stands after the script ran (default false).' }
    },
    enabled: () => host.ready() && anySection(),
    description: 'Turn a code section (an imported page or any section of plain HTML and CSS) into ordinary FormWeb elements with their own text, links, pictures and base styles measured at desktop width, in one undo step. Scripts, inline frames and vector graphics stay as small code sections in place; responsive rules are not carried over. A kept script keeps the style rules no converted element uses, and the class rules the script names, so what it builds is styled in Preview and the export. Without parameters it opens a short dialog for the selected element; with node or nodes it converts at once and returns the result sentence.',
    when: 'Use when the person wants to edit an imported page or a code section visually: click a heading, change its text, restyle it or move it.',
    run: async (params?: Record<string, unknown>) => {
      const list = Array.isArray(params?.nodes) ? (params!.nodes as unknown[]).filter((id): id is string => typeof id === 'string') : typeof params?.node === 'string' ? [params.node] : null;
      if (!list) { if (convertible(host.selected())) open(host.selected()); else host.status(t('Select a code section that holds HTML to convert.'), true); return undefined; }
      const chosen = host.selected();
      const done = await convertSections(list, params?.keepScript !== false, typeof params?.part === 'number' ? params.part : undefined, params?.run === true);
      finish(done, chosen);
      return { message: done.message, converted: done.converted, root: done.root };
    }
  }];

  function entries(id: string): MenuEntry[] {
    const command = registry.get(CONVERT_ID);
    if (!command || !convertible(id)) return [];
    return [{ separator: true }, { id: CONVERT_ID, label: 'Convert to editable elements...', enabled: registry.enabled(command), keys: '', run: () => { host.select(id); open(id); } }];
  }
  menuEntries = entries;

  return { commands: definitions, entries };
}

let menuEntries: (id: string) => MenuEntry[] = () => [];
/** The menu entry for a code section, for the canvas menu (empty for any other element). */
export const convertEntries = (id: string): MenuEntry[] => menuEntries(id);
