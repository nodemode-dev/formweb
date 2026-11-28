import { request } from '../api';
import { labelAttr } from '../i18n';
import { element, keyed, labelPieces, text, type Piece } from '../ui/dom';
import { FrameMap, bounds, type Box } from './canvas-drag';
import type { AuditIssue, EditorState } from '../types';
import '../styles/audit-markers.css';

export interface AuditMarkersHost {
  frame: HTMLIFrameElement;
  stage: HTMLElement;
  overlay: HTMLElement;
  dialog: HTMLElement;
  loaded: () => Promise<void>;
  page: () => string;
  editing: () => boolean;
  busy: () => boolean;
  pick: (id: string, message: string, again: () => void) => string;
  unsay: (line: string) => void;
  rescue: () => (HTMLElement | null | undefined)[];
  status: (message: string, error?: boolean) => void;
}

export interface AuditMarkers {
  row: HTMLElement;
  enabled: () => boolean;
  set: (on: boolean) => void;
  sync: (next: EditorState) => void;
  fresh: (answer: { issues: AuditIssue[] }, site: string, revision: number) => void;
}

interface Answer { site: string; revision: number; issues: AuditIssue[] }
interface Dot { id: string; name: string; rank: number; messages: string[] }

const KEY = 'formweb.audit-markers';
const GAP_MS = 600;
const SETTLE_MS = 150;
const CAP = 200;
const MAX_ISSUES = 5000;
const MAX_TEXT = 300;
const MAX_LINES = 20;
const MAX_NAME = 80;
const SIZE = 20;
const GONE_MS = 5000;
const RANK: Record<string, number> = { error: 3, warning: 2, info: 1 };
const SHAPE = ['info', 'info', 'warning', 'error'];

