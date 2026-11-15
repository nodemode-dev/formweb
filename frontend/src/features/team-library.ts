import type { EditorState } from '../types';
import { element, keyed, options, pieces, text } from '../ui/dom';
import { t, tn } from '../i18n';
import '../styles/brand-kit.css';

/**
 * Team libraries (FW-075). A library is a named set of colors, fonts and graphics held by the FormWeb service, not
 * by one site, so several projects can use it. Whoever creates one owns it and can share it as view (use it) or
 * edit (change it). Linking adds its colors and fonts to this site as var(--lib-[library]-[name]) tokens in one
 * undo step; Sync brings later changes in. Graphics are uploaded images inserted like any other image.
 */
type Item = { name: string; value: string; token: string };
type Graphic = { name: string; asset: string; url: string };
type Member = { identityId: string; name: string; role: string };
export type TeamLibrarySummary = { id: string; slug: string; name: string; owner: string; role: 'owner' | 'edit' | 'view'; revision: number; counts: Record<string, number>; linked: boolean; linkedRevision: number | null; updateAvailable: boolean };
export type TeamLibrary = TeamLibrarySummary & { colors: Item[]; fonts: Item[]; graphics: Graphic[]; members: Member[]; usedBy: number };
type UseResult = { message: string };
type Hooks = {
  state: () => EditorState;
  list: () => Promise<{ libraries: TeamLibrarySummary[] }>;
  get: (id: string) => Promise<TeamLibrary>;
  create: (name: string, fromBrand: boolean) => Promise<TeamLibrary>;
  save: (id: string, body: Record<string, unknown>) => Promise<TeamLibrary>;
  share: (id: string, identityId: string, role: string) => Promise<TeamLibrary>;
  remove: (id: string) => Promise<unknown>;
  use: (id: string, action: 'link' | 'sync' | 'unlink') => Promise<UseResult>;
  assets: () => Promise<{ assets: { id: string; name: string }[] }>;
  people: () => Promise<{ members: { identityId: string; name: string }[] }>;
  insertGraphic: (url: string, name: string) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
  assetUrl: (url: string) => string;
};


export class TeamLibraries {
  readonly element = element('div', 'fw-brand fw-team');
  private list = element('div', 'fw-brand-list');
  private createName = element('input');
  private detail = element('div', 'fw-team-detail');
  private detailTitle = element('h3', 'fw-brand-title');
  private detailMeta = element('p', 'micro');
  private colors = element('div', 'fw-brand-list');
  private fonts = element('div', 'fw-brand-list');
  private graphics = element('div', 'fw-team-graphics');
  private members = element('div', 'fw-brand-list');
  private editRows: HTMLElement[] = [];
  private ownerRows: HTMLElement[] = [];
  private colorName = element('input');
  private colorValue = element('input');
  private fontName = element('input');
  private fontValue = element('input');
  private graphicPick = element('select');
  private graphicName = element('input');
  private shareId = element('select');
  private shareNote = element('p', 'micro');
  private shareRole = element('select');
  private selected: TeamLibrary | null = null;
  private summaries: TeamLibrarySummary[] = [];

  constructor(private hooks: Hooks) {
    this.createName.placeholder = 'Library name, e.g. Acme brand';
    this.createName.dataset.field = 'team.name';
    const createRow = element('div', 'fw-brand-add fw-team-create');
    createRow.append(this.createName, this.button('From brand kit', 'team.create-from-brand', () => this.create(true), 'primary'), this.button('Empty', 'team.create', () => this.create(false)));
    this.element.append(
      element('p', 'empty-note', 'Team libraries hold colors, fonts and graphics outside any one site, so all your projects can share them. Link one to this site to use its values as var(--lib-...) tokens; when the library changes, Sync updates every element that uses them.'),
      this.heading('Libraries'), this.list, this.heading('New library'), createRow, this.detail
    );
    this.colorName.placeholder = 'color name';
    this.colorValue.type = 'color';
    this.colorValue.value = '#f97316';
    this.fontName.placeholder = 'font name';
    this.fontValue.placeholder = 'Inter, sans-serif';
    this.graphicName.placeholder = 'graphic name';
    this.shareId.dataset.field = 'team.share-identity';
    this.shareId.setAttribute('aria-label', 'Person to share with');
    this.shareRole.setAttribute('aria-label', 'Access');
    options(this.shareRole, [{ id: 'view', name: 'Can use' }, { id: 'edit', name: 'Can edit' }, { id: 'none', name: 'Remove access' }]);
    const colorAdd = this.addRow(this.colorName, this.colorValue, 'Add color', 'team.add-color', () => this.addItem('colors', this.colorName, this.colorValue.value));
    const fontAdd = this.addRow(this.fontName, this.fontValue, 'Add font', 'team.add-font', () => this.addItem('fonts', this.fontName, this.fontValue.value));
    const graphicAdd = this.addRow(this.graphicName, this.graphicPick, 'Add graphic', 'team.add-graphic', () => this.addGraphic());
    const brandSync = element('div', 'fw-team-actions');
    brandSync.append(this.button('Replace with this site\'s brand kit', 'team.from-brand', () => this.fromBrand()));
    const share = element('div', 'fw-brand-add');
    share.append(this.shareId, this.shareRole, this.button('Share', 'team.share', () => this.share()));
    const ownerActions = element('div', 'fw-team-actions');
    ownerActions.append(this.button('Delete library', 'team.delete', () => this.remove(), 'quiet danger'));
    this.editRows = [colorAdd, fontAdd, graphicAdd, brandSync];
    this.ownerRows = [this.heading('Sharing'), this.members, share, this.shareNote, ownerActions];
    this.detail.append(this.detailTitle, this.detailMeta, this.heading('Colors'), this.colors, colorAdd, this.heading('Fonts'), this.fonts, fontAdd, this.heading('Graphics'), this.graphics, graphicAdd, brandSync, ...this.ownerRows);
    this.detail.hidden = true;
  }

