import { element, keyed, options, text } from '../ui/dom';
import type { SiteReference } from '../api';
import { t, tn } from '../i18n';
import '../styles/ai-writer.css';

/**
 * AI copy (FW-070) in the Content inspector, and the prompt-to-site dialog (FW-069). Both go through the language model
 * set in formvis. Nothing the model writes is applied without a review: copy shows current and suggested text side by
 * side (the suggestion is editable) and changes the element only on Accept; a site shows its outline first and is
 * built only on Build pages. Both apply as one undo step.
 */
type Suggestion = { node: string; original: string; suggestion: string; action: string; unchanged?: boolean; note?: string };
type Plan = { site: string; palette?: string[]; pages: { name: string; slug: string; description: string; sections: { kind: string; heading: string; body: string; items: { title: string; text: string }[] }[] }[] };
type WriterHooks = {
  suggest: (node: string, action: string, tone?: string, brief?: string) => Promise<Suggestion>;
  apply: (node: string, value: string) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
};

const ACTIONS: { id: string; name: string }[] = [
  { id: 'rewrite', name: 'Rewrite' }, { id: 'shorten', name: 'Shorten' }, { id: 'lengthen', name: 'Lengthen' },
  { id: 'tone', name: 'Change tone' }, { id: 'generate', name: 'Write from a brief' }
];
const TONES = ['friendly', 'professional', 'confident', 'playful', 'calm'].map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) }));

export class AiWriter {
  readonly element = element('div', 'fw-ai');
  private action = element('select');
  private tone = element('select');
  private brief = element('input');
  private suggestButton = element('button', '', 'Suggest');
  private review = element('div', 'fw-ai-review');
  private current = element('p', 'fw-ai-current');
  private suggestion = element('textarea', 'fw-ai-suggestion');
  private node = '';
  private pending = 0;

  constructor(private hooks: WriterHooks) {
    this.action.dataset.field = 'ai.action'; this.action.setAttribute('aria-label', 'What to do with the text');
    this.tone.dataset.field = 'ai.tone'; this.tone.setAttribute('aria-label', 'Tone');
    this.brief.dataset.field = 'ai.brief'; this.brief.placeholder = 'What should it say?'; this.brief.setAttribute('aria-label', 'Brief');
    this.suggestion.dataset.field = 'ai.suggestion'; this.suggestion.setAttribute('aria-label', 'Suggested text (you can edit it)');
    options(this.action, ACTIONS);
    options(this.tone, TONES);
    this.action.addEventListener('change', () => this.layout());
    this.suggestButton.type = 'button';
    this.suggestButton.dataset.command = 'ai.suggest';
    this.suggestButton.addEventListener('click', () => { void this.suggest().catch(error => this.fail(error)); });
    const row = element('div', 'fw-ai-row');
    row.append(this.action, this.tone, this.brief, this.suggestButton);
    const accept = this.button('Accept', 'ai.accept', () => this.accept(), 'primary');
    const again = this.button('Try again', 'ai.again', () => this.suggest());
    const discard = this.button('Discard', 'ai.discard', () => { this.review.hidden = true; });
    const actions = element('div', 'fw-ai-actions');
    actions.append(discard, again, accept);
    this.review.append(element('span', 'fw-ai-label', 'Current'), this.current, element('span', 'fw-ai-label', 'Suggested (edit before accepting if you like)'), this.suggestion, actions);
    this.review.hidden = true;
    this.element.append(element('p', 'micro', 'Uses the language model set in formvis. You review every suggestion; nothing changes until you accept.'), row, this.review);
    this.layout();
  }

  /** The inspector calls this when the selection changes; a review for another element is dropped. */
  update(nodeId: string): void {
    if (nodeId !== this.node) { this.node = nodeId; this.review.hidden = true; this.pending++; }
  }

  private layout(): void {
    this.tone.hidden = this.action.value !== 'tone';
    this.brief.hidden = this.action.value !== 'generate';
  }

  private async suggest(): Promise<void> {
    const ticket = ++this.pending;
    this.suggestButton.disabled = true;
    text(this.suggestButton, 'Writing...');
    try {
      const result = await this.hooks.suggest(this.node, this.action.value, this.action.value === 'tone' ? this.tone.value : undefined, this.action.value === 'generate' ? this.brief.value : undefined);
      if (ticket !== this.pending) return;  // the selection moved on while the model was writing
      text(this.current, result.original || '(empty)');
      this.suggestion.value = result.suggestion;
      this.review.hidden = false;
      this.suggestion.focus();
      if (result.unchanged && result.note) this.hooks.notify(result.note);  // small models often hand the text back
    } finally {
      this.suggestButton.disabled = false;
      text(this.suggestButton, 'Suggest');
    }
  }

  private async accept(): Promise<void> {
    const value = this.suggestion.value.trim();
    if (!value) throw new Error('The suggestion is empty.');
    await this.hooks.apply(this.node, value);
    this.review.hidden = true;
    this.hooks.notify('Text replaced as one undo step.');
  }

