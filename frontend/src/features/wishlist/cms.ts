import type { EditorState } from '../../types';
import { element, keyed, text as setText } from '../../ui/dom';
import { label as labelNode, tn } from '../../i18n';
import { btn, check, cmsGroup, containerFor, field, listCollection, note, number, row, section, select, setChecked, setValue, slug, sync, text, type Facet, type SortOption, type Tab, type WishlistContext } from './kit';

function fieldChoices(state: EditorState, collection: string): [string, string][] {
  const source = state.site.collections[collection];
  if (!source) return [];
  const choices: [string, string][] = [];
  for (const item of source.fields) {
    choices.push([item.name, `${item.name} (${item.type})`]);
    const target = (item as { collection?: string }).collection;
    if (target && state.site.collections[target]) for (const inner of state.site.collections[target].fields) choices.push([`${item.name}.${inner.name}`, `${item.name} > ${inner.name}`]);
  }
  return choices;
}

function fieldKind(state: EditorState, collection: string, path: string): string {
  const [first, second] = path.split('.');
  const head = state.site.collections[collection]?.fields.find(f => f.name === first);
  if (!second) return head?.type || '';
  const target = (head as { collection?: string } | undefined)?.collection;
  return (target && state.site.collections[target]?.fields.find(f => f.name === second)?.type) || '';
}

function uniqueKey(base: string, taken: string[]): string {
  let key = slug(base);
  if (['sort', 'page'].includes(key)) key = `${key}-1`;
  for (let index = 2; taken.includes(key); index += 1) key = `${slug(base)}-${index}`;
  return key;
}

