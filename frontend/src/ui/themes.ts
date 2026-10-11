export interface ThemeProfile { label: string; vars: Record<string, string>; light?: boolean }

export const THEMES: Record<string, ThemeProfile> = {
  'studio': { label: 'Studio Dark', vars: { '--bg-primary': '#111111', '--bg-secondary': '#17151b', '--bg-tertiary': '#222127', '--border-color': '#2a2a2a', '--border-light': '#34333a', '--text-primary': '#f7f7f7', '--text-secondary': '#a4a4a4', '--text-muted': '#717072', '--canvas-bg': '#1c1b1d', '--grid-color': '#5e5e60', '--bg-node': '#191919' } },
  'nodemode-dark': { label: 'NodeMode Dark', vars: { '--bg-primary': '#0a0a0a', '--bg-secondary': '#121218', '--bg-tertiary': '#1a1a24', '--border-color': '#2a2a35', '--border-light': '#3a3a48', '--text-primary': '#e8e8ee', '--text-secondary': '#a8a8b8', '--text-muted': '#6a6a7a', '--canvas-bg': '#0a0a0a', '--grid-color': 'rgba(255,255,255,0.04)' } },
  'light': { label: 'Light', light: true, vars: { '--bg-primary': '#ecebe6', '--bg-secondary': '#f7f6f1', '--bg-tertiary': '#e2e0d8', '--bg-node': '#f4f3ed', '--border-color': '#d1cdc1', '--border-light': '#beb9aa', '--text-primary': '#26241d', '--text-secondary': '#4c4a40', '--text-muted': '#8b887a', '--canvas-bg': '#e7e5dd', '--grid-color': 'rgba(70,60,30,0.10)' } },
  'github-dark': { label: 'GitHub Dark', vars: { '--bg-primary': '#0d1117', '--bg-secondary': '#161b22', '--bg-tertiary': '#21262d', '--border-color': '#30363d', '--border-light': '#3d444d', '--text-primary': '#e6edf3', '--text-secondary': '#9198a1', '--text-muted': '#656c76', '--canvas-bg': '#0d1117', '--grid-color': 'rgba(230,237,243,0.05)' } },
  'midnight': { label: 'Midnight Blue', vars: { '--bg-primary': '#0b1020', '--bg-secondary': '#101830', '--bg-tertiary': '#182242', '--border-color': '#25325c', '--border-light': '#324274', '--text-primary': '#e4e9f7', '--text-secondary': '#9fabd0', '--text-muted': '#63709a', '--canvas-bg': '#0b1020', '--grid-color': 'rgba(160,180,255,0.06)' } },
  'forest': { label: 'Forest', vars: { '--bg-primary': '#0c130e', '--bg-secondary': '#121c15', '--bg-tertiary': '#1a281e', '--border-color': '#2a4030', '--border-light': '#375441', '--text-primary': '#e4efe7', '--text-secondary': '#a4bdac', '--text-muted': '#6a8674', '--canvas-bg': '#0c130e', '--grid-color': 'rgba(180,230,190,0.05)' } },
  'ember': { label: 'Ember', vars: { '--bg-primary': '#140d0a', '--bg-secondary': '#1d1310', '--bg-tertiary': '#2a1c16', '--border-color': '#452e22', '--border-light': '#5a3d2e', '--text-primary': '#f2e8e2', '--text-secondary': '#c7ab9c', '--text-muted': '#8f7263', '--canvas-bg': '#140d0a', '--grid-color': 'rgba(255,200,160,0.05)' } },
  'violet': { label: 'Violet Haze', vars: { '--bg-primary': '#100b1c', '--bg-secondary': '#171129', '--bg-tertiary': '#221a3c', '--border-color': '#382c5e', '--border-light': '#493b78', '--text-primary': '#ece6f9', '--text-secondary': '#b3a6d8', '--text-muted': '#7a6da3', '--canvas-bg': '#100b1c', '--grid-color': 'rgba(210,190,255,0.06)' } },
  'slate': { label: 'Slate', vars: { '--bg-primary': '#101418', '--bg-secondary': '#171d23', '--bg-tertiary': '#212a32', '--border-color': '#32404c', '--border-light': '#415260', '--text-primary': '#e7edf2', '--text-secondary': '#a3b2bf', '--text-muted': '#6b7a87', '--canvas-bg': '#101418', '--grid-color': 'rgba(200,220,240,0.05)' } },
  'mono': { label: 'Mono Ink', vars: { '--bg-primary': '#0e0e0e', '--bg-secondary': '#161616', '--bg-tertiary': '#202020', '--border-color': '#333333', '--border-light': '#454545', '--text-primary': '#f0f0f0', '--text-secondary': '#ababab', '--text-muted': '#6e6e6e', '--canvas-bg': '#0e0e0e', '--grid-color': 'rgba(255,255,255,0.05)' } },
  'sand': { label: 'Sand (light)', light: true, vars: { '--bg-primary': '#efe8da', '--bg-secondary': '#f8f3e9', '--bg-tertiary': '#e6dcc8', '--bg-node': '#f5efe2', '--border-color': '#d4c7ab', '--border-light': '#c2b28e', '--text-primary': '#2a2418', '--text-secondary': '#59503c', '--text-muted': '#8d8168', '--canvas-bg': '#eae2d1', '--grid-color': 'rgba(80,60,10,0.10)' } },
  'ocean': { label: 'Deep Ocean', vars: { '--bg-primary': '#06131c', '--bg-secondary': '#0a1c29', '--bg-tertiary': '#10293c', '--border-color': '#1d425e', '--border-light': '#285578', '--text-primary': '#e2eef7', '--text-secondary': '#96b6cc', '--text-muted': '#5b7d94', '--canvas-bg': '#06131c', '--grid-color': 'rgba(150,210,255,0.06)' } },
  'rose': { label: 'Rose Noir', vars: { '--bg-primary': '#170b10', '--bg-secondary': '#211117', '--bg-tertiary': '#301a22', '--border-color': '#4d2b38', '--border-light': '#653a49', '--text-primary': '#f5e7ec', '--text-secondary': '#cfa5b3', '--text-muted': '#966b7b', '--canvas-bg': '#170b10', '--grid-color': 'rgba(255,190,215,0.05)' } },
  'terminal': { label: 'Terminal Green', vars: { '--bg-primary': '#050d05', '--bg-secondary': '#0a140a', '--bg-tertiary': '#102010', '--border-color': '#1f3d1f', '--border-light': '#2b522b', '--text-primary': '#d8f5d8', '--text-secondary': '#8fce8f', '--text-muted': '#568a56', '--canvas-bg': '#050d05', '--grid-color': 'rgba(120,255,120,0.06)' } },
  'contrast': { label: 'High Contrast', vars: { '--bg-primary': '#000000', '--bg-secondary': '#0a0a0a', '--bg-tertiary': '#161616', '--border-color': '#555555', '--border-light': '#777777', '--text-primary': '#ffffff', '--text-secondary': '#d8d8d8', '--text-muted': '#9a9a9a', '--canvas-bg': '#000000', '--grid-color': 'rgba(255,255,255,0.10)' } }
};

