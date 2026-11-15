import { command, commands, request, upload } from '../../api';
import { element, keyed, options, pieces, value } from '../../ui/dom';
import { label, labelText, t } from '../../i18n';
import type { Control, InspectorContext } from './context';
import { buttonOf, fieldOf, labeled, optionsOf, type Choice } from './labeled';
import type { EditorState, SiteNode } from '../../types';

interface PropSchema { type?: string; default?: unknown; required?: boolean }
interface CodeComponent { enabled?: boolean; mode?: string; poster?: string; posterLight?: string; javascript?: string; props?: Record<string, PropSchema> }
interface CodeInstance { component: string; props?: Record<string, unknown>; poster?: string; posterLight?: string }
interface CodeSectionRecord { enabled?: boolean; poster?: string }
interface CodeGroup { components?: Record<string, CodeComponent>; instances?: Record<string, CodeInstance>; sections?: Record<string, CodeSectionRecord>; allowSections?: boolean }
interface PropControl { type: string; input: Control; picker?: HTMLInputElement }
interface AssetItem { id: string; url: string; name: string; mime: string }

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
const HEX = /^#[0-9a-fA-F]{6}$/;
const MODE_LABEL: Record<string, string> = { isolated: 'Isolated frame', page: 'Runs in the page' };
const PAGE_HINT = 'The component\'s code runs with full access to the page. Use it only for code you trust.';

function codeGroup(next: EditorState): CodeGroup {
  return (next.site.extensions?.code || {}) as CodeGroup;
}

function schemaOf(component: CodeComponent | undefined): [string, PropSchema][] {
  return Object.entries(component?.props || {});
}

function defaultsOf(component: CodeComponent | undefined): Record<string, unknown> {
  const found: Record<string, unknown> = {};
  for (const [name, schema] of schemaOf(component)) if (schema.default !== undefined) found[name] = schema.default;
  return found;
}

function sizeLabel(component: CodeComponent): string {
  const bytes = new TextEncoder().encode(component.javascript || '').length;
  return (Math.round(bytes / 102.4) / 10) + ' KiB';
}

function posterLightMap(next: EditorState): Record<string, string> {
  const group = codeGroup(next);
  const map: Record<string, string> = {};
  for (const [node, instance] of Object.entries(group.instances || {})) {
    const light = instance.poster ? instance.posterLight : group.components?.[instance.component]?.posterLight;
    if (next.site.nodes[node] && light) map[node] = light;
  }
  return map;
}

function posterMap(next: EditorState): Record<string, string> {
  const group = codeGroup(next);
  const map: Record<string, string> = {};
  for (const [node, instance] of Object.entries(group.instances || {})) {
    if (next.site.nodes[node]) map[node] = instance.poster || group.components?.[instance.component]?.poster || '';
  }
  if (group.allowSections) {
    for (const [node, section] of Object.entries(group.sections || {})) {
      if (next.site.nodes[node] && section.enabled !== false) map[node] = section.poster || '';
    }
  }
  return map;
}

function picker(accept: string): HTMLInputElement {
  const node = element('input');
  node.type = 'file';
  node.accept = accept;
  node.hidden = true;
  document.body.append(node);
  return node;
}