  /** Called when the dialog opens and after the site changes; reads the list from the service. */
  async refresh(): Promise<void> {
    const { libraries } = await this.hooks.list();
    this.summaries = libraries;
    keyed(this.list, libraries, item => item.id, () => this.libraryRow(), (node, item) => {
      node.dataset.selected = String(this.selected?.id === item.id);
      text(node.querySelector('.fw-team-name')!, item.name);
      pieces(node.querySelector('.fw-team-meta') as HTMLElement, [
        item.role === 'owner' ? t('Yours') : item.role === 'edit' ? t("{0}'s, you can edit", [item.owner]) : t("{0}'s, you can use", [item.owner]),
        ' · ', tn(item.counts.colors, '{0} color', '{0} colors'), ', ', tn(item.counts.fonts, '{0} font', '{0} fonts'), ', ', tn(item.counts.graphics, '{0} graphic', '{0} graphics')
      ]);
      const badge = node.querySelector('.fw-team-badge') as HTMLElement;
      badge.dataset.state = item.updateAvailable ? 'update' : item.linked ? 'linked' : 'off';
      text(badge, item.updateAvailable ? 'Update available' : item.linked ? 'Linked' : '');
      (node.querySelector('[data-command="team.link"]') as HTMLElement).hidden = item.linked;
      (node.querySelector('[data-command="team.sync"]') as HTMLElement).hidden = !item.updateAvailable;
      (node.querySelector('[data-command="team.unlink"]') as HTMLElement).hidden = !item.linked;
    });
    if (this.selected) {
      if (libraries.some(item => item.id === this.selected!.id)) await this.open(this.selected.id);
      else { this.selected = null; this.detail.hidden = true; }
    }
  }

  private libraryRow(): HTMLElement {
    const row = element('div', 'fw-team-row');
    const name = element('button', 'fw-team-name');
    name.type = 'button';
    name.title = 'Show colors, fonts and graphics';
    name.addEventListener('click', () => { void this.open(row.dataset.key || '').catch(error => this.hooks.notify(String(error), true)); });
    const info = element('div', 'fw-team-info');
    info.append(name, element('span', 'fw-team-meta'));
    row.append(info, element('span', 'fw-team-badge'),
      this.button('Link', 'team.link', () => this.use(row.dataset.key || '', 'link'), 'primary'),
      this.button('Sync', 'team.sync', () => this.use(row.dataset.key || '', 'sync'), 'primary'),
      this.button('Unlink', 'team.unlink', () => this.use(row.dataset.key || '', 'unlink')));
    return row;
  }

