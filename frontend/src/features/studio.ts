import { accept, command, download, request, state, subscribe } from '../api';
import type { EditorState } from '../types';
import { element, keyed, labelPieces, options, text } from '../ui/dom';
import { icon } from '../ui/icons';
import { deliverFile } from '../ui/downloads';
import { label, t } from '../i18n';
import { authoringActions } from './authoring';
import { serviceActions } from './services';
import { providerActions } from './providers';
import { codeActions } from './code';
import { advancedActions } from './advanced';
import { categories, type FeatureAction, type FeatureContext, type Parameter } from './contracts';

interface ActionView {
  spec: FeatureAction;
  pane: HTMLElement;
  controls: Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  output: HTMLElement;
  initialized: boolean;
  dirty: boolean;
  run: HTMLButtonElement;
}
const allActions = [...authoringActions, ...serviceActions, ...providerActions, ...codeActions, ...advancedActions];
function makeButton(label: string, action: () => void, primary = false): HTMLButtonElement {
  const button = element('button', primary ? 'primary' : '', label);
  button.type = 'button';
  button.addEventListener('click', action);
  return button;
}
export class FeatureStudio {
  readonly button: HTMLButtonElement;
  private scrim = element('div', 'dialog-scrim feature-scrim');
  private dialog = element('section', 'dialog feature-studio');
  private categoryList = element('div', 'feature-categories');
  private actionList = element('div', 'feature-actions');
  private content = element('div', 'feature-content');
  private summary = element('span', 'feature-selection');
  private footerStatus = element('span', 'dialog-status');
  private views = new Map<string, ActionView>();
  private activeCategory = 'design';
  private activeAction = '';
  private previousFocus: HTMLElement | null = null;

  constructor(private context: FeatureContext, overlay: HTMLElement) {
    this.button = makeButton('Studio', () => this.open());
    this.button.classList.add('quiet');
    this.button.title = 'Advanced authoring, services and connected workflows';
    this.scrim.hidden = true;
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-label', 'FormWeb advanced studio');
    const header = element('div', 'dialog-head');
    const identity = element('div');
    identity.append(element('div', 'dialog-title', 'Website studio'), this.summary);
    const close = makeButton('Close', () => this.close());
    close.prepend(icon('close'));
    header.append(identity, close);
    const body = element('div', 'feature-workspace');
    body.append(this.categoryList, this.actionList, this.content);
    const footer = element('div', 'dialog-footer');
    footer.append(this.footerStatus, makeButton('Close', () => this.close()));
    this.dialog.append(header, body, footer);
    this.scrim.append(this.dialog);
    overlay.append(this.scrim);
    this.scrim.addEventListener('click', event => { if (event.target === this.scrim) this.close(); });
    this.scrim.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(this.dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href]')).filter(node => !node.closest('[hidden]') && !(node as HTMLInputElement).disabled);
      if (event.shiftKey && document.activeElement === controls[0]) { controls.at(-1)?.focus(); event.preventDefault(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { controls[0]?.focus(); event.preventDefault(); }
    });
    for (const spec of allActions) this.mount(spec);
    keyed(this.categoryList, categories, item => item.id, () => {
      const row = makeButton('', () => {});
      row.className = 'feature-category';
      row.addEventListener('click', () => this.showCategory(row.dataset.key!));
      row.append(element('span'), element('small'));
      return row;
    }, (row, category) => {
      text(row.children[0] as HTMLElement, category.title);
      text(row.children[1] as HTMLElement, String(allActions.filter(action => action.category === category.id).length));
    });
    subscribe(next => this.update(next));
  }

