import { element, keyed, pieces, text } from '../ui/dom';
import { t, tn } from '../i18n';
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
type Generator = { id: string; label: string; provider: string; local: boolean; ready: boolean; reason: string; sizes: string[]; licence: string };
type Generated = { id: string; url: string; license?: Credit & { prompt?: string; generator?: string } };
type Job = { job: string; status: string; progress?: number; message?: string; assets?: Generated[]; note?: string };
type Hooks = {
  generators: () => Promise<{ available: boolean; generators: Generator[]; note: string }>;
  generate: (prompt: string, generator: string, size: string, count: number) => Promise<{ job: string }>;
  poll: (job: string) => Promise<Job>;
  icons: (query: string) => Promise<{ total: number; icons: Icon[]; source: { version: string; count: number } }>;
  photos: (query: string) => Promise<{ total: number; photos: Photo[]; source: Source }>;
  iconAsset: (name: string, color: string, stroke: number, size: number) => Promise<Made>;
  photoAsset: (id: number) => Promise<Made>;
  insert: (made: Made, kind: 'icon' | 'photo' | 'generated') => Promise<void>;
  url: (path: string) => string;
  notify: (message: string | readonly string[], error?: boolean) => void;
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
  private generatePane = element('div', 'fw-stock-pane');
  private generator = element('select');
  private genSize = element('select');
  private genCount = element('select');
  private generateButton: HTMLButtonElement;
  private genNote = element('p', 'micro fw-stock-note');
  private genGrid = element('div', 'fw-stock-photos');
  private generated: Generated[] = [];
  private generatorList: Generator[] = [];
  private selectedGenerated = '';
  private busy = false;
  private tab: 'icons' | 'photos' | 'generate' = 'icons';
  private queries = { icons: '', photos: '', generate: '' };
  private selectedIcon = '';
  private selectedPhoto = 0;
  private photos: Photo[] = [];
  private icons: Icon[] = [];
  private timer = 0;
  private token = 0;

  constructor(private hooks: Hooks) {
    for (const [id, label] of [['icons', 'Icons'], ['photos', 'Photos from formlit'], ['generate', 'Generate with formvis']] as const) {
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
    this.search.addEventListener('input', () => { if (this.tab === 'generate') return; window.clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.refresh(), 160); });
    this.search.addEventListener('keydown', event => { if (this.tab === 'generate' && event.key === 'Enter') void this.generate().catch(error => this.hooks.notify(error instanceof Error ? error.message : String(error), true)); });
    this.color.type = 'color'; this.color.value = '#111111'; this.color.dataset.field = 'stock.color'; this.color.setAttribute('aria-label', 'Icon colour');
    this.stroke.type = 'range'; this.stroke.min = '0.5'; this.stroke.max = '3'; this.stroke.step = '0.25'; this.stroke.value = '2'; this.stroke.dataset.field = 'stock.stroke'; this.stroke.setAttribute('aria-label', 'Stroke width');
    this.size.type = 'number'; this.size.min = '8'; this.size.max = '1024'; this.size.value = '96'; this.size.dataset.field = 'stock.size'; this.size.setAttribute('aria-label', 'Icon size in pixels');
    for (const control of [this.color, this.stroke]) control.addEventListener('input', () => this.restyle());
    const options = element('div', 'fw-stock-options');
    const labelled = (label: string, control: HTMLElement) => { const wrap = element('label', 'fw-stock-option'); wrap.append(element('span', '', label), control); return wrap; };
    options.append(labelled('Colour', this.color), labelled('Stroke', this.stroke), labelled('Size (px)', this.size));
    this.iconsPane.append(options, this.iconCount, this.iconGrid);
    this.photosPane.append(this.photoNote, this.photoGrid);
    // FW-071: the search box becomes the prompt; formvis runs the generator the person picked.
    this.generator.dataset.field = 'stock.generator'; this.generator.setAttribute('aria-label', 'Generator');
    this.genSize.dataset.field = 'stock.gen-size'; this.genSize.setAttribute('aria-label', 'Picture size');
    this.genCount.dataset.field = 'stock.gen-count'; this.genCount.setAttribute('aria-label', 'How many pictures');
    for (const n of [1, 2, 3, 4]) { const option = element('option', '', tn(n, '{0} picture', '{0} pictures')); option.value = String(n); this.genCount.append(option); }
    this.generator.addEventListener('change', () => this.fillSizes());
    this.generateButton = element('button', 'primary', 'Generate');
    this.generateButton.type = 'button';
    this.generateButton.dataset.command = 'stock.run-generate';  // 'stock.generate' is the tab
    this.generateButton.addEventListener('click', () => { void this.generate().catch(error => this.hooks.notify(error instanceof Error ? error.message : String(error), true)); });
    const genOptions = element('div', 'fw-stock-options');
    genOptions.append(labelled('Generator', this.generator), labelled('Size', this.genSize), this.genCount, this.generateButton);
    this.generatePane.append(genOptions, this.genNote, this.genGrid);
    this.insertButton = element('button', 'primary', 'Insert');
    this.insertButton.type = 'button';
    this.insertButton.dataset.command = 'stock.insert';
    this.insertButton.addEventListener('click', () => { void this.insert().catch(error => this.hooks.notify(error instanceof Error ? error.message : String(error), true)); });
    const footer = element('div', 'fw-stock-footer');
    footer.append(this.detail, this.insertButton);
    this.element.append(this.tabs, this.search, this.iconsPane, this.photosPane, this.generatePane, footer);
    this.show('icons', false);
  }

  /** Called when the dialog opens. */
  async open(): Promise<void> {
    this.generatorList = [];  // formvis may have been set up since the dialog last opened
    await this.refresh();
    this.search.focus();
  }

  private show(tab: 'icons' | 'photos' | 'generate', load = true): void {
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
    this.generatePane.hidden = tab !== 'generate';
    this.search.type = tab === 'generate' ? 'text' : 'search';
    this.search.setAttribute('aria-label', tab === 'generate' ? 'Describe the picture to generate' : 'Search the stock library');
    this.search.placeholder = tab === 'icons' ? 'Search icons, e.g. heart, arrow right, mail' : tab === 'photos' ? 'Search your formlit photos by name, keyword or creator' : 'Describe the picture, e.g. a red bicycle against a white wall, soft morning light';
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
      text(this.iconCount, result.total === result.icons.length ? t('{0} icons from Lucide {1} (ISC; Feather-derived icons MIT).', [result.total, result.source.version]) : t('Showing {0} of {1} icons from Lucide {2} (ISC; Feather-derived icons MIT).', [result.icons.length, result.total, result.source.version]));
      keyed(this.iconGrid, result.icons, item => item.name, item => this.iconTile(item), (node, item) => {
        node.dataset.selected = String(item.name === this.selectedIcon);
        node.title = [item.name, ...item.tags.slice(0, 5)].join(', ');
      });
    } else if (this.tab === 'generate') {
      if (!this.generatorList.length) {
        const listing = await this.hooks.generators().catch(error => ({ available: false, generators: [] as Generator[], note: error instanceof Error ? error.message : String(error) }));
        if (token !== this.token) return;
        this.generatorList = listing.generators;
        keyed(this.generator, listing.generators, item => item.id, () => element('option'), (node, item) => {
          const option = node as HTMLOptionElement;
          option.value = item.id;
          option.disabled = !item.ready;
          const base = item.local ? item.label : t('{0} ({1}, your key)', [item.label, item.provider]);
          text(option, item.ready ? base : t('{0}: not set up', [base]));
          option.title = item.reason || item.licence;
        });
        const first = listing.generators.find(item => item.ready && item.local) || listing.generators.find(item => item.ready);
        if (first) this.generator.value = first.id;
        this.fillSizes();
        this.genNote.dataset.state = listing.available ? 'ok' : 'off';
        text(this.genNote, listing.note);
        this.generateButton.disabled = !listing.available;
      }
      this.renderGenerated();
    } else {
      try {
        const result = await this.hooks.photos(query);
        if (token !== this.token) return;
        this.photos = result.photos;
        this.photoNote.dataset.state = 'ok';
        if (result.photos.length) pieces(this.photoNote, [result.source.note, ' ', query ? tn(result.total, '{0} photo matches.', '{0} photos match.') : tn(result.total, '{0} photo.', '{0} photos.')]);
        else text(this.photoNote, query ? t('No formlit photos match "{0}".', [query]) : t('Your formlit library has no photos yet.'));
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
    tile.setAttribute('aria-label', t('{0} icon', [item.name]));
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

  private fillSizes(): void {
    const chosen = this.generatorList.find(item => item.id === this.generator.value);
    const sizes = chosen?.sizes.length ? chosen.sizes : ['1024x1024'];
    keyed(this.genSize, sizes.map(size => ({ size })), item => item.size, () => element('option'), (node, item) => {
      (node as HTMLOptionElement).value = item.size;
      const [w, h] = item.size.split('x').map(Number);
      text(node, w === h ? t('{0} square', [item.size]) : w > h ? t('{0} landscape', [item.size]) : t('{0} portrait', [item.size]));
    });
  }

  private async generate(): Promise<void> {
    const prompt = this.search.value.trim();
    if (prompt.length < 3) throw new Error('Describe the picture first, in a few words or more.');
    if (this.busy) return;
    this.busy = true;
    this.generateButton.disabled = true;
    try {
      const { job } = await this.hooks.generate(prompt, this.generator.value, this.genSize.value, Number(this.genCount.value));
      text(this.genNote, 'formvis is generating...');
      for (;;) {
        const state = await this.hooks.poll(job);
        if (state.status === 'done') {
          this.generated = [...(state.assets || []), ...this.generated].slice(0, 24);
          this.selectedGenerated = state.assets?.[0]?.id || '';
          text(this.genNote, tn(state.assets?.length || 0, '{0} picture saved to this project with the prompt, generator and licence. Check the model or provider terms before publishing.', '{0} pictures saved to this project with the prompt, generator and licence. Check the model or provider terms before publishing.'));
          break;
        }
        pieces(this.genNote, [t('formvis is generating... {0}%', [Math.round((state.progress || 0) * 100)]), state.message ? ` · ${state.message}` : '']);
        await new Promise(resolve => window.setTimeout(resolve, 1000));
      }
      if (this.tab === 'generate') this.renderGenerated();
    } finally {
      this.busy = false;
      this.generateButton.disabled = !this.generatorList.some(item => item.ready);
      this.describe();
    }
  }

  private renderGenerated(): void {
    keyed(this.genGrid, this.generated, item => item.id, item => {
      const tile = element('button', 'fw-stock-photo');
      tile.type = 'button';
      const img = element('img');
      img.alt = item.license?.prompt || 'Generated picture';
      img.src = this.hooks.url(item.url);
      tile.append(img, element('span', 'fw-stock-photo-name', item.license?.prompt || ''), element('span', 'fw-stock-photo-credit', item.license?.generator || 'formvis'));
      tile.addEventListener('click', () => { this.selectedGenerated = item.id; this.renderGenerated(); this.describe(); });
      tile.addEventListener('dblclick', () => { this.selectedGenerated = item.id; void this.insert().catch(error => this.hooks.notify(String(error), true)); });
      return tile;
    }, (node, item) => { node.dataset.selected = String(item.id === this.selectedGenerated); });
  }

  private describe(): void {
    if (this.tab === 'generate') {
      const item = this.generated.find(entry => entry.id === this.selectedGenerated);
      text(this.detail, item ? t('Generated with {0} from "{1}". Provenance is saved with the image; check the model or provider terms before publishing.', [item.license?.generator || 'formvis', item.license?.prompt || '']) : t('Describe a picture and press Generate (or Enter). Results stay here for this session.'));
      this.insertButton.disabled = !item || this.busy;
      return;
    }
    if (this.tab === 'icons') {
      const icon = this.icons.find(item => item.name === this.selectedIcon);
      text(this.detail, icon ? t('{0}: {1} licence (Lucide). Credited in CREDITS.txt when you export.', [icon.name, icon.license]) : t('Pick an icon; double-click inserts it.'));
      this.insertButton.disabled = !icon;
    } else {
      const photo = this.photos.find(item => item.id === this.selectedPhoto);
      const credit = photo?.credit;
      if (photo) {
        const parts = [credit?.copyright || credit?.creator, credit?.usage ? t('Usage: {0}', [credit.usage]) : '', t('Credit saved with the image.')].filter(Boolean) as string[];
        pieces(this.detail, parts.flatMap((part, index) => index ? [' · ', part] : [part]));
      } else text(this.detail, t('Pick a photo; double-click inserts it.'));
      this.insertButton.disabled = !photo;
    }
  }

  private async insert(): Promise<void> {
    this.insertButton.disabled = true;
    try {
      if (this.tab === 'generate') {
        const item = this.generated.find(entry => entry.id === this.selectedGenerated);
        if (!item) throw new Error('Generate a picture and pick it first.');
        const alt = (item.license?.prompt || '').slice(0, 160);
        await this.hooks.insert({ asset: { url: item.url, license: item.license }, alt, name: 'Generated image', width: 0, height: 0, note: '' }, 'generated');
        this.hooks.notify('Inserted the generated picture. Its alt text is the prompt; edit it to describe what the picture shows.');
      } else if (this.tab === 'icons') {
        if (!this.selectedIcon) throw new Error('Pick an icon first.');
        const made = await this.hooks.iconAsset(this.selectedIcon, this.color.value, Number(this.stroke.value), Math.max(8, Math.min(1024, Number(this.size.value) || 96)));
        await this.hooks.insert(made, 'icon');
        this.hooks.notify([t('Inserted the {0} icon ({1} licence, credited on export).', [this.selectedIcon, made.asset.license?.license || 'ISC']), made.note ? ` ${made.note}` : '']);
      } else {
        if (!this.selectedPhoto) throw new Error('Pick a photo first.');
        const made = await this.hooks.photoAsset(this.selectedPhoto);
        await this.hooks.insert(made, 'photo');
        this.hooks.notify([t('Inserted "{0}".', [made.name]), made.note ? ` ${made.note}` : '']);
      }
    } finally { this.describe(); }
  }
}