  private async open(id: string): Promise<void> {
    const library = await this.hooks.get(id);
    this.selected = library;
    for (const node of Array.from(this.list.children) as HTMLElement[]) node.dataset.selected = String(node.dataset.key === id);
    const canEdit = library.role !== 'view';
    text(this.detailTitle, library.name);
    pieces(this.detailMeta, [
      t('Revision {0}', [library.revision]), ' · ', tn(library.usedBy, 'used by {0} site', 'used by {0} sites'),
      library.linked ? ' · ' : '', library.linked ? t('linked here at revision {0}', [library.linkedRevision ?? 0]) : '',
      '. ', t('Tokens are named var(--lib-{0}-...).', [library.slug])
    ]);
    keyed(this.colors, library.colors, item => item.name, () => this.itemRow('colors', canEdit), (node, item) => {
      (node.querySelector('.fw-brand-swatch') as HTMLElement).style.background = item.value;
      text(node.querySelector('.fw-brand-name')!, item.name);
      text(node.querySelector('.fw-brand-value')!, `var(--${item.token})`);
    });
    keyed(this.fonts, library.fonts, item => item.name, () => this.itemRow('fonts', canEdit), (node, item) => {
      (node.querySelector('.fw-brand-swatch') as HTMLElement).style.fontFamily = item.value;
      text(node.querySelector('.fw-brand-name')!, `${item.name}: ${item.value.split(',')[0]}`);
      text(node.querySelector('.fw-brand-value')!, `var(--${item.token})`);
    });
    keyed(this.graphics, library.graphics, item => item.name, () => this.graphicTile(canEdit), (node, item) => {
      const img = node.querySelector('img') as HTMLImageElement;
      if (img.dataset.src !== item.url) { img.dataset.src = item.url; img.src = this.hooks.assetUrl(item.url); }
      img.alt = item.name;
      text(node.querySelector('.fw-team-graphic-name')!, item.name);
    });
    keyed(this.members, library.members, item => item.identityId, () => { const row = element('div', 'fw-team-member'); row.append(element('span', 'fw-brand-name'), element('code', 'fw-brand-value')); return row; }, (node, item) => {
      text(node.querySelector('.fw-brand-name')!, item.name);
      text(node.querySelector('.fw-brand-value')!, item.role === 'edit' ? 'can edit' : 'can use');
    });
    for (const row of this.editRows) row.hidden = !canEdit;
    for (const row of this.ownerRows) row.hidden = library.role !== 'owner';
    if (canEdit) {
      const { assets } = await this.hooks.assets();
      options(this.graphicPick, assets.map(asset => ({ id: asset.id, name: asset.name })));
    }
    if (library.role === 'owner') {
      const people = await this.hooks.people().then(result => result.members).catch(() => []);
      options(this.shareId, people.map(person => ({ id: person.identityId, name: person.name })));
      text(this.shareNote, people.length ? 'People with a role in this project. Can use: link it in their sites. Can edit: change the library.' : 'No collaborators yet. Create identities and give them a project role in Website studio > Project roles (needs FORMWEB_AUTH_TOKEN); they then appear here.');
      (this.shareId.parentElement as HTMLElement).hidden = !people.length;
    }
    this.detail.hidden = false;
  }

  private itemRow(kind: 'colors' | 'fonts', canEdit: boolean): HTMLElement {
    const row = element('div', 'fw-brand-row');
    const swatch = element('span', 'fw-brand-swatch', kind === 'fonts' ? 'Aa' : '');
    const remove = this.button('Remove', `team.remove-${kind === 'colors' ? 'color' : 'font'}`, () => this.removeItem(kind, row.dataset.key || ''));
    remove.hidden = !canEdit;
    row.append(swatch, element('span', 'fw-brand-name'), element('code', 'fw-brand-value'), remove);
    return row;
  }

  private graphicTile(canEdit: boolean): HTMLElement {
    const tile = element('div', 'fw-team-graphic');
    const img = element('img');
    const actions = element('div', 'fw-team-actions');
    const remove = this.button('Remove', 'team.remove-graphic', () => this.removeItem('graphics', tile.dataset.key || ''));
    remove.hidden = !canEdit;
    actions.append(this.button('Insert', 'team.insert-graphic', () => {
      const item = this.selected?.graphics.find(entry => entry.name === tile.dataset.key);
      if (!item) throw new Error('That graphic is no longer in the library.');
      return this.hooks.insertGraphic(item.url, item.name);
    }), remove);
    tile.append(img, element('span', 'fw-team-graphic-name'), actions);
    return tile;
  }

  private async create(fromBrand: boolean): Promise<void> {
    const name = this.createName.value.trim() || (fromBrand ? t('{0} brand', [this.hooks.state().site.name]) : '');
    if (!name) throw new Error('Name the library first.');
    const library = await this.hooks.create(name, fromBrand);
    this.createName.value = '';
    this.hooks.notify(fromBrand ? t('Team library "{0}" created from this site\'s brand kit. Link it here or in any project to use it.', [library.name]) : t('Team library "{0}" created. Link it here or in any project to use it.', [library.name]));
    this.selected = library;
    await this.refresh();
  }

  private async use(id: string, action: 'link' | 'sync' | 'unlink'): Promise<void> {
    const result = await this.hooks.use(id, action);
    this.hooks.notify(result.message);
    await this.refresh();
  }

  private payload(kind: 'colors' | 'fonts' | 'graphics', items: unknown[]): Record<string, unknown> {
    return { [kind]: items, expectedRevision: this.selected?.revision };
  }

