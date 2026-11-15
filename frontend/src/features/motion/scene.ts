import { element, options, value } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { t } from '../../i18n';
import type { EditorState, SiteNode } from '../../types';
import type { MotionContext, MotionEditor, TrackList } from './context';
import { readScenes, type Keyframe, type Scene, type SceneTrack } from './interpolate';
import '../../styles/motion-scene.css';

const GAP = 0.01;

interface Row {
  list: TrackList;
  index: number;
  el: HTMLElement;
  node: HTMLSelectElement;
  stagger?: HTMLInputElement;
  easing: { set(value: string): void };
  track: HTMLElement;
  rail: HTMLElement;
  dots: HTMLButtonElement[];
  detail: HTMLElement;
  at: HTMLInputElement;
  styles: { set(styles: Record<string, string>): void };
  styleKey: string;
  data?: SceneTrack;
}

const percent = (at: number): string => `${Math.round(at * 10000) / 100}%`;
const snap = (at: number): number => Math.round(at * 1000) / 1000;

export function installScene(ctx: MotionContext, container: HTMLElement): MotionEditor {
  const block = ctx.section(container, t('Scene'), t('Scroll-driven'));
  const empty = element('div', 'fw-scene-empty');
  const emptyHint = element('p', 'micro', t('Pin a child of this element and drive its children with scroll progress.'));
  const create = ctx.button(t('Add scene'), 'plus');
  empty.append(emptyHint, create);
  const body = element('div', 'fw-scene');
  body.hidden = true;
  block.append(empty, body);

  let latest: EditorState | undefined;
  let key = '';
  let sel: { list: TrackList; row: number; k: number } | null = null;
  let dragging: { list: TrackList; row: number; k: number } | null = null;
  const rows: Record<TrackList, Row[]> = { tracks: [], distribute: [] };

  const stage = ctx.select([]);
  stage.dataset.field = 'scene.stage';
  const length = ctx.input('300');
  length.type = 'number';
  length.min = '100';
  length.max = '2000';
  length.step = '10';
  length.dataset.field = 'scene.length';
  const offset = ctx.input('0px');
  offset.dataset.field = 'scene.offset';
  const smoothing = ctx.input('0');
  smoothing.type = 'number';
  smoothing.min = '0';
  smoothing.max = '2000';
  smoothing.step = '10';
  smoothing.dataset.field = 'scene.smoothing';
  const reduced = ctx.input('1');
  reduced.type = 'number';
  reduced.min = '0';
  reduced.max = '1';
  reduced.step = '0.1';
  reduced.dataset.field = 'scene.reducedAt';
  const progressVar = element('input');
  progressVar.type = 'checkbox';
  progressVar.dataset.field = 'scene.progressVar';
  const progressLabel = element('label', 'checkbox-field');
  progressLabel.append(progressVar, element('span', '', t('Write the progress variable')));
  const grid = element('div', 'form-grid');
  grid.append(
    ctx.field(t('Stage'), stage, true),
    ctx.field(t('Length (svh)'), length),
    ctx.field(t('Sticky offset'), offset),
    ctx.field(t('Smoothing (ms)'), smoothing),
    ctx.field(t('Reduced motion frame'), reduced),
    progressLabel
  );
  const removeScene = ctx.button(t('Remove scene'), 'trash', () => ctx.run(() => ctx.remove('scenes', key)));
  const sceneActions = element('div', 'fw-ext-actions');
  sceneActions.append(removeScene);

  const lists: Record<TrackList, HTMLElement> = { tracks: element('div', 'fw-scene-list'), distribute: element('div', 'fw-scene-list') };
  const addTrack = ctx.button(t('Add track'), 'plus', () => addEntry('tracks'));
  const addDistribute = ctx.button(t('Add distribute'), 'plus', () => addEntry('distribute'));
  const trackHead = element('div', 'fw-scene-list-head');
  trackHead.append(element('span', '', t('Tracks')), addTrack);
  const distributeHead = element('div', 'fw-scene-list-head');
  distributeHead.append(element('span', '', t('Distribute')), addDistribute);
  body.append(grid, trackHead, lists.tracks, distributeHead, lists.distribute, sceneActions);

  const scene = (): Scene | undefined => (latest ? readScenes(latest.site)[key] : undefined);

  function subtree(root: string): { id: string; name: string }[] {
    const out: { id: string; name: string }[] = [];
    if (!latest) return out;
    const walk = (id: string, depth: number): void => {
      const node = latest!.site.nodes[id];
      if (!node || depth > 60) return;
      out.push({ id, name: node.name || node.tag });
      node.children.forEach(child => walk(child, depth + 1));
    };
    walk(root, 0);
    return out;
  }

  function save(patch: Partial<Scene>): Promise<void> {
    const current = scene();
    if (!current) return Promise.resolve();
    const next: Record<string, unknown> = { ...current, ...patch };
    for (const name of Object.keys(next)) if (next[name] === undefined) delete next[name];
    return ctx.set('scenes', key, next);
  }

  function addEntry(list: TrackList): void {
    const current = scene();
    if (!current || !latest) return;
    const target = current.stage || key;
    const entry: Record<string, unknown> = list === 'tracks'
      ? { node: target, keyframes: [{ at: 0, styles: { opacity: '0' } }, { at: 1, styles: { opacity: '1' } }], easing: 'linear' }
      : { parent: target, stagger: Math.min(0.08, 0.5 / Math.max(1, (latest.site.nodes[target]?.children.length || 2) - 1)), keyframes: [{ at: 0, styles: { opacity: '0' } }, { at: 1, styles: { opacity: '1' } }], easing: 'linear' };
    void ctx.run(() => ctx.track(key, list, (current[list] || []).length, entry));
  }

  function commit(row: Row, next: SceneTrack | null): void {
    void ctx.run(() => ctx.track(key, row.list, row.index, next));
  }

  function withKeyframes(row: Row, keyframes: Keyframe[]): SceneTrack {
    return { ...row.data!, keyframes };
  }

  function select(row: Row, k: number): void {
    if (sel && sel.list === row.list && sel.row === row.index && sel.k === k) return;
    const previous = sel;
    sel = { list: row.list, row: row.index, k };
    if (previous) {
      const old = rows[previous.list][previous.row];
      if (old) paint(old);
    }
    paint(row);
  }

  function bounds(row: Row, k: number): [number, number] {
    const kfs = row.data?.keyframes || [];
    return [(kfs[k - 1]?.at ?? 0) + GAP, (kfs[k + 1]?.at ?? 1) - GAP];
  }

  function moveTo(row: Row, k: number, at: number): void {
    const kfs = row.data?.keyframes || [];
    if (k <= 0 || k >= kfs.length - 1) return;
    const [lo, hi] = bounds(row, k);
    const clamped = snap(Math.min(hi, Math.max(lo, at)));
    if (clamped === kfs[k].at) return;
    const next = kfs.map((kf, i) => (i === k ? { ...kf, at: clamped } : kf));
    commit(row, withKeyframes(row, next));
  }

  function createRow(list: TrackList, index: number): Row {
    const el = element('div', 'fw-scene-row');
    const head = element('div', 'fw-scene-row-head');
    const node = ctx.select([]);
    node.setAttribute('aria-label', list === 'tracks' ? t('Track node') : t('Parent node'));
    const remove = ctx.button('', 'trash');
    remove.title = list === 'tracks' ? t('Remove track') : t('Remove distribute row');
    remove.setAttribute('aria-label', remove.title);
    head.append(ctx.field(list === 'tracks' ? t('Node') : t('Parent'), node), remove);
    el.append(head);
    const opts = element('div', 'fw-scene-row-opts');
    let stagger: HTMLInputElement | undefined;
    if (list === 'distribute') {
      stagger = ctx.input('0.08');
      stagger.type = 'number';
      stagger.min = '0';
      stagger.max = '1';
      stagger.step = '0.01';
      opts.append(ctx.field(t('Stagger'), stagger));
    }
    const easingHost = element('div', 'field');
    opts.append(easingHost);
    el.append(opts);
    const rail = element('div', 'fw-scene-rail');
    rail.setAttribute('role', 'group');
    rail.setAttribute('data-no-keys', '');
    rail.setAttribute('aria-label', t('Keyframes'));
    const track = element('div', 'fw-scene-track');
    rail.append(track);
    const scale = element('div', 'fw-scene-scale');
    scale.append(element('span', '', '0'), element('span', '', '50'), element('span', '', '100'));
    const detail = element('div', 'fw-scene-detail');
    detail.hidden = true;
    const at = ctx.input('0');
    at.type = 'number';
    at.min = '0';
    at.max = '100';
    at.step = '1';
    const drop = ctx.button('', 'close');
    drop.title = t('Remove keyframe');
    drop.setAttribute('aria-label', drop.title);
    const detailHead = element('div', 'fw-scene-detail-head');
    detailHead.append(ctx.field(t('Position (%)'), at), drop);
    const styleHost = element('div', 'fw-scene-styles');
    detail.append(detailHead, styleHost);
    el.append(rail, scale, detail);
    lists[list].append(el);

    const row = {} as Row;
    const styles = ctx.styleRows(styleHost, {}, next => {
      const k = sel && sel.list === row.list && sel.row === row.index ? sel.k : -1;
      const kfs = row.data?.keyframes || [];
      if (k < 0 || !kfs[k]) return;
      commit(row, withKeyframes(row, kfs.map((kf, i) => (i === k ? { ...kf, styles: next } : kf))));
    });
    const easing = ctx.easing(easingHost, t('Easing'), 'linear', next => { if (row.data) commit(row, { ...row.data, easing: next }); });
    Object.assign(row, { list, index, el, node, stagger, easing, track, rail, dots: [], detail, at, styles, styleKey: '' });

    node.addEventListener('change', () => {
      if (row.data) commit(row, list === 'tracks' ? { ...row.data, node: node.value } : { ...row.data, parent: node.value });
    });
    stagger?.addEventListener('change', () => {
      if (row.data) commit(row, { ...row.data, stagger: Math.min(1, Math.max(0, Number(stagger!.value) || 0)) });
    });
    remove.addEventListener('click', () => commit(row, null));
    at.addEventListener('change', () => {
      if (sel && sel.list === row.list && sel.row === row.index) moveTo(row, sel.k, Number(at.value) / 100);
    });
    drop.addEventListener('click', () => removeDot(row));
    track.addEventListener('click', event => {
      if (!row.data) return;
      const box = track.getBoundingClientRect();
      if (box.width <= 0) return;
      const pos = snap(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
      const kfs = row.data.keyframes || [];
      if (pos <= GAP / 2 || pos >= 1 - GAP / 2 || kfs.some(kf => Math.abs(kf.at - pos) < GAP)) return;
      let nearest = kfs[0];
      for (const kf of kfs) if (Math.abs(kf.at - pos) < Math.abs(nearest.at - pos)) nearest = kf;
      const next = [...kfs, { at: pos, styles: { ...(nearest?.styles || {}) } }].sort((a, b) => a.at - b.at);
      sel = { list: row.list, row: row.index, k: next.findIndex(kf => kf.at === pos) };
      commit(row, withKeyframes(row, next));
    });
    return row;
  }

  function removeDot(row: Row): void {
    const kfs = row.data?.keyframes || [];
    if (!sel || sel.list !== row.list || sel.row !== row.index) return;
    const k = sel.k;
    if (kfs.length <= 2 || k <= 0 || k >= kfs.length - 1) return;
    sel = { list: row.list, row: row.index, k: k - 1 };
    commit(row, withKeyframes(row, kfs.filter((_, i) => i !== k)));
  }

  function createDot(row: Row): HTMLButtonElement {
    const dot = element('button', 'fw-scene-dot');
    dot.type = 'button';
    dot.addEventListener('click', event => event.stopPropagation());
    dot.addEventListener('focus', () => { const k = row.dots.indexOf(dot); if (k >= 0) select(row, k); });
    dot.addEventListener('pointerdown', event => {
      event.stopPropagation();
      const k = row.dots.indexOf(dot);
      if (k < 0 || event.button !== 0) return;
      select(row, k);
      const kfs = row.data?.keyframes || [];
      if (k === 0 || k === kfs.length - 1) return;
      dot.setPointerCapture(event.pointerId);
      dragging = { list: row.list, row: row.index, k };
      event.preventDefault();
      dot.focus({ preventScroll: true });
    });
    dot.addEventListener('pointermove', event => {
      if (!dragging || !dot.hasPointerCapture(event.pointerId)) return;
      const box = row.track.getBoundingClientRect();
      if (box.width <= 0) return;
      const [lo, hi] = bounds(row, dragging.k);
      const at = snap(Math.min(hi, Math.max(lo, (event.clientX - box.left) / box.width)));
      dot.style.left = percent(at);
      row.at.value = String(Math.round(at * 100));
    });
    const finish = (event: PointerEvent, apply: boolean): void => {
      if (!dragging || !dot.hasPointerCapture(event.pointerId)) return;
      const k = dragging.k;
      dragging = null;
      dot.releasePointerCapture(event.pointerId);
      const kfs = row.data?.keyframes || [];
      const box = row.track.getBoundingClientRect();
      if (apply && box.width > 0) moveTo(row, k, (event.clientX - box.left) / box.width);
      else if (kfs[k]) dot.style.left = percent(kfs[k].at);
    };
    dot.addEventListener('pointerup', event => finish(event, true));
    dot.addEventListener('pointercancel', event => finish(event, false));
    dot.addEventListener('keydown', event => {
      const k = row.dots.indexOf(dot);
      const kfs = row.data?.keyframes || [];
      if (k < 0 || !kfs[k]) return;
      if (['ArrowLeft', 'ArrowRight', 'Delete', 'Backspace'].includes(event.key)) event.stopPropagation();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const step = (event.shiftKey ? 0.1 : 0.01) * (event.key === 'ArrowLeft' ? -1 : 1);
        moveTo(row, k, kfs[k].at + step);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        select(row, k);
        removeDot(row);
      }
    });
    row.track.append(dot);
    return dot;
  }

  function paint(row: Row): void {
    const data = row.data;
    const kfs = data?.keyframes || [];
    while (row.dots.length < kfs.length) row.dots.push(createDot(row));
    while (row.dots.length > kfs.length) row.dots.pop()!.remove();
    const picked = sel && sel.list === row.list && sel.row === row.index && sel.k < kfs.length ? sel.k : -1;
    row.dots.forEach((dot, i) => {
      const held = dragging && dragging.list === row.list && dragging.row === row.index && dragging.k === i;
      const left = percent(kfs[i].at);
      if (!held && dot.style.left !== left) dot.style.left = left;
      const label = t('Keyframe at {0} percent', [Math.round(kfs[i].at * 100)]);
      if (dot.getAttribute('aria-label') !== label) dot.setAttribute('aria-label', label);
      const fixed = i === 0 || i === kfs.length - 1;
      if (dot.hasAttribute('data-fixed') !== fixed) dot.toggleAttribute('data-fixed', fixed);
      const on = i === picked;
      if (dot.classList.contains('is-on') !== on) dot.classList.toggle('is-on', on);
    });
    const show = picked >= 0;
    if (row.detail.hidden === show) row.detail.hidden = !show;
    if (!show) { row.styleKey = ''; return; }
    const kf = kfs[picked];
    const fixed = picked === 0 || picked === kfs.length - 1;
    if (row.at.disabled !== fixed) row.at.disabled = fixed;
    value(row.at, String(Math.round(kf.at * 100)));
    const own = kf.styles || {};
    const styleKey = picked + JSON.stringify(own);
    if (row.styleKey !== styleKey) { row.styleKey = styleKey; row.styles.set(own); }
  }

  function sync(list: TrackList, entries: SceneTrack[], items: { id: string; name: string }[]): void {
    const pool = rows[list];
    while (pool.length < entries.length) pool.push(createRow(list, pool.length));
    while (pool.length > entries.length) pool.pop()!.el.remove();
    pool.forEach((row, i) => {
      const entry = entries[i];
      row.data = entry;
      const target = list === 'tracks' ? entry.node || '' : entry.parent || '';
      const choices = items.some(item => item.id === target) ? items : [...items, { id: target, name: target }];
      options(row.node, choices);
      value(row.node, target);
      if (row.stagger) value(row.stagger, String(entry.stagger ?? 0));
      row.easing.set(entry.easing || 'linear');
      paint(row);
    });
  }

  create.addEventListener('click', () => void ctx.run(() => {
    const node = latest?.site.nodes[key];
    const first = node?.children[0];
    if (!node || !first) return ctx.status(t('Add a child to pin first.'), true);
    return ctx.set('scenes', key, { stage: first, length: 300, tracks: [{ node: first, keyframes: [{ at: 0, styles: { opacity: '0' } }, { at: 1, styles: { opacity: '1' } }], easing: 'linear' }] });
  }));
  stage.addEventListener('change', () => void ctx.run(() => save({ stage: stage.value })));
  length.addEventListener('change', () => void ctx.run(() => save({ length: Math.min(2000, Math.max(100, Number(length.value) || 300)) })));
  offset.addEventListener('change', () => void ctx.run(() => save({ offset: offset.value.trim() || undefined })));
  smoothing.addEventListener('change', () => void ctx.run(() => save({ smoothing: Math.min(2000, Math.max(0, Number(smoothing.value) || 0)) })));
  reduced.addEventListener('change', () => void ctx.run(() => save({ reducedAt: Math.min(1, Math.max(0, Number(reduced.value) || 0)) })));
  progressVar.addEventListener('change', () => void ctx.run(() => save({ progressVar: progressVar.checked || undefined })));

  return {
    update(next: EditorState, node: SiteNode): void {
      latest = next;
      if (key !== node.id) { key = node.id; sel = null; }
      const current = scene();
      if (empty.hidden !== !!current) empty.hidden = !!current;
      if (body.hidden !== !current) body.hidden = !current;
      if (!current) {
        for (const list of ['tracks', 'distribute'] as TrackList[]) { rows[list].forEach(row => row.el.remove()); rows[list] = []; }
        return;
      }
      const items = subtree(key);
      const children = node.children.map(id => ({ id, name: next.site.nodes[id]?.name || next.site.nodes[id]?.tag || id }));
      const stageId = current.stage || '';
      options(stage, children.some(child => child.id === stageId) ? children : [...children, { id: stageId, name: stageId }]);
      value(stage, stageId);
      value(length, String(current.length ?? 300));
      value(offset, current.offset || '');
      value(smoothing, String(current.smoothing ?? 0));
      value(reduced, String(current.reducedAt ?? 1));
      if (progressVar.checked !== !!current.progressVar) progressVar.checked = !!current.progressVar;
      sync('tracks', current.tracks || [], items);
      sync('distribute', current.distribute || [], items);
    }
  };
}
