import type { SiteNode } from '../../types';
import { element, keyed, text as setText } from '../../ui/dom';
import { ancestorWhere, btn, check, field, note, number, pageOf, row, section, select, setChecked, setValue, text, type AuditRow, type Tab, type WishlistContext } from './kit';

type Constraint = { preset?: string; accept?: string; maxSize?: number | null; pattern?: string; required?: boolean | null; [key: string]: unknown };
type FormGroup = { forms?: Record<string, { constraints?: Record<string, Constraint> }> };

function formOf(ctx: WishlistContext): SiteNode | null {
  return ancestorWhere(ctx.state(), ctx.selected(), node => node.tag === 'form');
}

function controls(ctx: WishlistContext, form: SiteNode): SiteNode[] {
  const found: SiteNode[] = [];
  const pending = [...form.children];
  while (pending.length) {
    const node = ctx.state().site.nodes[pending.shift() as string];
    if (!node) continue;
    if (['input', 'select', 'textarea'].includes(node.tag) && node.attrs.name && node.attrs.type !== 'submit' && node.attrs.type !== 'hidden') found.push(node);
    pending.push(...node.children);
  }
  return found;
}

export function buildQuality(ctx: WishlistContext): Tab[] {
  const stepNote = note();
  const stepRows = element('div', 'wl-list');
  const stepCount = number(2, 12);
  const assignments = new Map<string, number>();
  const apply = (steps: { title: string; nodes: string[] }[]) => {
    const form = formOf(ctx);
    if (!form) return;
    const batch = [];
    if (form.children.some(id => ctx.state().site.nodes[id]?.attrs['data-fw-step'])) batch.push({ command: 'form.steps', params: { form: form.id, steps: [] } });
    if (steps.length) batch.push({ command: 'form.steps', params: { form: form.id, steps } });
    void ctx.commands(batch);
  };
  const split = () => {
    const form = formOf(ctx);
    if (!form) { ctx.notify('Select a form first.', true); return; }
    const count = Math.max(2, Math.min(12, Number(stepCount.value) || 2));
    const groups = Array.from({ length: count }, (_, index) => ({ title: `Step ${index + 1}`, nodes: [] as string[] }));
    for (const id of form.children) {
      if (ctx.state().site.nodes[id]?.attrs['data-fw-step']) continue;
      groups[Math.min(count - 1, Math.max(0, (assignments.get(id) ?? 1) - 1))].nodes.push(id);
    }
    const used = groups.filter(group => group.nodes.length);
    if (used.length < 2) { ctx.notify('Put elements on at least two steps.', true); return; }
    apply(used);
  };
  const stepsPane = element('div', 'wl-pane');
  stepsPane.append(
    section('Multi-step form', stepNote, field('Number of steps', stepCount), element('p', 'wl-hint', 'Choose the step for each element directly inside the form. Put the submit button on the last step. Visitors move with Back and Next, and each step is checked before continuing.'), stepRows,
      row(btn('Group into steps', split, 'wl-primary'), btn('Remove steps', () => apply([]))))
  );

  const fieldRows = element('div', 'wl-list');
  const fieldNote = note();
  const save = (name: string, patch: Constraint) => {
    const form = formOf(ctx);
    if (!form) return;
    const group = (ctx.state().site.extensions?.forms || {}) as FormGroup;
    const forms = JSON.parse(JSON.stringify(group.forms || {})) as NonNullable<FormGroup['forms']>;
    const entry = forms[form.id] || (forms[form.id] = {});
    const constraints = entry.constraints || (entry.constraints = {});
    const merged: Constraint = { ...(constraints[name] || {}), ...patch };
    for (const key of Object.keys(merged)) if (merged[key] === '' || merged[key] === null || merged[key] === undefined) delete merged[key];
    if (Object.keys(merged).length) constraints[name] = merged; else delete constraints[name];
    void ctx.commands([{ command: 'extension.set', params: { group: 'forms', value: { ...group, forms } } }]);
  };
  const validationPane = element('div', 'wl-pane');
  validationPane.append(section('Field validation and uploads', fieldNote, fieldRows, element('p', 'wl-hint', 'Presets check phone numbers, postal codes and email in the browser and again on the server. File fields accept images, PDF, text, CSV, Word, Excel and ZIP up to 2 MB each; files are stored beside the submission.')));

  const stepsTab: Tab = {
    id: 'steps', label: 'Steps', element: stepsPane,
    refresh() {
      const nodes = ctx.state().site.nodes;
      const form = formOf(ctx);
      const direct = form ? form.children.map(id => nodes[id]).filter(node => node && !node.attrs['data-fw-step']) : [];
      const stepped = form ? form.children.filter(id => nodes[id]?.attrs['data-fw-step']).length : 0;
      setText(stepNote, form ? (stepped ? `${form.name || 'Form'} has ${stepped} steps. Remove them to regroup.` : `${form.name || 'Form'}: ${direct.length} elements.`) : 'Select a form, or an element inside one.');
      keyed(stepRows, direct, node => node.id, () => {
        const node = element('div', 'wl-item');
        node.append(element('span', 'wl-item-name'), select(Array.from({ length: 12 }, (_, i) => [String(i + 1), `Step ${i + 1}`] as [string, string])));
        return node;
      }, (node, item) => {
        setText(node.firstElementChild as HTMLElement, item.name || item.tag);
        const pick = node.lastElementChild as HTMLSelectElement;
        const count = Math.max(2, Number(stepCount.value) || 2);
        Array.from(pick.options).forEach((option, index) => { option.hidden = index >= count; });
        setValue(pick, String(assignments.get(item.id) ?? 1));
        pick.onchange = () => { assignments.set(item.id, Number(pick.value)); };
      });
      setValue(stepCount, stepCount.value || '2');
    }
  };
  const validationTab: Tab = {
    id: 'validation', label: 'Fields', element: validationPane,
    refresh() {
      const form = formOf(ctx);
      const list = form ? controls(ctx, form) : [];
      setText(fieldNote, form ? `${list.length} fields in ${form.name || 'the form'}.` : 'Select a form, or an element inside one.');
      const constraints = ((ctx.state().site.extensions?.forms as FormGroup | undefined)?.forms?.[form?.id || '']?.constraints) || {};
      keyed(fieldRows, list, node => node.id, () => {
        const node = element('div', 'wl-item wl-field-row');
        const preset = select([['', 'No preset'], ['phone', 'Phone'], ['postal', 'Postal code'], ['email', 'Email']]);
        preset.setAttribute('aria-label', 'Validation preset');
        const accept = text('.pdf,.png or image/*');
        accept.setAttribute('aria-label', 'Accepted file types');
        const size = number(1, 2048);
        size.placeholder = 'Max KB';
        size.setAttribute('aria-label', 'Maximum file size in KB');
        const pattern = text('Pattern, for example [A-Z]{3}[0-9]{4}');
        pattern.setAttribute('aria-label', 'Custom pattern');
        const required = element('input');
        node.append(element('span', 'wl-item-name'), preset, accept, size, pattern, check('Required', required));
        return node;
      }, (node, item) => {
        const name = item.attrs.name;
        const rule = constraints[name] || {};
        const file = item.attrs.type === 'file';
        setText(node.children[0] as HTMLElement, `${name}${file ? ' (file)' : ''}`);
        const preset = node.children[1] as HTMLSelectElement;
        const accept = node.children[2] as HTMLInputElement;
        preset.hidden = file;
        accept.hidden = !file;
        const size = node.children[3] as HTMLInputElement;
        size.hidden = !file;
        setValue(preset, rule.preset || '');
        setValue(accept, rule.accept || item.attrs.accept || '');
        setValue(size, rule.maxSize ? String(Math.ceil(rule.maxSize / 1024)) : '');
        size.onchange = () => { const kb = Math.round(Number(size.value)); if (!size.value) save(name, { maxSize: null }); else if (kb >= 1 && kb <= 2048) save(name, { maxSize: kb * 1024 }); else ctx.notify('Use a size from 1 to 2048 KB.', true); };
        const pattern = node.children[4] as HTMLInputElement;
        const required = (node.children[5] as HTMLElement).firstElementChild as HTMLInputElement;
        pattern.hidden = file;
        setValue(pattern, rule.pattern || '');
        setChecked(required, !!rule.required);
        pattern.onchange = () => { const value = pattern.value.trim(); if (value.length <= 256 && !/[()|]|\\[1-9]/.test(value)) save(name, { pattern: value }); else { pattern.value = rule.pattern || ''; ctx.notify('Patterns cannot use groups or alternation and stay under 256 characters.', true); } };
        required.onchange = () => save(name, { required: required.checked ? true : null });
        preset.onchange = () => save(name, { preset: preset.value });
        accept.onchange = () => { if (/^[A-Za-z0-9./*,+\- ]{0,200}$/.test(accept.value)) save(name, { accept: accept.value.trim() }); else ctx.notify('Use extensions or types separated by commas.', true); };
      });
    }
  };

  const checkNote = note();
  const checkRows = element('div', 'wl-list');
  let rows: (AuditRow & { key: string })[] = [];
  let busy = false;
  const labels: Record<string, string> = { 'a11y.alt': 'Missing alt text', 'a11y.link-empty': 'Empty link', 'a11y.button-empty': 'Empty button', 'a11y.heading-order': 'Heading order', 'a11y.contrast': 'Low contrast', 'a11y.svg-title': 'SVG needs a name', 'a11y.svg-decorative': 'SVG without a name', 'a11y.table-header': 'Table without headers', 'a11y.table-caption': 'Table without caption', 'a11y.form-label': 'Field without label', 'a11y.h1': 'Heading one', 'link.placeholder': 'Link without destination' };
  const draw = () => keyed(checkRows, rows, item => item.key, () => {
    const node = element('div', 'wl-item');
    node.append(element('span', 'wl-item-name'), btn('Select', () => undefined, 'wl-quiet'));
    return node;
  }, (node, item) => {
    setText(node.firstElementChild as HTMLElement, `${labels[item.code] || item.code}: ${item.message}`);
    node.dataset.severity = item.severity;
    const select = node.lastElementChild as HTMLButtonElement;
    select.onclick = () => {
      if (!item.node) return;
      const state = ctx.state();
      const target = pageOf(state, item.node);
      if (target && target !== pageOf(state, ctx.selected())) document.querySelector<HTMLElement>(`.list-row[data-key="${target}"]`)?.click();
      ctx.select(item.node);
    };
    select.disabled = !item.node;
  });
  const run = async () => {
    if (busy) return;
    busy = true;
    setText(checkNote, 'Checking...');
    try {
      const result = await ctx.audit();
      rows = result.issues.filter(issue => issue.code.startsWith('a11y.') || issue.code === 'link.placeholder').map((issue, index) => ({ ...issue, key: `${issue.code}-${issue.node || ''}-${index}` }));
      setText(checkNote, rows.length ? `${rows.length} issues to review before publishing.` : 'No accessibility or semantic issues found.');
      draw();
    } catch (error) { setText(checkNote, error instanceof Error ? error.message : 'The check could not run.'); }
    finally { busy = false; }
  };
  const checkPane = element('div', 'wl-pane');
  checkPane.append(section('Before you publish', element('p', 'wl-hint', 'Checks alt text, empty links and buttons, heading order, text contrast, SVG names and table headers.'), btn('Run checks', () => { void run(); }, 'wl-primary'), checkNote, checkRows));
  const checksTab: Tab = { id: 'checks', label: 'Checks', element: checkPane, refresh: () => undefined };
  return [stepsTab, validationTab, checksTab];
}