  private async addItem(kind: 'colors' | 'fonts', nameField: HTMLInputElement, value: string): Promise<void> {
    const library = this.need();
    const name = nameField.value.trim();
    if (!name) throw new Error(kind === 'colors' ? t('Name the color first.') : t('Name the font first.'));
    const items = library[kind].filter(item => item.name !== name).map(({ name, value }) => ({ name, value }));
    await this.hooks.save(library.id, this.payload(kind, [...items, { name, value }]));
    nameField.value = '';
    this.hooks.notify(t('Saved to "{0}". Sites that link it get the change when they sync.', [library.name]));
    await this.refresh();
  }

  private async addGraphic(): Promise<void> {
    const library = this.need();
    const asset = this.graphicPick.value;
    if (!asset) throw new Error('Upload an image first (Insert > Image), then add it here.');
    const name = this.graphicName.value.trim() || (this.graphicPick.selectedOptions[0]?.textContent || 'graphic').replace(/\.[a-z]+$/i, '');
    const items = library.graphics.map(({ name, asset }) => ({ name, asset }));
    await this.hooks.save(library.id, this.payload('graphics', [...items, { name, asset }]));
    this.graphicName.value = '';
    await this.refresh();
  }

  private async removeItem(kind: 'colors' | 'fonts' | 'graphics', name: string): Promise<void> {
    const library = this.need();
    const items = kind === 'graphics' ? library.graphics.filter(item => item.name !== name).map(({ name, asset }) => ({ name, asset })) : library[kind].filter(item => item.name !== name).map(({ name, value }) => ({ name, value }));
    await this.hooks.save(library.id, this.payload(kind, items));
    this.hooks.notify(t('Removed {0} from "{1}". Linked sites keep the token so nothing they use changes.', [name, library.name]));
    await this.refresh();
  }

  private async fromBrand(): Promise<void> {
    const library = this.need();
    const site = this.hooks.state().site as unknown as { extensions?: { design?: { tokens?: Record<string, { type: string; value: string }> } }; settings: Record<string, string> };
    const typed = site.extensions?.design?.tokens || {};
    const colors = Object.entries(typed).filter(([token, item]) => token.startsWith('brand-') && !token.startsWith('brand-font-') && item.type === 'color').map(([token, item]) => ({ name: token.slice(6), value: item.value }));
    const fonts = Object.entries(typed).filter(([token, item]) => token.startsWith('brand-font-') && item.type === 'text').map(([token, item]) => ({ name: token.slice(11), value: item.value }));
    const graphics = [['logo', site.settings.brandLogo], ['logo-dark', site.settings.brandLogoDark]].filter(([, url]) => url).map(([name, url]) => ({ name, asset: (url as string).split('/').pop() }));
    if (!colors.length && !fonts.length && !graphics.length) throw new Error('This site has no brand kit yet (Window > Brand kit).');
    await this.hooks.save(library.id, { colors, fonts, graphics, expectedRevision: library.revision });
    this.hooks.notify(t('"{0}" now matches this site\'s brand kit.', [library.name]));
    await this.refresh();
  }

  private async share(): Promise<void> {
    const library = this.need();
    const id = this.shareId.value;
    if (!id) throw new Error('Choose a person to share with.');
    await this.hooks.share(library.id, id, this.shareRole.value);
    this.hooks.notify(this.shareRole.value === 'none' ? t('Access removed.') : t('Shared "{0}".', [library.name]));
    await this.open(library.id);
  }

  private async remove(): Promise<void> {
    const library = this.need();
    if (!window.confirm(t('Delete the team library "{0}"? Sites that linked it keep its tokens.', [library.name]))) return;
    await this.hooks.remove(library.id);
    this.selected = null;
    this.detail.hidden = true;
    this.hooks.notify(t('Deleted "{0}".', [library.name]));
    await this.refresh();
  }

  private need(): TeamLibrary {
    if (!this.selected) throw new Error('Choose a library first.');
    return this.selected;
  }

  private heading(label: string): HTMLElement { return element('h3', 'fw-brand-title', label); }

  private button(label: string, command: string, action: () => unknown, className = 'quiet'): HTMLButtonElement {
    const node = element('button', className, label);
    node.type = 'button';
    node.dataset.command = command;
    node.addEventListener('click', () => { Promise.resolve(action()).catch(error => this.hooks.notify(error instanceof Error ? error.message : String(error), true)); });
    return node;
  }

  private addRow(name: HTMLInputElement, value: HTMLElement, label: string, command: string, action: () => unknown): HTMLElement {
    const row = element('div', 'fw-brand-add');
    row.append(name, value, this.button(label, command, action));
    return row;
  }
}