export const DEFAULT_THEME = 'studio';
export const DEFAULT_ACCENT = '#f97316';
export const STORAGE_KEY = 'nodemode_ui_settings';
export const APPEARANCE = 3;

export interface ThemeChoice { theme: string; accentColor: string; intensity: number }

const clamp = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1.5, Math.max(0, v)) : 1);

export function readChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) as Partial<ThemeChoice> & { appearance?: number } : null;
    if (saved?.appearance === APPEARANCE) return { theme: saved.theme && THEMES[saved.theme] ? saved.theme : DEFAULT_THEME, accentColor: saved.accentColor || DEFAULT_ACCENT, intensity: clamp(saved.intensity) };
    if (localStorage.getItem('formweb_theme') === 'light') return { theme: 'light', accentColor: DEFAULT_ACCENT, intensity: 1 };
  } catch {}
  return { theme: DEFAULT_THEME, accentColor: DEFAULT_ACCENT, intensity: 1 };
}

export function applyTheme(choice: ThemeChoice = readChoice()): void {
  const root = document.documentElement;
  const theme = THEMES[choice.theme] || THEMES[DEFAULT_THEME];
  for (const [name, next] of Object.entries(theme.vars)) if (root.style.getPropertyValue(name) !== next) root.style.setProperty(name, next);
  const node = theme.vars['--bg-node'] || theme.vars['--bg-secondary'];
  if (root.style.getPropertyValue('--bg-node') !== node) root.style.setProperty('--bg-node', node);
  if (root.style.getPropertyValue('--accent-color') !== choice.accentColor) root.style.setProperty('--accent-color', choice.accentColor);
  root.style.setProperty('--accent-intensity', String(clamp(choice.intensity)));
  root.style.background = theme.vars['--bg-primary'];
  const mode = theme.light ? 'light' : 'dark';
  if (root.dataset.theme !== mode) root.dataset.theme = mode;
}

export function setTheme(theme: string): void {
  const choice = { ...readChoice(), theme: THEMES[theme] ? theme : DEFAULT_THEME };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), ...choice, appearance: APPEARANCE }));
    localStorage.removeItem('formweb_theme');
  } catch {}
  applyTheme(choice);
  document.dispatchEvent(new CustomEvent('nm:ui-settings-changed', { detail: { key: 'theme' } }));
}