  private fail(error: unknown): void { this.hooks.notify(error instanceof Error ? error.message : String(error), true); }

  private button(label: string, command: string, action: () => unknown, className = 'quiet'): HTMLButtonElement {
    const node = element('button', className, label);
    node.type = 'button';
    node.dataset.command = command;
    node.addEventListener('click', () => { Promise.resolve(action()).catch(error => this.fail(error)); });
    return node;
  }
}

type PlanResult = { plan: Plan; note: string; mode: 'outline' | 'guided' | 'revised' };
type SiteHooks = {
  status: () => Promise<{ available: boolean; note: string }>;
  plan: (prompt: string, pages: number, references: SiteReference[], previous?: Plan, instruction?: string) => Promise<PlanResult>;
  read: (file: File) => Promise<SiteReference>;
  build: (plan: Plan) => Promise<{ message: string; pages: { page: string; name: string }[] }>;
  opened: (pageId: string) => void;
  notify: (message: string, error?: boolean) => void;
};

export class SiteGenerator {
  readonly element = element('div', 'fw-ai fw-ai-site');
  private note = element('p', 'micro fw-ai-note');
  private prompt = element('textarea', 'fw-ai-prompt');
  private pages = element('select');
  private draftButton: HTMLButtonElement;
  private buildButton: HTMLButtonElement;
  private outline = element('div', 'fw-ai-outline');
  private outlineNote = element('p', 'micro fw-ai-outline-note');
  private plan: Plan | null = null;
  private references: SiteReference[] = [];
  private referenceIds = new WeakMap<SiteReference, number>();  // the same file added twice is two rows, each removable
  private nextReference = 0;
  private referenceList = element('ul', 'fw-ai-refs');
  private file = element('input');
  private reviseRow = element('div', 'fw-ai-row fw-ai-revise');
  private instruction = element('input');
  private reviseButton: HTMLButtonElement;

