import { command, upload } from '../../api';
import { element, value } from '../../ui/dom';
import { t } from '../../i18n';
import type { InspectorContext } from './context';
import { buttonOf, fieldOf, labeled } from './labeled';
import type { EditorState, SiteNode } from '../../types';

interface SectionRecord { enabled?: boolean; html?: string; css?: string; js?: string; module?: boolean; poster?: string }
interface CodeGroup { sections?: Record<string, SectionRecord>; allowSections?: boolean }

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';

function codeGroup(next: EditorState): CodeGroup {
  return (next.site.extensions?.code || {}) as CodeGroup;
}

function picker(accept: string): HTMLInputElement {
  const node = element('input');
  node.type = 'file';
  node.accept = accept;
  node.hidden = true;
  document.body.append(node);
  return node;
}

function area(): HTMLTextAreaElement {
  const node = element('textarea');
  node.spellcheck = false;
  node.rows = 6;
  node.style.fontFamily = 'var(--font-mono, "JetBrains Mono", monospace)';
  node.style.whiteSpace = 'pre';
  return node;
}

export function parseImport(source: string): { html: string; css: string; js: string } {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const css = Array.from(doc.querySelectorAll('style')).map(node => node.textContent || '');
  const js = Array.from(doc.querySelectorAll('script:not([src])')).map(node => (node.textContent || '') + '\n');
  const head = Array.from(doc.head.querySelectorAll('link[rel~="stylesheet"], script[src]')).map(node => node.outerHTML);
  doc.querySelectorAll('style, script:not([src])').forEach(node => node.remove());
  doc.head.querySelectorAll('link[rel~="stylesheet"], script[src]').forEach(node => node.remove());
  return { html: [...head, doc.body.innerHTML.trim()].filter(Boolean).join('\n'), css: css.join('\n'), js: js.join('') };
}