export function buildCms(ctx: WishlistContext): Tab[] {
  const target = () => ctx.selected();
  const config = () => cmsGroup(ctx.state()).lists[target()];
  const collectionOf = () => listCollection(ctx.state(), target());
  const patch = (value: Record<string, unknown>) => ctx.commands([{ command: 'cms.list', params: { node: target(), patch: value } }]);

  const listNote = note();
  const facetKind = select([['checkbox', 'Checkbox group'], ['select', 'Dropdown'], ['search', 'Text search'], ['range', 'Range (number or date)']]);
  const facetField = select([]);
  const facetLabel = text('Label shown to visitors');
  const facetRows = element('div', 'wl-list');
  const sortField = select([]);
  const sortDirection = select([['asc', 'Ascending'], ['desc', 'Descending']]);
  const sortLabel = text('Label, for example Price low to high');
  const sortRows = element('div', 'wl-list');
  const pageSize = number(0, 200);
  const urlNote = element('p', 'wl-hint', 'Visitors see these controls in the published site. Choices are saved in the address as ?field=value, so a filtered view can be shared.');

  const addFacet = () => {
    const collection = collectionOf();
    if (!collection) { ctx.notify('Select a collection list first.', true); return; }
    if (facetKind.value === 'range' && !['number', 'date'].includes(fieldKind(ctx.state(), collection, facetField.value))) { ctx.notify('Range filters need a number or date field.', true); return; }
    const facets = [...(config()?.facets || [])];
    const label = facetLabel.value.trim() || facetField.value.split('.').pop() || facetField.value;
    facets.push({ key: uniqueKey(label, facets.map(f => f.key)), field: facetField.value, kind: facetKind.value as Facet['kind'], label });
    facetLabel.value = '';
    void patch({ facets });
  };
  const addSort = () => {
    if (!collectionOf()) { ctx.notify('Select a collection list first.', true); return; }
    const sorts = [...(config()?.sortOptions || [])];
    const label = sortLabel.value.trim() || `${sortField.value} ${sortDirection.value === 'asc' ? 'ascending' : 'descending'}`;
    sorts.push({ key: uniqueKey(`${sortField.value}-${sortDirection.value}`, sorts.map(s => s.key)), field: sortField.value, direction: sortDirection.value as SortOption['direction'], label });
    sortLabel.value = '';
    void patch({ sortOptions: sorts });
  };
  const rowFor = (label: string, remove: () => void) => {
    const node = element('div', 'wl-item');
    const name = element('span', 'wl-item-name', label);
    const close = btn('Remove', remove, 'wl-quiet');
    node.append(name, close);
    return node;
  };
  const filters = element('div', 'wl-pane');
  filters.append(
    section('Collection list', listNote),
    section('Filter controls', facetRows, row(field('Field', facetField), field('Control', facetKind)), field('Label', facetLabel), btn('Add filter', addFacet, 'wl-primary')),
    section('Sort options', sortRows, row(field('Field', sortField), field('Direction', sortDirection)), field('Label', sortLabel), btn('Add sort option', addSort, 'wl-primary')),
    section('Pagination', field('Items per page (0 shows all)', pageSize), btn('Apply', () => { void patch({ pageSize: Number(pageSize.value) > 0 ? Number(pageSize.value) : null }); })),
    urlNote
  );
  const filtersTab: Tab = {
    id: 'filters', label: 'Filters', element: filters,
    refresh() {
      const state = ctx.state();
      const collection = collectionOf();
      const current = config();
      setText(listNote, collection ? `Editing the list on "${state.site.nodes[target()]?.name || target()}" (collection ${collection}).` : 'Select a collection list element on the canvas or in layers. A list is an element bound to a whole collection.');
      const choices = collection ? fieldChoices(state, collection) : [];
      sync(facetField, choices);
      sync(sortField, [...choices, ['slug', 'slug'], ['id', 'id']]);
      const facets = current?.facets || [];
      const sorts = current?.sortOptions || [];
      keyed(facetRows, facets, item => item.key, item => rowFor('', () => undefined), (node, item) => {
        setText(node.firstElementChild as HTMLElement, `${item.label || item.field}  |  ${item.kind}  |  ${item.field}`);
        const close = node.lastElementChild as HTMLButtonElement;
        close.onclick = () => { void patch({ facets: facets.filter(f => f.key !== item.key) }); };
      });
      keyed(sortRows, sorts, item => item.key, item => rowFor('', () => undefined), (node, item) => {
        setText(node.firstElementChild as HTMLElement, `${item.label || item.field}  |  ${item.field} ${item.direction}`);
        const close = node.lastElementChild as HTMLButtonElement;
        close.onclick = () => { void patch({ sortOptions: sorts.filter(s => s.key !== item.key) }); };
      });
      setValue(pageSize, String(current?.pageSize || 0));
      for (const control of [facetKind, facetField, facetLabel, sortField, sortDirection, sortLabel, pageSize]) control.disabled = !collection;
    }
  };

  const perView = number(1, 6);
  const interval = number(2000, 60000, 500);
  const autoplay = element('input');
  const arrows = element('input');
  const dots = element('input');
  const loop = element('input');
  const label = text('Accessible name, for example Featured projects');
  const gap = text('16px');
  const sliderNote = note();
  const collectionPick = select([]);
  const slidePerView = number(1, 6);
  const readSlider = () => ({ perView: Number(perView.value) || 1, interval: Number(interval.value) || 5000, autoplay: autoplay.checked, arrows: arrows.checked, dots: dots.checked, loop: loop.checked, label: label.value.trim() || 'Slider', gap: /^\d+(\.\d+)?(px|rem|em|%)$/.test(gap.value.trim()) ? gap.value.trim() : '16px' });
  const slider = element('div', 'wl-pane');
  slider.append(
    section('Slider from a collection', sliderNote, row(field('Slides per view', perView), field('Autoplay interval (ms)', interval)), check('Autoplay (never starts for visitors who prefer reduced motion)', autoplay), check('Previous and next arrows', arrows), check('Dots', dots), check('Loop', loop), field('Accessible name', label), field('Gap', gap),
      row(btn('Apply to selected list', () => {
        if (!collectionOf()) { ctx.notify('Select a collection list first.', true); return; }
        if (config()?.facets?.length || config()?.sortOptions?.length) { ctx.notify('Remove filters and sort options first; a slider cannot also filter.', true); return; }
        void patch({ slider: readSlider(), pageSize: null });
      }, 'wl-primary'), btn('Turn slider off', () => { void patch({ slider: null }); }))),
    section('Insert a new slider', field('Collection', collectionPick), field('Slides per view', slidePerView), btn('Insert slider', () => {
      if (!collectionPick.value) { ctx.notify('Create a collection first.', true); return; }
      void ctx.commands([{ command: 'slider.create', params: { parent: containerFor(ctx.state(), target()), collection: collectionPick.value, perView: Number(slidePerView.value) || 1 } }]);
    }, 'wl-primary'))
  );
  const sliderTab: Tab = {
    id: 'slider', label: 'Slider', element: slider,
    refresh() {
      const state = ctx.state();
      const current = config()?.slider;
      setText(sliderNote, current ? 'The selected list is a slider. Change the options and apply.' : collectionOf() ? 'The selected list shows as a normal collection list. Apply to make it a slider.' : 'Select a collection list element to turn it into a slider.');
      sync(collectionPick, Object.values(state.site.collections).map(c => [c.id, c.name] as [string, string]));
      for (const [control, value] of [[perView, String(current?.perView ?? 1)], [interval, String(current?.interval ?? 5000)], [label, current?.label ?? ''], [gap, current?.gap ?? '16px']] as [HTMLInputElement, string][]) setValue(control, value);
      setValue(slidePerView, slidePerView.value || '1');
      setChecked(autoplay, current?.autoplay ?? false);
      setChecked(arrows, current?.arrows ?? true);
      setChecked(dots, current?.dots ?? true);
      setChecked(loop, current?.loop ?? true);
    }
  };

  const folderName = text('New folder name');
  const folderRows = element('div', 'wl-list');
  const orderCollection = select([]);
  const itemRows = element('div', 'wl-list');
  const templatePick = select([]);
  const newSlug = text('new-section');
  const orderNote = note();
  let dragging = '';
  const titleOf = (state: EditorState, collection: string, item: { id: string; slug: string; values: Record<string, unknown> }) => {
    const first = state.site.collections[collection]?.fields.find(f => f.type === 'text');
    return String((first && item.values[first.name]) || item.slug);
  };
  const move = (id: string, index: number) => { void ctx.commands([{ command: 'cms.move', params: { collection: orderCollection.value, id, index } }]); };
  const filing = (collection: string, folder: string) => {
    const groups = cmsGroup(ctx.state()).folders;
    const batch = Object.entries(groups).filter(([id, value]) => value.collections.includes(collection) && id !== folder).map(([id, value]) => ({ command: 'cms.folder', params: { id, collections: value.collections.filter(c => c !== collection) } }));
    if (folder) batch.push({ command: 'cms.folder', params: { id: folder, collections: [...(groups[folder]?.collections || []).filter(c => c !== collection), collection] } });
    if (batch.length) void ctx.commands(batch);
  };
  const organise = element('div', 'wl-pane');
  organise.append(
    section('Collection folders', folderRows, row(folderName, btn('Create folder', () => {
      const name = folderName.value.trim();
      if (!name) return;
      const groups = cmsGroup(ctx.state()).folders;
      let id = slug(name);
      for (let index = 2; groups[id]; index += 1) id = `${slug(name)}-${index}`;
      folderName.value = '';
      void ctx.commands([{ command: 'cms.folder', params: { id, name, collections: [] } }]);
    }, 'wl-primary'))),
    section('Item order', field('Collection', orderCollection), element('p', 'wl-hint', 'Drag rows or use the arrows. The order is the default order of lists in the published site.'), itemRows, orderNote),
    section('Duplicate a collection page', field('Collection page', templatePick), field('New page path', newSlug), btn('Duplicate page', () => {
      const id = templatePick.value;
      const path = newSlug.value.trim().replace(/^\/+|\/+$/g, '');
      if (!id || !path) { ctx.notify('Choose a collection page and a new path.', true); return; }
      if (!/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/.test(path)) { ctx.notify('Use letters, numbers, dashes and slashes in the path.', true); return; }
      if (ctx.state().site.pages.some(page => page.slug.replace(/^\/+|\/+$/g, '') === path)) { ctx.notify('A page already uses that path.', true); return; }
      void ctx.commands([{ command: 'page.duplicate', params: { id, slug: `/${path}` } }]);
      newSlug.value = '';
    }, 'wl-primary'))
  );
  orderCollection.addEventListener('change', () => organiseTab.refresh());
  const organiseTab: Tab = {
    id: 'collections', label: 'Collections', element: organise,
    refresh() {
      const state = ctx.state();
      const collections = Object.values(state.site.collections);
      const groups = cmsGroup(state);
      sync(orderCollection, collections.map(c => [c.id, c.name] as [string, string]));
      sync(templatePick, Object.keys(groups.templates).map(id => [id, state.site.pages.find(p => p.id === id)?.name || id] as [string, string]));
      const folderChoices: [string, string][] = [['', 'No folder'], ...Object.entries(groups.folders).map(([id, value]) => [id, value.name || id] as [string, string])];
      keyed(folderRows, collections, item => item.id, () => {
        const node = element('div', 'wl-item');
        const name = element('span', 'wl-item-name');
        const pick = select([]);
        pick.setAttribute('aria-label', 'Folder');
        node.append(name, pick);
        return node;
      }, (node, item) => {
        setText(node.firstElementChild as HTMLElement, item.name);
        const pick = node.lastElementChild as HTMLSelectElement;
        sync(pick, folderChoices);
        const current = Object.entries(groups.folders).find(([, value]) => value.collections.includes(item.id))?.[0] || '';
        setValue(pick, current);
        pick.onchange = () => filing(item.id, pick.value);
      });
      const collection = state.site.collections[orderCollection.value];
      const items = collection?.items || [];
      keyed(itemRows, items, item => item.id, () => {
        const node = element('div', 'wl-item wl-drag');
        node.draggable = true;
        node.append(element('span', 'wl-item-name'), btn('Up', () => undefined, 'wl-quiet'), btn('Down', () => undefined, 'wl-quiet'));
        return node;
      }, (node, item) => {
        const index = items.indexOf(item);
        setText(node.children[0] as HTMLElement, titleOf(state, collection.id, item));
        const up = node.children[1] as HTMLButtonElement;
        const down = node.children[2] as HTMLButtonElement;
        up.disabled = index === 0;
        down.disabled = index === items.length - 1;
        up.onclick = () => move(item.id, index - 1);
        down.onclick = () => move(item.id, index + 1);
        node.ondragstart = event => { dragging = item.id; event.dataTransfer?.setData('text/plain', item.id); };
        node.ondragover = event => { if (dragging) event.preventDefault(); };
        node.ondrop = event => { event.preventDefault(); if (dragging && dragging !== item.id) move(dragging, items.indexOf(item)); dragging = ''; };
        node.ondragend = () => { dragging = ''; };
      });
      if (collection) setText(orderNote, tn(items.length, '{0} item in {1}.', '{0} items in {1}.', [items.length, collection.name]));
      else labelNode(orderNote, 'Create a collection to order its items.');
    }
  };
  return [filtersTab, sliderTab, organiseTab];
}