function remembered(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

function remember(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { }
}

const cut = (value: string, max: number): string => value.length > max ? value.slice(0, max - 1) + '…' : value;

export function installAuditMarkers(host: AuditMarkersHost): AuditMarkers {
  let on = remembered();
  let current: EditorState | null = null;
  let answer: Answer | null = null;
  let failed = false;
  let failedAt = '';
  let picked = '';
  let pickedAt = 0;
  let line = '';
  let said = false;
  let out = false;
  let due = false;
  let timer = 0;
  let last = -GAP_MS;
  let frame = 0;
  let doc: Document | null = null;
  let shown: Dot[] = [];
  let total = 0;
  let open = '';
  const found = new Map<string, HTMLElement>();
  const placed = new Map<string, string>();
  const map = new FrameMap(host.frame, host.stage);

  const layer = element('div', 'fw-audit-marks');
  layer.hidden = true;
  const pop = element('div', 'fw-audit-pop');
  pop.hidden = true;
  pop.setAttribute('role', 'group');
  const popList = element('ul', 'fw-audit-pop-list');
  pop.append(popList);
  host.overlay.append(layer, pop);

  const box = element('input');
  box.type = 'checkbox';
  box.checked = on;
  box.dataset.ownKeys = '';
  const boxLabel = element('label', 'checkbox-field');
  boxLabel.append(box, element('span', '', 'Show audit markers on the page'));
  const about = element('p', 'micro', 'Puts a small marker on each element of this page that has an issue. Markers show on the page when this dialog is closed. Click a marker to select the element.');
  const note = element('p', 'micro fw-audit-note');
  const row = element('div', 'fw-audit-switch');
  row.append(boxLabel, about, note);
  box.addEventListener('change', () => set(box.checked));

  const valid = (): boolean => !!answer && !!current && answer.site === current.site.id && answer.revision === current.revision;

  function pageNodes(): Map<string, number> {
    const order = new Map<string, number>();
    const site = current?.site;
    const page = site?.pages.find(item => item.id === host.page());
    if (!site || !page) return order;
    const stack = [page.root];
    while (stack.length) {
      const id = stack.pop()!;
      if (order.has(id) || !site.nodes[id]) continue;
      order.set(id, order.size);
      const kids = site.nodes[id].children;
      for (let index = kids.length - 1; index >= 0; index--) stack.push(kids[index]);
    }
    return order;
  }

  function collect(): void {
    if (!answer || !current) { shown = []; total = 0; return; }
    const order = pageNodes();
    const dots = new Map<string, Dot>();
    for (const issue of answer.issues) {
      const id = typeof issue.node === 'string' ? issue.node : '';
      if (!id || !order.has(id)) continue;
      let dot = dots.get(id);
      if (!dot) { dot = { id, name: cut(current.site.nodes[id].name || current.site.nodes[id].tag, MAX_NAME), rank: 0, messages: [] }; dots.set(id, dot); }
      dot.rank = Math.max(dot.rank, RANK[issue.severity] ?? 1);
      dot.messages.push(cut(String(issue.message ?? ''), MAX_TEXT));
    }
    const all = [...dots.values()].sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    total = all.length;
    shown = all.slice(0, CAP);
  }

  function describe(): void {
    if (!answer) { labelPieces(note, []); return; }
    const loose = answer.issues.filter(issue => !issue.node).length;
    const parts: Piece[] = [];
    if (loose === 1) parts.push({ en: '1 issue has no element, so it has no marker.' });
    else if (loose) parts.push({ en: '{0} issues have no element, so they have no marker.', values: [loose] });
    if (total > CAP) { if (parts.length) parts.push(' '); parts.push({ en: 'Markers are drawn on the first {0} of {1} elements with issues on this page.', values: [CAP, total] }); }
    labelPieces(note, parts);
  }

  const focused = (): HTMLElement | null => {
    const at = document.activeElement;
    return at instanceof HTMLElement && layer.contains(at) ? at : null;
  };

  function rescue(): void {
    if (!focused()) return;
    for (const target of host.rescue()) {
      if (!target?.isConnected || !target.getClientRects().length || (target as HTMLButtonElement).disabled) continue;
      target.focus({ preventScroll: true });
      if (document.activeElement === target) return;
    }
  }

  function close(): void {
    open = '';
    if (!pop.hidden) pop.hidden = true;
  }

  function fill(): void {
    const keep = focused();
    const next = new Set(shown.map(dot => dot.id));
    if (keep && !next.has(keep.dataset.key || '')) rescue();
    keyed(layer, shown, dot => dot.id, () => {
      const node = element('button', 'fw-audit-dot');
      node.type = 'button';
      node.hidden = true;
      node.dataset.ownKeys = '';
      node.append(element('span', 'fw-audit-count'));
      node.addEventListener('click', () => activate(node.dataset.key || ''));
      node.addEventListener('keydown', event => { if (event.key === 'Escape' && open) { event.preventDefault(); close(); } });
      return node;
    }, (node, dot) => {
      const shape = SHAPE[dot.rank] || 'info';
      if (node.dataset.severity !== shape) node.dataset.severity = shape;
      text(node.firstElementChild as HTMLElement, String(dot.messages.length));
      if (dot.messages.length === 1) labelAttr(node, 'aria-label', '1 issue on {0}', [dot.name]);
      else labelAttr(node, 'aria-label', '{0} issues on {1}', [dot.messages.length, dot.name]);
      const tip = dot.messages.slice(0, MAX_LINES).join('\n');
      if (node.title !== tip) node.title = tip;
    });
    for (const id of [...placed.keys()]) if (!next.has(id)) placed.delete(id);
    if (keep?.isConnected && document.activeElement !== keep) keep.focus({ preventScroll: true });
    if (open) {
      const dot = shown.find(item => item.id === open);
      if (!dot || dot.messages.length < 2) close(); else list(dot);
    }
  }

  function list(dot: Dot): void {
    labelAttr(pop, 'aria-label', 'Issues on {0}', [dot.name]);
    keyed(popList, dot.messages.slice(0, MAX_LINES).map((message, index) => ({ message, key: String(index) })), item => item.key, () => element('li'), (node, item) => text(node, item.message));
  }

  function activate(id: string): void {
    const dot = shown.find(item => item.id === id);
    if (!dot || blocked()) return;
    if (!current?.site.nodes[id]) {
      shown = shown.filter(item => item.id !== id);
      fill();
      place();
      return;
    }
    line = host.pick(id, dot.messages[0] || '', () => activate(id));
    picked = id;
    pickedAt = performance.now();
    const after = shown.find(item => item.id === id);
    if (after && after.messages.length > 1) {
      open = id;
      list(after);
      if (pop.hidden) pop.hidden = false;
    } else close();
    place();
  }

  function blocked(): boolean {
    if (!on || !answer || failed || !doc || answer.site !== current?.site.id) return true;
    if (!host.editing() || host.busy() || !host.dialog.hidden) return true;
    const html = doc.documentElement;
    if (html.hasAttribute('data-fw-dragging') || html.hasAttribute('data-fw-holding') || document.body.classList.contains('fw-canvas-dragging')) return true;
    return !!doc.querySelector('[contenteditable="true"]');
  }

  function resolve(id: string): HTMLElement | null {
    const cached = found.get(id);
    if (cached?.isConnected) return cached;
    found.delete(id);
    if (!doc) return null;
    for (const node of doc.querySelectorAll<HTMLElement>(`[data-fw-id="${CSS.escape(id)}"]`)) {
      if (node.dataset.fwKey?.endsWith(':list')) continue;
      if (node.getClientRects().length || node.style.display === 'contents') { found.set(id, node); return node; }
      const poster = node.querySelector<HTMLElement>(':scope>[data-fw-poster=script]');
      if (poster?.getClientRects().length) { found.set(id, poster); return poster; }
    }
    return null;
  }

  function place(): void {
    if (blocked()) {
      rescue();
      close();
      if (!layer.hidden) layer.hidden = true;
      return;
    }
    const still = map.still();
    const seen = map.visible();
    const room = host.stage.getBoundingClientRect();
    const active = focused();
    const nodes = [...layer.children] as HTMLElement[];
    const spots = nodes.map(node => {
      const at = resolve(node.dataset.key || '');
      const rect: Box | null = at ? bounds(at) : null;
      if (!rect) return '';
      const corner = still.toParent(rect.left + rect.width, rect.top);
      if (corner.x < seen.left - 0.5 || corner.y < seen.top - 0.5 || corner.x > seen.left + seen.width + 0.5 || corner.y > seen.top + seen.height + 0.5) return '';
      const left = Math.round(corner.x) - SIZE / 2, top = Math.round(corner.y) - SIZE / 2;
      return left >= room.left && top >= room.top && left + SIZE <= room.right && top + SIZE <= room.bottom ? `${left},${top}` : '';
    });
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index], id = node.dataset.key || '', spot = spots[index];
      if (!spot) {
        if (node === active) rescue();
        if (id === open) close();
        if (!node.hidden) node.hidden = true;
        continue;
      }
      if (placed.get(id) !== spot) {
        placed.set(id, spot);
        const [left, top] = spot.split(',');
        node.style.transform = `translate(${left}px, ${top}px)`;
      }
      if (node.hidden) node.hidden = false;
    }
    if (layer.hidden) layer.hidden = false;
    if (open) aim();
  }

  function aim(): void {
    const anchor = [...layer.children].find(node => (node as HTMLElement).dataset.key === open) as HTMLElement | undefined;
    if (!anchor || anchor.hidden) { close(); return; }
    const spot = anchor.getBoundingClientRect();
    const own = pop.getBoundingClientRect();
    const margin = 8;
    let left = spot.right - own.width;
    let top = spot.bottom + 4;
    if (top + own.height > window.innerHeight - margin && spot.top - 4 - own.height >= margin) top = spot.top - 4 - own.height;
    left = Math.max(margin, Math.min(left, window.innerWidth - margin - own.width));
    top = Math.max(margin, Math.min(top, window.innerHeight - margin - own.height));
    const next = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    if (pop.style.transform !== next) pop.style.transform = next;
  }

  function poke(): void {
    if (!on || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; place(); });
  }

  function paint(): void {
    collect();
    describe();
    found.clear();
    fill();
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    place();
  }

  function want(): void {
    if (!on) return;
    due = true;
    if (timer || out) return;
    timer = window.setTimeout(ask, Math.max(SETTLE_MS, last + GAP_MS - performance.now()));
  }

  async function ask(): Promise<void> {
    timer = 0;
    if (!on || !due || out || !current) return;
    due = false;
    out = true;
    last = performance.now();
    const site = current.site.id, revision = current.revision, page = host.page();
    let result: { issues?: AuditIssue[] };
    try {
      result = await request<{ issues: AuditIssue[] }>('/api/audit');
    } catch {
      out = false;
      if (!on) return;
      failed = true;
      failedAt = `${site}:${revision}`;
      paint();
      if (!said) { said = true; host.status('The audit could not be run, so the audit markers are hidden.', true); }
      return;
    }
    out = false;
    if (!on) return;
    if (!current || current.site.id !== site || current.revision !== revision || host.page() !== page) { want(); return; }
    take(result, site, revision);
    if (due) want();
  }

  function take(result: { issues?: AuditIssue[] }, site: string, revision: number): void {
    const issues = Array.isArray(result?.issues) ? result.issues.slice(0, MAX_ISSUES) : [];
    answer = { site, revision, issues };
    failed = false;
    failedAt = '';
    said = false;
    paint();
  }

  function set(next: boolean): void {
    if (next === on) { box.checked = on; return; }
    on = next;
    box.checked = on;
    remember(on);
    if (on) {
      if (valid()) paint(); else { answer = null; failed = false; failedAt = ''; paint(); want(); }
    } else {
      if (timer) { clearTimeout(timer); timer = 0; }
      due = false;
      rescue();
      close();
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      if (!layer.hidden) layer.hidden = true;
    }
    host.status(on ? 'Audit markers are on: each element of this page with an issue shows a marker.' : 'Audit markers are off.');
  }

  function sync(next: EditorState): void {
    current = next;
    if (picked && !next.site.nodes[picked] && line && performance.now() - pickedAt < GONE_MS) host.unsay(line);
    if (picked && !next.site.nodes[picked]) picked = '';
    if (!on) return;
    if (!valid() && failedAt !== `${next.site.id}:${next.revision}`) want();
    if (answer) paint(); else poke();
  }

  function fresh(result: { issues: AuditIssue[] }, site: string, revision: number): void {
    if (!current) return;
    if (current.site.id === site && current.revision === revision) { take(result, site, revision); return; }
    failedAt = '';
    want();
  }

  const watch = (event: Event): void => {
    if (!on) return;
    if (event.type === 'pointermove' && !(event as PointerEvent).buttons) return;
    if (open && event.type === 'pointerdown') {
      const target = event.target as Node | null;
      if (!target || !(pop.contains(target) || layer.contains(target))) close();
    }
    if (open && event.type === 'focusin' && (event.target as HTMLElement | null)?.dataset?.key !== open) close();
    poke();
  };
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'pointermove', 'keydown', 'keyup', 'click', 'focusin', 'input', 'change', 'scroll', 'transitionend']) window.addEventListener(type, watch, { capture: true, passive: true });
  const now = (): void => { if (on) place(); };
  window.addEventListener('resize', now);
  const sized = new ResizeObserver(now);
  sized.observe(host.stage);
  sized.observe(host.frame);
  new MutationObserver(poke).observe(host.dialog, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(poke).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  void host.loaded().then(() => {
    const at = host.frame.contentDocument;
    const view = host.frame.contentWindow as (Window & typeof globalThis) | null;
    if (!at || !view) return;
    doc = at;
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'pointermove', 'dblclick', 'focusout', 'keyup', 'scroll', 'load']) at.addEventListener(type, watch, { capture: true, passive: true });
    new view.ResizeObserver(now).observe(at.documentElement);
    new view.MutationObserver(poke).observe(at.documentElement, { attributes: true, attributeFilter: ['data-fw-dragging', 'data-fw-holding'] });
    poke();
  });

  return { row, enabled: () => on, set, sync, fresh };
}