export function installComponents(ctx: InspectorContext): { update(next: EditorState, node: SiteNode): void } {
  const block = ctx.section(ctx.panes.content, 'Component');
  const body = element('div', 'fw-ext-group');
  block.append(body);

  const insertBox = element('div', 'fw-ext-group');
  const insertSelect = ctx.select([]);
  const insertButton = buttonOf(ctx, 'Insert component', 'plus', () => void ctx.run(async () => {
    const id = insertSelect.value;
    const group = codeGroup(latest!);
    if (!id || !group.components?.[id]) throw new Error(t('Choose an installed component first.'));
    const made = ctx.makeNode('div', id, '', { width: '100%', 'aspect-ratio': '16 / 9' });
    await commands([
      { command: 'node.add', params: { parent: ctx.insertionParent(), node: made } },
      { command: 'code.instance.set', params: { node: made.id, value: { component: id, props: defaultsOf(group.components[id]) } } }
    ]);
    ctx.selectNode(made.id);
    ctx.showLayers();
    ctx.status(t('Component inserted. The operation is one undo step.'));
  }));
  const insertHint = labeled('p', 'micro', 'No code components are installed. Use Build new below.');
  insertBox.append(fieldOf(ctx, 'Component', insertSelect, true), element('div', 'fw-ext-actions'), insertHint);
  (insertBox.children[1] as HTMLElement).append(insertButton);

  const editBox = element('div', 'fw-ext-group');
  const componentSelect = ctx.select([]);
  const modeBadge = element('span', 'micro', '');
  const modeHint = labeled('p', 'micro', PAGE_HINT);
  const posterInput = ctx.input('/api/assets/...');
  const posterFile = picker(IMAGE_ACCEPT);
  const posterActions = element('div', 'fw-ext-actions');
  const posterUpload = buttonOf(ctx, 'Upload poster', 'image', () => posterFile.click());
  const posterClear = buttonOf(ctx, 'Clear poster', 'close', () => void ctx.run(() => commitPoster('')));
  posterActions.append(posterUpload, posterClear);
  const lightInput = ctx.input('/api/assets/...');
  const lightFile = picker(IMAGE_ACCEPT);
  const lightActions = element('div', 'fw-ext-actions');
  const lightUpload = buttonOf(ctx, 'Upload light poster', 'image', () => lightFile.click());
  const lightClear = buttonOf(ctx, 'Clear light poster', 'close', () => void ctx.run(() => commitPoster('', 'posterLight')));
  lightActions.append(lightUpload, lightClear);
  const propsForm = element('div', 'form-grid');
  const removeButton = buttonOf(ctx, 'Remove component', 'trash', () => void ctx.run(async () => {
    if (!current) return;
    await command('code.instance.remove', { node: current.id });
    ctx.status(t('Component removed from this element.'));
  }));
  const removeActions = element('div', 'fw-ext-actions');
  removeActions.append(removeButton);
  const modeRow = element('div', 'fw-ext-actions');
  modeRow.append(modeBadge);
  editBox.append(fieldOf(ctx, 'Component', componentSelect, true), modeRow, modeHint, fieldOf(ctx, 'Poster image', posterInput, true), posterActions, fieldOf(ctx, 'Light theme poster', lightInput, true), lightActions, propsForm, removeActions);
  editBox.hidden = true;
  body.append(insertBox, editBox);

  const listBlock = ctx.section(ctx.panes.content, 'Code components');
  const list = element('div', 'fw-ext-group');
  const emptyNote = labeled('p', 'micro', 'No code components are installed.');
  const listActions = element('div', 'fw-ext-actions');
  listActions.append(buttonOf(ctx, 'Build new', 'code', () => {
    document.dispatchEvent(new CustomEvent('fw:open-studio', { detail: { category: 'components', action: 'code-build' } }));
  }));
  listBlock.append(list, emptyNote, listActions);

  let latest: EditorState | undefined;
  let current: SiteNode | undefined;
  let schemaKey = '';
  let controls = new Map<string, PropControl>();
  let assets: AssetItem[] = [];
  let assetsLoaded = false;
  let postersKey = '';

  async function loadAssets(): Promise<void> {
    const result = await request<{ assets: AssetItem[] }>('/api/assets');
    assets = result.assets.filter(item => /^image\//.test(item.mime || ''));
    assetsLoaded = true;
    if (latest && current) refreshAssetSelects(latest, current);
  }

  function instanceOf(node: SiteNode | undefined, next: EditorState | undefined): CodeInstance | undefined {
    return node && next ? codeGroup(next).instances?.[node.id] : undefined;
  }

  async function commitProps(mutate: (props: Record<string, unknown>) => void): Promise<void> {
    const instance = instanceOf(current, latest);
    if (!current || !instance) return;
    const props = { ...(instance.props || {}) };
    mutate(props);
    await command('code.instance.set', { node: current.id, value: { ...instance, props } });
  }

  function sharedComponent(instance: CodeInstance, next: EditorState): boolean {
    const group = codeGroup(next);
    return Object.entries(group.instances || {}).filter(([node, other]) => other.component === instance.component && next.site.nodes[node]).length > 1;
  }

  async function commitPoster(url: string, field: 'poster' | 'posterLight' = 'poster'): Promise<void> {
    const instance = instanceOf(current, latest);
    if (!current || !instance || !latest) return;
    const group = codeGroup(latest);
    const component = group.components?.[instance.component];
    if (!component) return;
    if (instance.poster || sharedComponent(instance, latest)) {
      const own: CodeInstance = { ...instance };
      if (field === 'posterLight' && url && !own.poster && component.poster) own.poster = component.poster;
      if (url) own[field] = url;
      else delete own[field];
      if (!own.poster) delete own.posterLight;
      await command('code.instance.set', { node: current.id, value: own });
      return;
    }
    const next: CodeComponent = { ...component };
    if (url) next[field] = url;
    else delete next[field];
    await command('extension.set', { group: 'code', value: { ...group, components: { ...group.components, [instance.component]: next } } });
  }

  posterInput.addEventListener('change', () => void ctx.run(() => commitPoster(posterInput.value.trim())));
  posterFile.addEventListener('change', () => void ctx.run(async () => {
    const file = posterFile.files?.[0];
    posterFile.value = '';
    if (!file) return;
    ctx.status(t('Uploading poster...'));
    const asset = await upload(file);
    await commitPoster(asset.url);
    ctx.status(t('Poster attached.'));
  }));
  lightInput.addEventListener('change', () => void ctx.run(() => commitPoster(lightInput.value.trim(), 'posterLight')));
  lightFile.addEventListener('change', () => void ctx.run(async () => {
    const file = lightFile.files?.[0];
    lightFile.value = '';
    if (!file) return;
    ctx.status(t('Uploading light poster...'));
    const asset = await upload(file);
    await commitPoster(asset.url, 'posterLight');
    ctx.status(t('Light poster attached.'));
  }));
  componentSelect.addEventListener('change', () => void ctx.run(async () => {
    const instance = instanceOf(current, latest);
    if (!current || !instance || !latest) return;
    const target = codeGroup(latest).components?.[componentSelect.value];
    if (!target) return;
    const names = new Set(schemaOf(target).map(([name]) => name));
    const props: Record<string, unknown> = { ...defaultsOf(target) };
    for (const [name, found] of Object.entries(instance.props || {})) if (names.has(name)) props[name] = found;
    await command('code.instance.set', { node: current.id, value: { component: componentSelect.value, props } });
  }));

  function assetItems(selected: string): Choice[] {
    const items: Choice[] = [{ id: '', name: t('None'), en: 'None' }, ...assets.map(item => ({ id: item.url, name: item.name || item.id }))];
    if (selected && !items.some(item => item.id === selected)) items.push({ id: selected, name: selected });
    return items;
  }

  function refreshAssetSelects(next: EditorState, node: SiteNode): void {
    const instance = codeGroup(next).instances?.[node.id];
    for (const [name, found] of controls) {
      if (found.type !== 'asset') continue;
      const selected = String(instance?.props?.[name] ?? '');
      optionsOf(found.input as HTMLSelectElement, assetItems(selected));
      value(found.input, selected);
    }
  }

  function buildForm(component: CodeComponent): void {
    controls = new Map();
    const fields: HTMLElement[] = [];
    for (const [name, schema] of schemaOf(component)) {
      const type = schema.type || 'string';
      let input: Control;
      let extra: HTMLInputElement | undefined;
      if (type === 'boolean') {
        const box = element('input');
        box.type = 'checkbox';
        box.addEventListener('change', () => void ctx.run(() => commitProps(props => { props[name] = box.checked; })));
        input = box;
      } else if (type === 'number') {
        const field = element('input');
        field.type = 'number';
        field.addEventListener('change', () => void ctx.run(() => commitProps(props => {
          if (field.value.trim() === '') delete props[name];
          else props[name] = Number(field.value);
        })));
        input = field;
      } else if (type === 'json') {
        const area = element('textarea');
        area.spellcheck = false;
        area.style.fontFamily = 'var(--font-mono, "JetBrains Mono", monospace)';
        area.addEventListener('change', () => void ctx.run(async () => {
          let parsed: unknown;
          try { parsed = JSON.parse(area.value); } catch { throw new Error(t('This property needs valid JSON.')); }
          await commitProps(props => { props[name] = parsed; });
        }));
        input = area;
      } else if (type === 'asset') {
        const choice = ctx.select([]);
        optionsOf(choice, assetItems(''));
        choice.addEventListener('change', () => void ctx.run(() => commitProps(props => {
          if (choice.value) props[name] = choice.value;
          else delete props[name];
        })));
        const file = picker(IMAGE_ACCEPT);
        file.addEventListener('change', () => void ctx.run(async () => {
          const chosen = file.files?.[0];
          file.value = '';
          if (!chosen) return;
          ctx.status(t('Uploading image...'));
          const asset = await upload(chosen);
          await loadAssets();
          await commitProps(props => { props[name] = asset.url; });
          ctx.status(t('Image attached.'));
        }));
        input = choice;
        extra = file;
      } else {
        const field = element('input');
        field.type = 'text';
        field.addEventListener('change', () => void ctx.run(() => commitProps(props => {
          if (field.value === '') delete props[name];
          else props[name] = field.value;
        })));
        input = field;
        if (type === 'color') {
          field.placeholder = '#fa5d29';
          const swatch = element('input');
          swatch.type = 'color';
          swatch.addEventListener('change', () => void ctx.run(() => commitProps(props => { props[name] = swatch.value; })));
          extra = swatch;
        }
      }
      const wrap = ctx.field(name + (schema.required ? ' *' : ''), input, type === 'json' || type === 'asset' || type === 'color');
      if (extra && type === 'color') {
        extra.style.width = '48px';
        extra.style.flex = '0 0 auto';
        const row = element('div', 'fw-ext-actions');
        row.append(extra);
        wrap.append(row);
      } else if (extra) {
        const row = element('div', 'fw-ext-actions');
        row.append(buttonOf(ctx, 'Upload image', 'upload', () => extra!.click()));
        wrap.append(row);
      }
      controls.set(name, { type, input, picker: type === 'color' ? extra : undefined });
      fields.push(wrap);
    }
    propsForm.replaceChildren(...fields);
    if (!assetsLoaded && Array.from(controls.values()).some(found => found.type === 'asset')) void loadAssets().catch(() => undefined);
  }

  function fillValues(instance: CodeInstance, component: CodeComponent): void {
    const schema = new Map(schemaOf(component));
    for (const [name, found] of controls) {
      const stored = instance.props?.[name];
      const fallback = schema.get(name)?.default;
      const shown = stored === undefined ? fallback : stored;
      if (found.type === 'boolean') {
        const box = found.input as HTMLInputElement;
        const on = shown === true;
        if (box.checked !== on) box.checked = on;
      } else if (found.type === 'json') {
        value(found.input, shown === undefined ? '' : JSON.stringify(shown, null, 2));
      } else if (found.type === 'asset') {
        const choice = found.input as HTMLSelectElement;
        const selected = typeof shown === 'string' ? shown : '';
        if (document.activeElement !== choice) {
          optionsOf(choice, assetItems(selected));
          value(choice, selected);
        }
      } else {
        const label = shown === undefined || shown === null ? '' : String(shown);
        value(found.input, label);
        if (found.picker && document.activeElement !== found.picker) {
          const hex = HEX.test(label) ? label.toLowerCase() : '#000000';
          if (found.picker.value !== hex) found.picker.value = hex;
        }
      }
    }
  }

  function updateList(group: CodeGroup): void {
    const entries = Object.entries(group.components || {});
    if (emptyNote.hidden === !entries.length) emptyNote.hidden = !!entries.length;
    keyed(list, entries, ([id]) => id, () => {
      const row = element('div', 'fw-ext-actions');
      const thumb = element('img');
      thumb.alt = '';
      thumb.decoding = 'async';
      thumb.draggable = false;
      thumb.style.cssText = 'width:40px;height:24px;object-fit:cover;border-radius:4px;flex:0 0 auto';
      const holder = element('div');
      holder.style.cssText = 'width:40px;height:24px;border:1px dashed var(--border-color);border-radius:4px;flex:0 0 auto';
      const label = element('span', 'micro');
      row.append(thumb, holder, label);
      return row;
    }, (row, [id, component]) => {
      const thumb = row.children[0] as HTMLImageElement;
      const holder = row.children[1] as HTMLElement;
      const poster = component.poster || '';
      if (poster && thumb.getAttribute('src') !== poster) thumb.setAttribute('src', poster);
      if (thumb.hidden === !!poster) thumb.hidden = !poster;
      if (holder.hidden === !poster) holder.hidden = !!poster;
      const mode = MODE_LABEL[component.mode || 'isolated'] || MODE_LABEL.isolated;
      const summary = row.children[2] as HTMLElement;
      pieces(summary, [`${id} | `, t(mode), ` | ${sizeLabel(component)}`]);
      const middle = summary.childNodes[1];
      if (middle instanceof Text) labelText(middle, mode);
    });
  }

  return {
    update(next, node) {
      latest = next;
      current = node;
      const group = codeGroup(next);
      const entries = Object.keys(group.components || {}).filter(id => group.components?.[id]?.enabled !== false);
      const items = entries.map(id => ({ id, name: id }));
      options(insertSelect, items);
      options(componentSelect, items);
      if (insertSelect.disabled !== !items.length) insertSelect.disabled = !items.length;
      if (insertButton.disabled !== !items.length) insertButton.disabled = !items.length;
      if (insertHint.hidden === !items.length) insertHint.hidden = !!items.length;
      const instance = group.instances?.[node.id];
      const component = instance ? group.components?.[instance.component] : undefined;
      const editing = !!instance;
      if (insertBox.hidden !== editing) insertBox.hidden = editing;
      if (editBox.hidden === editing) editBox.hidden = !editing;
      if (instance && component) {
        value(componentSelect, instance.component);
        const mode = component.mode === 'page' ? 'page' : 'isolated';
        label(modeBadge, MODE_LABEL[mode]);
        if (modeHint.hidden === (mode === 'page')) modeHint.hidden = mode !== 'page';
        const shared = sharedComponent(instance, next);
        const darkShown = instance.poster || component.poster || '';
        const lightShown = (instance.poster ? instance.posterLight : component.posterLight) || '';
        const darkClearable = !!instance.poster || (!shared && !!component.poster);
        const lightClearable = instance.poster ? !!instance.posterLight : !shared && !!component.posterLight;
        value(posterInput, darkShown);
        if (posterClear.disabled !== !darkClearable) posterClear.disabled = !darkClearable;
        value(lightInput, lightShown);
        if (lightClear.disabled !== !lightClearable) lightClear.disabled = !lightClearable;
        const key = JSON.stringify([node.id, instance.component, component.props || {}]);
        if (key !== schemaKey) {
          schemaKey = key;
          buildForm(component);
        }
        fillValues(instance, component);
      } else if (schemaKey) {
        schemaKey = '';
        controls = new Map();
        propsForm.replaceChildren();
      }
      updateList(group);
      const map = posterMap(next);
      const lights = posterLightMap(next);
      const mapKey = JSON.stringify([map, lights]);
      if (mapKey !== postersKey) {
        postersKey = mapKey;
        const canvas = ctx.canvas as unknown as { setPosters?: (posters: Record<string, string>, lights?: Record<string, string>) => void };
        if (typeof canvas.setPosters === 'function') canvas.setPosters(map, lights);
      }
    }
  };
}
