import { command } from '../../api';
import { element, keyed, text, value } from '../../ui/dom';
import { icon, type Icon } from '../../ui/icons';
import { t } from '../../i18n';
import { readThemes, type InspectorContext } from './context';
import type { DesignThemes, EditorState, ThemeMode } from '../../types';

export interface ThemeHandle {
  fill(next: EditorState): void;
  preview(next: EditorState): { mode: ThemeMode; overrides: Record<string, string> };
}

export function installTheme(ctx: InspectorContext, onPreview: () => void): ThemeHandle {
  let chosen: ThemeMode | '' = '';
  let siteId = '';
  let latest: EditorState | undefined;

  const switcher = element('div', 'fw-theme-switch');
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', t('Canvas theme'));
  const modeButtons = new Map<ThemeMode, HTMLButtonElement>();
  for (const [mode, symbol, label] of [['dark', 'moon', 'Preview dark theme'], ['light', 'sun', 'Preview light theme']] as [ThemeMode, Icon, string][]) {
    const node = element('button', 'fw-theme-btn');
    node.type = 'button';
    node.append(icon(symbol));
    node.title = t(label);
    node.setAttribute('aria-label', t(label));
    node.setAttribute('aria-pressed', 'false');
    node.addEventListener('click', () => { chosen = mode; onPreview(); });
    modeButtons.set(mode, node);
    switcher.append(node);
  }
  ctx.anchors.stageBefore.before(switcher);

  const block = element('div', 'fw-ext-block');
  const head = element('div', 'fw-ext-head', t('Themes'));
  const grid = element('div', 'form-grid');
  const defaultMode = ctx.select([{ id: 'dark', name: t('Dark') }, { id: 'light', name: t('Light') }]);
  defaultMode.dataset.field = 'themes.default';
  const follow = element('input');
  follow.type = 'checkbox';
  follow.dataset.field = 'themes.followSystem';
  const followLabel = element('label', 'checkbox-field fw-theme-follow');
  followLabel.append(follow, element('span', '', t('Follow the visitor system setting')));
  grid.append(ctx.field(t('Default theme'), defaultMode), followLabel);
  const otherHead = element('div', 'micro fw-theme-other');
  const rows = element('div', 'fw-theme-rows');
  block.append(head, grid, otherHead, rows, element('p', 'micro', t('Tokens above hold the default theme. Fill a token here to give it another value in the other theme; empty keeps the default value. Visitors can switch themes and the choice is remembered on their device.')));
  ctx.panes.tokens.append(block);

  function other(themes: DesignThemes): ThemeMode { return themes.default === 'dark' ? 'light' : 'dark'; }
  function save(themes: DesignThemes): Promise<unknown> {
    const values: Record<string, Record<string, string>> = {};
    for (const mode of ['dark', 'light'] as ThemeMode[]) if (Object.keys(themes.values[mode]).length) values[mode] = themes.values[mode];
    return command('design.set', { key: 'themes', value: { default: themes.default, followSystem: themes.followSystem, values } });
  }
  defaultMode.addEventListener('change', () => void ctx.run(() => { const themes = readThemes(latest!); themes.default = defaultMode.value === 'light' ? 'light' : 'dark'; return save(themes); }));
  follow.addEventListener('change', () => void ctx.run(() => { const themes = readThemes(latest!); themes.followSystem = follow.checked; return save(themes); }));

  return {
    fill(next) {
      latest = next;
      const themes = readThemes(next);
      value(defaultMode, themes.default);
      if (follow.checked !== themes.followSystem) follow.checked = themes.followSystem;
      const alt = other(themes);
      text(otherHead, t('Values for {0} mode', [{ t: alt === 'light' ? 'Light' : 'Dark' }]));
      keyed(rows, Object.entries(next.site.tokens), item => item[0], () => {
        const row = element('div', 'tokens-row');
        const name = element('span', 'micro');
        const control = ctx.input();
        control.addEventListener('change', () => void ctx.run(() => {
          const current = readThemes(latest!);
          const map = current.values[other(current)];
          const key = row.dataset.key!;
          if (control.value.trim()) map[key] = control.value.trim(); else delete map[key];
          return save(current);
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
      const mode = chosen || themes.default;
      const overrides: Record<string, string> = {};
      if (mode !== themes.default) for (const [key, content] of Object.entries(themes.values[mode])) if (key in next.site.tokens) overrides[key] = content;
      for (const [id, node] of modeButtons) {
        const on = id === mode;
        if (node.classList.contains('is-on') !== on) node.classList.toggle('is-on', on);
        if (node.getAttribute('aria-pressed') !== String(on)) node.setAttribute('aria-pressed', String(on));
      }
      return { mode, overrides };
    }
  };
}
