import { element, options, text, value } from '../../ui/dom';
import { label, labelAttr } from '../../i18n';
import type { EditorState, SiteNode } from '../../types';
import type { MotionContext, MotionEditor } from './context';
import { frameFor, readScenes } from './interpolate';
import '../../styles/motion-scene.css';

export function installScrubber(ctx: MotionContext): MotionEditor {
  const root = element('div', 'fw-scrub');
  root.hidden = true;
  root.setAttribute('role', 'group');
  labelAttr(root, 'aria-label', 'Scene scrubber');
  const pick = ctx.select([]);
  labelAttr(pick, 'aria-label', 'Scene');
  const range = element('input');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.step = '1';
  range.value = '0';
  labelAttr(range, 'aria-label', 'Scene progress');
  const readout = element('output', '', '0');
  const marks = element('div', 'fw-seg');
  const stops = [0, 50, 100].map(stop => {
    const button = element('button', 'fw-seg-btn', String(stop));
    button.type = 'button';
    button.addEventListener('click', () => { range.value = String(stop); apply(); });
    marks.append(button);
    return button;
  });
  const off = element('button', 'fw-seg-btn');
  label(off, 'Off');
  off.type = 'button';
  off.disabled = true;
  off.addEventListener('click', () => stop());
  marks.append(off);
  root.append(pick, range, readout, marks);
  ctx.anchors.stageBefore.before(root);

  let latest: EditorState | undefined;
  let pageId = '';
  let scene = '';
  let on = false;

  function stop(): void {
    if (on) { on = false; ctx.canvas.setMotionFrame(null); }
    if (!off.disabled) off.disabled = true;
    if (root.hasAttribute('data-on')) root.removeAttribute('data-on');
    stops.forEach(button => { if (button.classList.contains('is-on')) button.classList.remove('is-on'); });
  }

  function apply(): void {
    if (!latest || !scene) return;
    const progress = Number(range.value) / 100;
    text(readout, range.value);
    on = true;
    if (off.disabled) off.disabled = false;
    if (!root.hasAttribute('data-on')) root.setAttribute('data-on', '');
    stops.forEach(button => {
      const lit = Number(button.textContent) === Number(range.value);
      if (button.classList.contains('is-on') !== lit) button.classList.toggle('is-on', lit);
    });
    ctx.canvas.setMotionFrame(frameFor(latest.site, scene, progress));
  }

  range.addEventListener('input', apply);
  pick.addEventListener('change', () => { scene = pick.value; if (on) apply(); });

  function pageOf(next: EditorState, node: SiteNode): string {
    for (const page of next.site.pages) {
      const pending = [page.root];
      const seen = new Set<string>();
      while (pending.length) {
        const id = pending.pop()!;
        if (id === node.id) return page.id;
        if (seen.has(id)) continue;
        seen.add(id);
        pending.push(...(next.site.nodes[id]?.children || []));
      }
    }
    return '';
  }

  function scenesOn(next: EditorState, id: string): { id: string; name: string }[] {
    const page = next.site.pages.find(entry => entry.id === id);
    if (!page) return [];
    const scenes = readScenes(next.site);
    const found: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    const pending = [page.root];
    while (pending.length) {
      const nodeId = pending.shift()!;
      if (seen.has(nodeId)) continue;
      seen.add(nodeId);
      const data = next.site.nodes[nodeId];
      if (!data) continue;
      if (scenes[nodeId]) found.push({ id: nodeId, name: data.name || data.tag });
      pending.push(...data.children);
    }
    return found;
  }

  return {
    update(next: EditorState, node: SiteNode): void {
      latest = next;
      const here = pageOf(next, node) || pageId;
      if (here !== pageId) { pageId = here; stop(); scene = ''; }
      const found = scenesOn(next, pageId);
      if (!found.length) {
        stop();
        scene = '';
        if (!root.hidden) root.hidden = true;
        return;
      }
      if (!found.some(entry => entry.id === scene)) { if (scene) stop(); scene = found[0].id; }
      options(pick, found);
      value(pick, scene);
      const single = found.length < 2;
      if (root.hasAttribute('data-single') !== single) root.toggleAttribute('data-single', single);
      if (root.hidden) root.hidden = false;
      if (on) apply();
    }
  };
}
