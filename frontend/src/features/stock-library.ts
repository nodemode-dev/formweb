import { element, keyed, text } from '../ui/dom';
import '../styles/stock-library.css';

/**
 * Stock library (FW-073). Two sources in one dialog: the bundled Lucide icons (drawn here from their path data, so
 * no request per icon) and photos from the person's formlit library (thumbnails proxied by the service). Inserting
 * makes an asset whose credit travels with it into CREDITS.txt on export. Grids are keyed, so a new search reuses
 * tiles and only changes what differs.
 */
type Icon = { name: string; tags: string[]; nodes: [string, Record<string, string>][]; license: string };
type Credit = { creator?: string; copyright?: string; license?: string; usage?: string; title?: string };
type Photo = { id: number; file: string; width: number; height: number; thumb: string; title: string; alt: string; credit: Credit };
type Source = { available: boolean; note: string };
type Made = { asset: { url: string; license?: Credit & { attribution?: string } }; alt: string; name: string; width: number; height: number; note: string };
type Hooks = {
  icons: (query: string) => Promise<{ total: number; icons: Icon[]; source: { version: string; count: number } }>;
  photos: (query: string) => Promise<{ total: number; photos: Photo[]; source: Source }>;
  iconAsset: (name: string, color: string, stroke: number, size: number) => Promise<Made>;
  photoAsset: (id: number) => Promise<Made>;
  insert: (made: Made, kind: 'icon' | 'photo') => Promise<void>;
  url: (path: string) => string;
  notify: (message: string, error?: boolean) => void;
};

const SVG = 'http://www.w3.org/2000/svg';

export class StockLibrary {
  readonly element = element('div', 'fw-stock');
  private tabs = element('div', 'fw-seg fw-stock-tabs');
  private search = element('input');
  private iconsPane = element('div', 'fw-stock-pane');
  private photosPane = element('div', 'fw-stock-pane');
  private iconGrid = element('div', 'fw-stock-icons');
  private photoGrid = element('div', 'fw-stock-photos');
  private iconCount = element('p', 'micro');
  private photoNote = element('p', 'micro fw-stock-note');
  private color = element('input');
  private stroke = element('input');
  private size = element('input');
  private detail = element('p', 'micro fw-stock-detail');
  private insertButton: HTMLButtonElement;
  private tab: 'icons' | 'photos' = 'icons';
  private queries = { icons: '', photos: '' };
  private selectedIcon = '';
  private selectedPhoto = 0;
  private photos: Photo[] = [];
  private icons: Icon[] = [];
  private timer = 0;
  private token = 0;