export function installCodeSection(ctx: InspectorContext): { update(next: EditorState, node: SiteNode): void } {
  const block = ctx.section(ctx.panes.content, 'Code section');
  const body = element('div', 'fw-ext-group');
  block.append(body);

  let latest: EditorState | undefined;
  let current: SiteNode | undefined;

  const allowBox = element('input');
  allowBox.type = 'checkbox';
  allowBox.addEventListener('change', () => void ctx.run(async () => {
    await command('code.sections.allow', { enabled: allowBox.checked });
  }));
  const allowWrap = element('label', 'checkbox-field');
  allowWrap.append(allowBox, labeled('span', '', 'Allow code sections on this site'));
  const allowHint = labeled('p', 'micro', 'Code sections run their own HTML, CSS and JavaScript in Preview and in exports.');

  const nodeBox = element('div', 'fw-ext-group');
  const childHint = labeled('p', 'micro', 'A code section needs an element with no children. Remove or move the children first.');
  const enableBox = element('input');
  enableBox.type = 'checkbox';
  const enableWrap = element('label', 'checkbox-field');
  enableWrap.append(enableBox, labeled('span', '', 'Enable'));

  const htmlArea = area();
  const cssArea = area();
  const jsArea = area();
  const moduleBox = element('input');
  moduleBox.type = 'checkbox';
  const moduleWrap = element('label', 'checkbox-field');
  moduleWrap.append(moduleBox, labeled('span', '', 'Module'));
  const posterInput = ctx.input('/api/assets/...');
  const posterFile = picker(IMAGE_ACCEPT);
  const importFile = picker('text/html,.html,.htm');

  const editBox = element('div', 'fw-ext-group');
  const actions = element('div', 'fw-ext-actions');
  const posterButton = buttonOf(ctx, 'Upload poster', 'image', () => posterFile.click());
  const importButton = buttonOf(ctx, 'Import HTML file', 'upload', () => importFile.click());
  const removeButton = buttonOf(ctx, 'Remove', 'trash', () => void ctx.run(async () => {
    if (!current) return;
    await command('code.section.remove', { node: current.id });
    ctx.status(t('Code section removed.'));
  }));
  const convertButton = buttonOf(ctx, 'Convert to editable elements...', 'layers');
  convertButton.dataset.cmd = 'library.convert-section';
  actions.append(convertButton, posterButton, importButton, removeButton);
  editBox.append(
    fieldOf(ctx, 'HTML', htmlArea, true),
    fieldOf(ctx, 'CSS', cssArea, true),
    fieldOf(ctx, 'JavaScript', jsArea, true),
    moduleWrap,
    fieldOf(ctx, 'Poster image', posterInput, true),
    actions
  );
  nodeBox.append(childHint, enableWrap, editBox);
  body.append(allowWrap, allowHint, nodeBox);
  nodeBox.hidden = true;
  editBox.hidden = true;
  childHint.hidden = true;

  function record(): SectionRecord {
    return (current && latest ? codeGroup(latest).sections?.[current.id] : undefined) || { enabled: true };
  }

  async function commit(patch: SectionRecord): Promise<void> {
    if (!current) return;
    const merged: Record<string, unknown> = { ...record(), ...patch };
    for (const key of Object.keys(merged)) {
      if (merged[key] === '' || merged[key] === undefined) delete merged[key];
    }
    if (merged.module === false) delete merged.module;
    if (merged.enabled === undefined) merged.enabled = true;
    await command('code.section.set', { node: current.id, value: merged });
  }

  enableBox.addEventListener('change', () => void ctx.run(() => commit({ enabled: enableBox.checked })));
  htmlArea.addEventListener('change', () => void ctx.run(() => commit({ html: htmlArea.value })));
  cssArea.addEventListener('change', () => void ctx.run(() => commit({ css: cssArea.value })));
  jsArea.addEventListener('change', () => void ctx.run(() => commit({ js: jsArea.value })));
  moduleBox.addEventListener('change', () => void ctx.run(() => commit({ module: moduleBox.checked })));
  posterInput.addEventListener('change', () => void ctx.run(() => commit({ poster: posterInput.value.trim() })));
  posterFile.addEventListener('change', () => void ctx.run(async () => {
    const file = posterFile.files?.[0];
    posterFile.value = '';
    if (!file) return;
    ctx.status(t('Uploading poster...'));
    const asset = await upload(file);
    await commit({ poster: asset.url });
    ctx.status(t('Poster attached.'));
  }));
  importFile.addEventListener('change', () => void ctx.run(async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    const parsed = parseImport(await file.text());
    await commit({ html: parsed.html, css: parsed.css, js: parsed.js });
    ctx.status(t('HTML file imported.'));
  }));

  function setDisabled(control: HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement, disabled: boolean): void {
    if (control.disabled !== disabled) control.disabled = disabled;
  }

  return {
    update(next, node) {
      latest = next;
      current = node;
      const group = codeGroup(next);
      const allowed = !!group.allowSections;
      if (allowBox.checked !== allowed) allowBox.checked = allowed;
      if (nodeBox.hidden === allowed) nodeBox.hidden = !allowed;
      if (!allowed) return;
      const blocked = node.children.length > 0;
      const stored = group.sections?.[node.id];
      if (childHint.hidden === blocked) childHint.hidden = !blocked;
      const on = !!stored && stored.enabled !== false;
      if (enableBox.checked !== on) enableBox.checked = on;
      setDisabled(enableBox, blocked);
      if (editBox.hidden === !!stored) editBox.hidden = !stored;
      if (!stored) return;
      value(htmlArea, stored.html || '');
      value(cssArea, stored.css || '');
      value(jsArea, stored.js || '');
      if (moduleBox.checked !== !!stored.module) moduleBox.checked = !!stored.module;
      value(posterInput, stored.poster || '');
      for (const control of [htmlArea, cssArea, jsArea, moduleBox, posterInput, posterButton, importButton]) setDisabled(control, blocked);
      setDisabled(convertButton, blocked || !stored.html?.trim());
    }
  };
}