  constructor(private hooks: SiteHooks) {
    this.file.type = 'file';
    this.file.accept = 'application/pdf,image/png,image/jpeg,image/webp,image/gif';
    this.file.hidden = true;
    this.file.addEventListener('change', () => { void this.addReference().catch(error => this.hooks.notify(error instanceof Error ? error.message : String(error), true)); });
    const addReference = this.button('Add reference', 'ai.site-reference', () => this.file.click());
    addReference.title = 'A PDF with facts to use, or an image whose colours the buttons should follow';
    const refsRow = element('div', 'fw-ai-row fw-ai-refs-row');
    refsRow.append(addReference, element('span', 'micro', 'Optional: a PDF with facts, or an image for colours.'), this.file);
    this.instruction.dataset.field = 'ai.site-instruction';
    this.instruction.placeholder = 'Ask for a change, for example: add a pricing section';
    this.instruction.setAttribute('aria-label', 'Change to the outline');
    this.instruction.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); this.reviseButton.click(); } });
    this.reviseButton = this.button('Revise', 'ai.site-revise', () => this.revise());
    this.reviseRow.append(this.instruction, this.reviseButton);
    this.reviseRow.hidden = true;
    this.prompt.dataset.field = 'ai.site-prompt';
    this.prompt.placeholder = 'What the site is for, who it is for, and what pages it needs. For example: a ceramics studio in Lisbon that sells handmade bowls and runs weekend workshops; home, workshops, about and contact.';
    this.prompt.setAttribute('aria-label', 'Describe the site');
    this.pages.dataset.field = 'ai.site-pages';
    this.pages.setAttribute('aria-label', 'How many pages');
    options(this.pages, [1, 2, 3, 4].map(n => ({ id: String(n), name: tn(n, 'Up to {0} page', 'Up to {0} pages') })));
    this.pages.value = '3';
    this.draftButton = this.button('Draft outline', 'ai.site-draft', () => this.draft(), 'primary');
    this.buildButton = this.button('Build pages', 'ai.site-build', () => this.build(), 'primary');
    this.buildButton.hidden = true;
    const row = element('div', 'fw-ai-row');
    row.append(this.pages, this.draftButton, this.buildButton);
    this.outlineNote.hidden = true;
    this.element.append(this.note, this.prompt, refsRow, this.referenceList, row, this.outlineNote, this.outline, this.reviseRow);
  }

  private async addReference(): Promise<void> {
    const file = this.file.files?.[0];
    this.file.value = '';
    if (!file) return;
    if (this.references.length >= 6) throw new Error('Six references at most; remove one first.');
    const read = await this.hooks.read(file);
    this.referenceIds.set(read, ++this.nextReference);
    this.references.push(read);
    this.renderReferences();
    this.hooks.notify(read.kind === 'pdf' ? (read.truncated ? t('{0}: {1} characters of text will be used as facts (the first part only).', [read.name, read.text?.length ?? 0]) : t('{0}: {1} characters of text will be used as facts.', [read.name, read.text?.length ?? 0])) : t('{0}: its colours will be offered for the buttons.', [read.name]));
  }

  private renderReferences(): void {
    keyed(this.referenceList, this.references, item => String(this.referenceIds.get(item)), item => {
      const row = element('li', 'fw-ai-ref');
      const label = element('span', 'fw-ai-ref-name', item.kind === 'pdf' ? tn(item.pages ?? 0, '{0} (PDF, {1} page)', '{0} (PDF, {1} pages)', [item.name, item.pages ?? 0]) : item.name);
      const swatches = element('span', 'fw-ai-swatches');
      for (const color of item.colors ?? []) { const swatch = element('span', 'fw-ai-swatch'); swatch.style.background = color; swatch.title = color; swatches.append(swatch); }
      const remove = this.button('Remove', 'ai.site-reference-remove', () => { this.references = this.references.filter(entry => entry !== item); this.renderReferences(); });
      remove.setAttribute('aria-label', t('Remove {0}', [item.name]));
      row.append(label, swatches, remove);
      return row;
    }, () => undefined);
  }

  async open(): Promise<void> {
    const status = await this.hooks.status();
    this.note.dataset.state = status.available ? 'ok' : 'off';
    text(this.note, `${status.note} ${t('You review an outline first; building adds new editable pages in one undo step and changes nothing that exists.')}`);
    this.draftButton.disabled = !status.available;
    this.prompt.focus();
  }

  private async draft(): Promise<void> {
    if (this.prompt.value.trim().length < 10) throw new Error('Describe the site in a sentence or two first.');
    this.draftButton.disabled = true;
    text(this.draftButton, 'Drafting...');
    try {
      this.show(await this.hooks.plan(this.prompt.value.trim(), Number(this.pages.value), this.references));
      text(this.draftButton, 'Draft again');
    } catch (error) {
      text(this.draftButton, this.plan ? 'Draft again' : 'Draft outline');
      throw error;
    } finally { this.draftButton.disabled = false; }
  }

  private show(result: PlanResult): void {
    this.plan = result.plan;
    this.render(result.plan);
    text(this.outlineNote, result.note);
    this.outlineNote.hidden = false;
    this.outlineNote.dataset.mode = result.mode;
    this.buildButton.hidden = false;
    this.reviseRow.hidden = false;
  }

  /** A chat edit: the model gets the current outline and the person's instruction. A failed revision keeps the outline. */
  private async revise(): Promise<void> {
    if (!this.plan) throw new Error('Draft an outline first.');
    const instruction = this.instruction.value.trim();
    if (instruction.length < 3) throw new Error('Say what to change first.');
    this.reviseButton.disabled = true;
    text(this.reviseButton, 'Revising...');
    try {
      this.show(await this.hooks.plan(this.prompt.value.trim(), Number(this.pages.value), this.references, this.plan, instruction));
      this.instruction.value = '';
    } finally {
      this.reviseButton.disabled = false;
      text(this.reviseButton, 'Revise');
    }
  }

  private render(plan: Plan): void {
    this.outline.replaceChildren();  // a new outline replaces the old one wholesale: it is a different document, not an update
    const title = element('p', 'fw-ai-site-name', plan.site || 'Outline');
    this.outline.append(title);
    if (plan.palette?.length) {
      const colours = element('p', 'micro fw-ai-palette', 'Reference colours (the most readable one becomes the button colour unless the site has a brand kit): ');
      const swatches = element('span', 'fw-ai-swatches');
      for (const color of plan.palette) { const swatch = element('span', 'fw-ai-swatch'); swatch.style.background = color; swatch.title = color; swatches.append(swatch); }
      colours.append(swatches);
      this.outline.append(colours);
    }
    for (const page of plan.pages) {
      const block = element('div', 'fw-ai-page');
      block.append(element('strong', '', `${page.name}  ${page.slug || ''}`));
      const list = element('ol');
      for (const section of page.sections) list.append(element('li', '', `${section.kind}: ${section.heading || t('(no heading)')}${section.items.length ? ` (${tn(section.items.length, '{0} item', '{0} items')})` : ''}`));
      block.append(list);
      this.outline.append(block);
    }
  }

  private async build(): Promise<void> {
    if (!this.plan) throw new Error('Draft an outline first.');
    this.buildButton.disabled = true;
    try {
      const result = await this.hooks.build(this.plan);
      this.hooks.notify(result.message);
      this.plan = null;
      this.outline.replaceChildren();
      this.buildButton.hidden = true;
      this.reviseRow.hidden = true;
      this.outlineNote.hidden = true;
      this.references = [];
      this.renderReferences();
      text(this.draftButton, 'Draft outline');
      if (result.pages[0]) this.hooks.opened(result.pages[0].page);
    } finally { this.buildButton.disabled = false; }
  }

  private button(label: string, command: string, action: () => unknown, className = 'quiet'): HTMLButtonElement {
    const node = element('button', className, label);
    node.type = 'button';
    node.dataset.command = command;
    node.addEventListener('click', () => { Promise.resolve(action()).catch(error => this.hooks.notify(error instanceof Error ? error.message : String(error), true)); });
    return node;
  }
}
