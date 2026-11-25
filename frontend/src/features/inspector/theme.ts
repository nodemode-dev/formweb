import { command } from '../../api';
import { element, keyed, text, value } from '../../ui/dom';
import { icon, type Icon } from '../../ui/icons';
import { label, labelAttr } from '../../i18n';
import { designGroup, readThemes, type InspectorContext } from './context';
import { fieldOf, labeled, selectOf } from './labeled';
import type { Command, DesignThemes, EditorState, ThemeMode } from '../../types';

export interface ThemeHandle {
  fill(next: EditorState): void;
  preview(next: EditorState): { mode: ThemeMode | ''; overrides: Record<string, string> };
}

export const hasThemes = (next: EditorState): boolean => !!designGroup(next).themes;

export function otherTheme(themes: DesignThemes): ThemeMode { return themes.default === 'dark' ? 'light' : 'dark'; }

export function themesCommand(themes: DesignThemes): Command {
  const values: Record<string, Record<string, string>> = {};
  for (const mode of ['dark', 'light'] as ThemeMode[]) if (Object.keys(themes.values[mode]).length) values[mode] = themes.values[mode];
  return { command: 'design.set', params: { key: 'themes', value: { default: themes.default, followSystem: themes.followSystem, values } } };
}

export function otherThemeValueCommand(next: EditorState, key: string, content: string): Command {
  const themes = readThemes(next);
  const map = themes.values[otherTheme(themes)];
  if (content.trim()) map[key] = content.trim(); else delete map[key];
  return themesCommand(themes);
}

export function installTheme(ctx: InspectorContext, onPreview: () => void): ThemeHandle {
  let chosen: ThemeMode | '' = '';
  let siteId = '';
  let latest: EditorState | undefined;

  const switcher = element('div', 'fw-theme-switch');
  switcher.setAttribute('role', 'group');
  labelAttr(switcher, 'aria-label', 'Canvas theme');
  const modeButtons = new Map<ThemeMode, HTMLButtonElement>();
  for (const [mode, symbol, label] of [['dark', 'moon', 'Preview dark theme'], ['light', 'sun', 'Preview light theme']] as [ThemeMode, Icon, string][]) {
    const node = element('button', 'fw-theme-btn');
    node.type = 'button';
    node.append(icon(symbol));
    labelAttr(node, 'title', label);
    labelAttr(node, 'aria-label', label);
    node.setAttribute('aria-pressed', 'false');
    node.addEventListener('click', () => { chosen = mode; onPreview(); });
    modeButtons.set(mode, node);
    switcher.append(node);
  }
  ctx.anchors.stageBefore.before(switcher);

  const block = element('div', 'fw-ext-block');
  const head = labeled('div', 'fw-ext-head', 'Themes');
  const grid = element('div', 'form-grid');
  const defaultMode = selectOf(ctx, [{ id: '', name: 'None', en: 'None' }, { id: 'dark', name: 'Dark', en: 'Dark' }, { id: 'light', name: 'Light', en: 'Light' }]);
  defaultMode.dataset.field = 'themes.default';
  const follow = element('input');
  follow.type = 'checkbox';
  follow.dataset.field = 'themes.followSystem';
  const followLabel = element('label', 'checkbox-field fw-theme-follow');
  followLabel.append(follow, labeled('span', '', 'Follow the visitor system setting'));
  grid.append(fieldOf(ctx, 'Default theme', defaultMode), followLabel);
  const otherHead = element('div', 'micro fw-theme-other');
  const rows = element('div', 'fw-theme-rows');
  block.append(head, grid, otherHead, rows, labeled('p', 'micro', 'Tokens above hold the default theme. Fill a token here to give it another value in the other theme; empty keeps the default value. Visitors can switch themes and the choice is remembered on their device.'));
  ctx.panes.tokens.append(block);

  function save(themes: DesignThemes): Promise<unknown> {
    const step = themesCommand(themes);
    return command(step.command, step.params);
  }
  defaultMode.addEventListener('change', () => void ctx.run(() => { if (!defaultMode.value) return command('design.set', { key: 'themes', value: null }); const themes = readThemes(latest!); themes.default = defaultMode.value === 'light' ? 'light' : 'dark'; return save(themes); }));
  follow.addEventListener('change', () => void ctx.run(() => { const themes = readThemes(latest!); themes.followSystem = follow.checked; return save(themes); }));

  return {
    fill(next) {
      latest = next;
      const themes = readThemes(next);
      const defined = hasThemes(next);
      value(defaultMode, defined ? themes.default : '');
      if (follow.checked !== themes.followSystem) follow.checked = themes.followSystem;
      if (follow.disabled === defined) follow.disabled = !defined;
      if (rows.hidden === defined) rows.hidden = !defined;
      const alt = otherTheme(themes);
      if (defined) label(otherHead, 'Values for {0} mode', [{ t: alt === 'light' ? 'Light' : 'Dark' }]);
      else label(otherHead, 'This site has no themes, so every visitor sees the colors above. Pick a default theme to give it a second set of values.');
      keyed(rows, Object.entries(next.site.tokens), item => item[0], () => {
        const row = element('div', 'tokens-row');
        const name = element('span', 'micro');
        const control = ctx.input();
        control.addEventListener('change', () => void ctx.run(() => {
          const step = otherThemeValueCommand(latest!, row.dataset.key!, control.value);
          return command(step.command, step.params);
        }));
        row.append(name, control);
        return row;
      }, (row, [key, base]) => {
        text(row.children[0] as HTMLElement, `--${key.replace(/^--/, '')}`);
        const field = row.children[1] as HTMLInputElement;
        value(field, themes.values[alt][key] || '');
        if (field.placeholder !== base) field.placeholder = base;
      });
    },
    preview(next) {
      const themes = readThemes(next);
      if (siteId !== next.site.id) { siteId = next.site.id; chosen = ''; }
      const defined = hasThemes(next);
      const mode = defined ? chosen || themes.default : '';
      for (const node of modeButtons.values()) if (node.disabled === defined) node.disabled = !defined;
      const overrides: Record<string, string> = {};
      if (mode && mode !== themes.default) for (const [key, content] of Object.entries(themes.values[mode])) if (key in next.site.tokens) overrides[key] = content;
      for (const [id, node] of modeButtons) {
        const on = id === mode;
        if (node.classList.contains('is-on') !== on) node.classList.toggle('is-on', on);
        if (node.getAttribute('aria-pressed') !== String(on)) node.setAttribute('aria-pressed', String(on));
      }
      return { mode, overrides };
    }
  };
}