  constructor(private hooks: Hooks) {
    for (const [id, label] of [['icons', 'Icons'], ['photos', 'Photos from formlit']] as const) {
      const tab = element('button', 'fw-seg-btn', label);
      tab.type = 'button';
      tab.dataset.command = `stock.${id}`;
      tab.dataset.tab = id;
      tab.addEventListener('click', () => this.show(id));
      this.tabs.append(tab);
    }
    this.search.type = 'search';
    this.search.placeholder = 'Search icons, e.g. heart, arrow right, mail';
    this.search.dataset.field = 'stock.search';
    this.search.setAttribute('aria-label', 'Search the stock library');
    this.search.addEventListener('input', () => { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.refresh(), 160); });
    this.color.type = 'color'; this.color.value = '#111111'; this.color.dataset.field = 'stock.color'; this.color.setAttribute('aria-label', 'Icon colour');
    this.stroke.type = 'range'; this.stroke.min = '0.5'; this.stroke.max = '3'; this.stroke.step = '0.25'; this.stroke.value = '2'; this.stroke.dataset.field = 'stock.stroke'; this.stroke.setAttribute('aria-label', 'Stroke width');
    this.size.type = 'number'; this.size.min = '8'; this.size.max = '1024'; this.size.value = '96'; this.size.dataset.field = 'stock.size'; this.size.setAttribute('aria-label', 'Icon size in pixels');
    for (const control of [this.color, this.stroke]) control.addEventListener('input', () => this.restyle());
    const options = element('div', 'fw-stock-options');
    const labelled = (label: string, control: HTMLElement) => { const wrap = element('label', 'fw-stock-option'); wrap.append(element('span', '', label), control); return wrap; };
    options.append(labelled('Colour', this.color), labelled('Stroke', this.stroke), labelled('Size (px)', this.size));
    this.iconsPane.append(options, this.iconCount, this.iconGrid);
    this.photosPane.append(this.photoNote, this.photoGrid);
    this.insertButton = element('button', 'primary', 'Insert');
    this.insertButton.type = 'button';
    this.insertButton.dataset.command = 'stock.insert';
    this.insertButton.addEventListener('click', () => { void this.insert().catch(error => this.hooks.notify(error instanceof Error ? error.message : String(error), true)); });
    const footer = element('div', 'fw-stock-footer');
    footer.append(this.detail, this.insertButton);
    this.element.append(this.tabs, this.search, this.iconsPane, this.photosPane, footer);
    this.show('icons', false);
  }

  /** Called when the dialog opens. */
  async open(): Promise<void> {
    await this.refresh();
    this.search.focus();
  }

  private show(tab: 'icons' | 'photos', load = true): void {
    this.queries[this.tab] = this.search.value;  // each tab keeps its own search
    this.tab = tab;
    this.search.value = this.queries[tab];
    for (const node of Array.from(this.tabs.children) as HTMLElement[]) {
      const on = node.dataset.tab === tab;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-pressed', String(on));
    }
    this.iconsPane.hidden = tab !== 'icons';
    this.photosPane.hidden = tab !== 'photos';
    this.search.placeholder = tab === 'icons' ? 'Search icons, e.g. heart, arrow right, mail' : 'Search your formlit photos by name, keyword or creator';
    this.describe();
    if (load) void this.refresh();
  }

  private async refresh(): Promise<void> {
    const token = ++this.token;
    const query = this.search.value.trim();
    if (this.tab === 'icons') {
      const result = await this.hooks.icons(query);
      if (token !== this.token) return;
      this.icons = result.icons;
      text(this.iconCount, `${result.total === result.icons.length ? result.total : `Showing ${result.icons.length} of ${result.total}`} icons from Lucide ${result.source.version} (ISC; Feather-derived icons MIT).`);
      keyed(this.iconGrid, result.icons, item => item.name, item => this.iconTile(item), (node, item) => {
        node.dataset.selected = String(item.name === this.selectedIcon);
        node.title = [item.name, ...item.tags.slice(0, 5)].join(', ');
      });
    } else {
      try {
        const result = await this.hooks.photos(query);
        if (token !== this.token) return;
        this.photos = result.photos;
        this.photoNote.dataset.state = 'ok';
        text(this.photoNote, result.photos.length ? `${result.source.note} ${result.total} photo${result.total === 1 ? '' : 's'}${query ? ' match' : ''}.` : query ? `No formlit photos match "${query}".` : 'Your formlit library has no photos yet.');
      } catch (error) {
        if (token !== this.token) return;
        this.photos = [];
        this.photoNote.dataset.state = 'off';
        text(this.photoNote, error instanceof Error ? error.message : String(error));
      }
      keyed(this.photoGrid, this.photos, item => String(item.id), item => this.photoTile(item), (node, item) => {
        node.dataset.selected = String(item.id === this.selectedPhoto);
        text(node.querySelector('.fw-stock-photo-name')!, item.title || item.file);
        text(node.querySelector('.fw-stock-photo-credit')!, [item.credit.creator, item.credit.license].filter(Boolean).join(' · ') || 'No credit recorded');
      });
    }
    this.describe();
  }

  private iconTile(item: Icon): HTMLElement {
    const tile = element('button', 'fw-stock-icon');
    tile.type = 'button';
    tile.setAttribute('aria-label', `${item.name} icon`);
    const svg = document.createElementNS(SVG, 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
    svg.setAttribute('stroke-width', this.stroke.value);
    for (const [tag, attrs] of item.nodes) {
      const shape = document.createElementNS(SVG, tag);
      for (const [key, value] of Object.entries(attrs)) if (key !== 'key') shape.setAttribute(key, value);
      svg.append(shape);
    }
    tile.append(svg, element('span', 'fw-stock-icon-name', item.name));
    tile.addEventListener('click', () => this.pick('icon', item.name));
    tile.addEventListener('dblclick', () => { this.pick('icon', item.name); void this.insert().catch(error => this.hooks.notify(String(error), true)); });
    return tile;
  }

  private photoTile(item: Photo): HTMLElement {
    const tile = element('button', 'fw-stock-photo');
    tile.type = 'button';
    const img = element('img');
    img.alt = item.alt || item.title || item.file;
    img.loading = 'lazy';
    img.src = this.hooks.url(item.thumb);
    tile.append(img, element('span', 'fw-stock-photo-name'), element('span', 'fw-stock-photo-credit'));
    tile.addEventListener('click', () => this.pick('photo', item.id));
    tile.addEventListener('dblclick', () => { this.pick('photo', item.id); void this.insert().catch(error => this.hooks.notify(String(error), true)); });
    return tile;
  }

  private pick(kind: 'icon' | 'photo', id: string | number): void {
    if (kind === 'icon') this.selectedIcon = String(id); else this.selectedPhoto = Number(id);
    const grid = kind === 'icon' ? this.iconGrid : this.photoGrid;
    for (const node of Array.from(grid.children) as HTMLElement[]) node.dataset.selected = String(node.dataset.key === String(id));
    this.describe();
  }

  private restyle(): void {
    for (const svg of Array.from(this.iconGrid.querySelectorAll('svg'))) svg.setAttribute('stroke-width', this.stroke.value);
    this.iconGrid.style.color = this.color.value;
  }

  private describe(): void {
    if (this.tab === 'icons') {
      const icon = this.icons.find(item => item.name === this.selectedIcon);
      text(this.detail, icon ? `${icon.name}: ${icon.license} licence (Lucide). Credited in CREDITS.txt when you export.` : 'Pick an icon; double-click inserts it.');
      this.insertButton.disabled = !icon;
    } else {
      const photo = this.photos.find(item => item.id === this.selectedPhoto);
      const credit = photo?.credit;
      text(this.detail, photo ? [credit?.copyright || credit?.creator, credit?.usage ? `Usage: ${credit.usage}` : '', 'Credit saved with the image.'].filter(Boolean).join(' · ') : 'Pick a photo; double-click inserts it.');
      this.insertButton.disabled = !photo;
    }
  }

  private async insert(): Promise<void> {
    this.insertButton.disabled = true;
    try {
      if (this.tab === 'icons') {
        if (!this.selectedIcon) throw new Error('Pick an icon first.');
        const made = await this.hooks.iconAsset(this.selectedIcon, this.color.value, Number(this.stroke.value), Math.max(8, Math.min(1024, Number(this.size.value) || 96)));
        await this.hooks.insert(made, 'icon');
        this.hooks.notify(`Inserted the ${this.selectedIcon} icon (${made.asset.license?.license || 'ISC'} licence, credited on export). ${made.note}`);
      } else {
        if (!this.selectedPhoto) throw new Error('Pick a photo first.');
        const made = await this.hooks.photoAsset(this.selectedPhoto);
        await this.hooks.insert(made, 'photo');
        this.hooks.notify(`Inserted "${made.name}". ${made.note}`);
      }
    } finally { this.describe(); }
  }
}