  open(category = 'design', action?: string): void {
    try {
      state();
      this.previousFocus = document.activeElement as HTMLElement;
      this.scrim.hidden = false;
      this.showCategory(category, action);
      this.update(state());
      this.dialog.querySelector<HTMLButtonElement>('button')?.focus();
    } catch (error) { this.context.notify(error instanceof Error ? error.message : String(error), true); }
  }
  close(): void {
    this.scrim.hidden = true;
    this.previousFocus?.focus();
  }
  get opened(): boolean { return !this.scrim.hidden; }
  private showCategory(id: string, action?: string): void {
    this.activeCategory = id;
    for (const row of Array.from(this.categoryList.children)) row.classList.toggle('active', (row as HTMLElement).dataset.key === id);
    const actions = allActions.filter(item => item.category === id);
    keyed(this.actionList, actions, action => action.id, () => {
      const row = makeButton('', () => {});
      row.className = 'feature-action-row';
      row.addEventListener('click', () => this.showAction(row.dataset.key!));
      return row;
    }, (row, action) => text(row, action.title));
    this.showAction(action || actions[0]?.id || '');
  }
  private showAction(id: string): void {
    this.activeAction = id;
    this.views.forEach((view, key) => { view.pane.hidden = key !== id; });
    for (const row of Array.from(this.actionList.children)) row.classList.toggle('active', (row as HTMLElement).dataset.key === id);
    const view = this.views.get(id);
    if (!view) return;
    if (!view.initialized) { this.fill(view, false); view.initialized = true; }
    text(this.footerStatus, view.spec.responseNote || 'Changes are validated by the site engine or the selected service.');
  }
  private mount(spec: FeatureAction): void {
    const pane = element('section', 'feature-action-pane');
    pane.hidden = true;
    const heading = element('h2', '', spec.title);
    const explanation = element('p', 'feature-description', spec.description);
    const address = element('span', 'feature-operation', spec.command || '');
    if (!spec.command) {
      if (spec.group) label(address, 'Site configuration: {0}', [spec.group]);
      else if (spec.execute) label(address, 'Validated authoring workflow');
      else label(address, '{0} service workflow', [spec.method || 'GET']);
    }
    const controls = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
    const form = element('div', 'feature-fields');
    const output = element('pre', 'feature-result', 'No operation has been run.');
    output.setAttribute('aria-live', 'polite');
    output.tabIndex = 0;
    const run = makeButton(spec.runLabel || (spec.download ? 'Download CSV' : spec.command || spec.group ? 'Validate & save' : spec.execute ? 'Validate & run' : spec.method === 'DELETE' ? 'Delete saved project' : spec.method === 'GET' || !spec.method ? 'Refresh data' : 'Run workflow'), () => void this.execute(spec.id), true);
    const view: ActionView = { spec, pane, controls, output, run, initialized: false, dirty: false };
    for (const parameter of spec.parameters || []) {
      let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (parameter.choices) {
        control = element('select');
        options(control, [...(parameter.optional ? [{ id: '', name: 'Leave unchanged' }] : []), ...parameter.choices.map(id => ({ id, name: id }))]);
      } else if (parameter.type === 'json' || parameter.type === 'multiline') control = element('textarea', parameter.type === 'json' ? 'code-input feature-json' : 'feature-text');
      else {
        control = element('input');
        control.type = parameter.type === 'file' ? 'file' : parameter.type === 'boolean' ? 'checkbox' : parameter.type === 'number' ? 'number' : parameter.type === 'password' ? 'password' : 'text';
        if (parameter.type === 'file') control.accept = '.csv,text/csv';
        if (parameter.type === 'password') control.autocomplete = 'off';
      }
      control.dataset.parameter = parameter.name;
      control.addEventListener('input', () => { view.dirty = true; });
      const label = element('label', parameter.type === 'boolean' ? 'feature-checkbox' : 'field');
      if (parameter.type === 'boolean') label.append(control, element('span', '', parameter.label));
      else label.append(element('span', 'field-label', parameter.label + (parameter.optional ? ' (optional)' : '')), control);
      if (parameter.hint) label.append(element('span', 'micro', parameter.hint));
      form.append(label);
      controls.set(parameter.name, control);
    }
    const actions = element('div', 'feature-execute');
    actions.append(makeButton('Use selection & example', () => this.fill(view, false)));
    if (spec.group) actions.append(makeButton('Load current configuration', () => this.fill(view, true)));
    actions.append(run);
    pane.append(heading, explanation, address, form, actions, element('h3', '', 'Result'), output);
    this.content.append(pane);
    this.views.set(spec.id, view);
  }
  private fill(view: ActionView, current: boolean): void {
    const example = view.spec.example?.(state(), this.context.selection()) || {};
    if (view.spec.group && current) example.value = state().site.extensions?.[view.spec.group] || {};
    for (const parameter of view.spec.parameters || []) {
      const control = view.controls.get(parameter.name)!;
      const supplied = example[parameter.name];
      if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(supplied);
      else control.value = supplied === undefined ? '' : parameter.type === 'json' ? JSON.stringify(supplied, null, 2) : String(supplied);
    }
    view.dirty = false;
    text(this.footerStatus, current ? 'Current persisted configuration loaded into the editor.' : 'Example parameters use the current selection. Review before applying.');
  }
  private async parameters(view: ActionView): Promise<Record<string, unknown>> {
    const parameters: Record<string, unknown> = {};
    for (const parameter of view.spec.parameters || []) {
      const control = view.controls.get(parameter.name)!;
      if (control instanceof HTMLInputElement && control.type === 'checkbox') { parameters[parameter.name] = control.checked; continue; }
      if (control instanceof HTMLInputElement && control.type === 'file') {
        const file = control.files?.[0];
        if (!file && parameter.optional) continue;
        if (!file) throw new Error(t('{0} is required.', [parameter.label]));
        if (file.size > 8 * 1024 * 1024) throw new Error('CSV files must be 8 MiB or smaller.');
        parameters[parameter.name] = await file.text();
        continue;
      }
      const raw = control.value.trim();
      if (!raw && parameter.optional) continue;
      if (!raw) throw new Error(t('{0} is required.', [parameter.label]));
      if (parameter.type === 'json') {
        try { parameters[parameter.name] = JSON.parse(raw); }
        catch { throw new Error(t('{0} must contain valid JSON.', [parameter.label])); }
      } else if (parameter.type === 'number') {
        if (!Number.isFinite(Number(raw))) throw new Error(t('{0} must be a finite number.', [parameter.label]));
        parameters[parameter.name] = Number(raw);
      } else parameters[parameter.name] = raw;
    }
    return parameters;
  }
  private async execute(id: string): Promise<void> {
    const view = this.views.get(id)!;
    view.run.disabled = true;
    try {
      const params = await this.parameters(view);
      let response: unknown;
      if (view.spec.execute) response = await view.spec.execute(params, this.context);
      else if (view.spec.command) response = await command(view.spec.command, params);
      else if (view.spec.group) response = await command('extension.set', { group: view.spec.group, value: params.value });
      else {
        const path = typeof view.spec.path === 'function' ? view.spec.path(params) : view.spec.path!;
        if (view.spec.download) {
          const file = view.spec.download;
          response = { downloaded: await deliverFile(file, started => download(path, file, started)) ? file : null };
        } else {
          const body = { ...params };
          if (typeof view.spec.path === 'function') { delete body.id; delete body.source; delete body.email; }
          response = await request(path, (view.spec.method || 'GET') === 'GET' ? undefined : body, view.spec.method);
        }
      }
      const envelope = response as { state?: EditorState };
      const candidate = envelope?.state || response as EditorState;
      const siteState = candidate?.site && typeof candidate.revision === 'number' ? candidate : undefined;
      if (siteState) accept(siteState);
      const summary = siteState ? { revision: siteState.revision, pages: siteState.site.pages.length, nodes: Object.keys(siteState.site.nodes).length, canUndo: siteState.canUndo, canRedo: siteState.canRedo } : undefined;
      const shown = siteState ? envelope?.state ? { ...response as object, state: summary } : summary : response;
      const encoded = JSON.stringify(shown, null, 2) || 'The service returned no data.';
      text(view.output, encoded.length > 60000 ? encoded.slice(0, 60000) + '\nDisplay truncated at 60,000 characters.' : encoded);
      view.output.classList.remove('error');
      view.dirty = false;
      const saved = !!view.spec.command || !!view.spec.group;
      if (saved) label(this.footerStatus, 'Validated change saved at revision {0}.', [state().revision]);
      else label(this.footerStatus, 'Service response received. Inspect its status and output.');
      this.context.notify(saved ? t('{0} saved.', [view.spec.title]) : t('{0}: response received.', [view.spec.title]));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      text(view.output, message);
      view.output.classList.add('error');
      text(this.footerStatus, message);
      this.context.notify(message, true);
    } finally { view.run.disabled = false; }
  }
  private update(next: EditorState): void {
    if (this.scrim.hidden) return;
    const selected = this.context.selection();
    labelPieces(this.summary, [`${next.site.name} · ${next.site.nodes[selected.node]?.name || selected.node} · ${selected.locale} · `, { en: 'rev {0}', values: [next.revision] }]);
  }
}
