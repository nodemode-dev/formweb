import { labelAttr } from '../i18n';
import { element } from '../ui/dom';
import '../styles/export-folder.css';

export type ExportMode = 'downloads' | 'folder' | 'ask';
export type ExportChoice = { mode: ExportMode; path: string };

type Core = { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };

const KEY = 'formweb.export-folder';
const PATH_MAX = 4096;
const NAME_MAX = 1024;
const MODES: readonly ExportMode[] = ['downloads', 'folder', 'ask'];
const DEFAULT: ExportChoice = { mode: 'downloads', path: '' };

const core = (): Core | undefined => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core;

function parse(raw: string | null): ExportChoice {
  if (!raw || raw.length > PATH_MAX + 64) return DEFAULT;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return DEFAULT;
    const { mode, path } = value as { mode?: unknown; path?: unknown };
    const kept = typeof path === 'string' && path.length <= PATH_MAX ? path : '';
    if (!MODES.includes(mode as ExportMode)) return DEFAULT;
    if (mode === 'folder' && !kept) return DEFAULT;
    return { mode: mode as ExportMode, path: kept };
  } catch {
    return DEFAULT;
  }
}

function read(): ExportChoice {
  try { return parse(localStorage.getItem(KEY)); } catch { return DEFAULT; }
}

let current = read();

const listeners = new Set<() => void>();

function store(choice: ExportChoice): void {
  current = choice;
  try {
    if (choice.mode === 'downloads' && !choice.path) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(choice));
  } catch { }
  listeners.forEach(listener => listener());
}

function settle(sent: ExportChoice, answer: unknown): void {
  if (sent !== current || !answer || typeof answer !== 'object') return;
  const { mode, folder } = answer as { mode?: unknown; folder?: unknown };
  const shown = typeof folder === 'string' && folder.length <= PATH_MAX ? folder : '';
  if (current.mode === 'folder' && mode !== 'folder') store({ mode: 'downloads', path: '' });
  else if (current.path !== shown) store({ mode: current.mode, path: shown });
}

function hand(choice: ExportChoice, forget = false): void {
  const bridge = core();
  if (!bridge) return;
  try {
    void bridge.invoke('set_export_place', { mode: choice.mode, path: choice.path, forget }).then(answer => settle(choice, answer), () => undefined);
  } catch {
    return;
  }
}

function keep(choice: ExportChoice): void {
  store(choice);
  hand(choice);
}

hand(current);

export const desktopShell = (): boolean => !!core();

export const exportChoice = (): ExportChoice => current;

export function resetExportFolder(): void {
  try { localStorage.removeItem(KEY); } catch { }
  current = DEFAULT;
  hand(DEFAULT, true);
}

export function forgetAnswer(): void {
  hand(current);
}

export async function beforeDownload(name: string): Promise<boolean> {
  const bridge = core();
  if (!bridge || current.mode !== 'ask') return true;
  try {
    return (await bridge.invoke('ask_export_place', { name: name.slice(0, NAME_MAX) })) === true;
  } catch {
    return false;
  }
}

let mounted: HTMLElement | null = null;

export function exportFolderRow(): HTMLElement {
  if (mounted) return mounted;
  const row = element('div', 'fw-export-folder');
  mounted = row;
  if (!core()) {
    row.append(element('p', 'micro', 'In a browser, the browser decides where downloads go.'));
    return row;
  }
  row.dataset.ownKeys = '';
  row.setAttribute('role', 'radiogroup');
  const radios = new Map<ExportMode, HTMLInputElement>();
  const option = (mode: ExportMode, words: string): HTMLLabelElement => {
    const radio = element('input');
    radio.type = 'radio';
    radio.name = 'fw-export-folder';
    radio.value = mode;
    radios.set(mode, radio);
    const wrap = element('label', 'checkbox-field');
    wrap.append(radio, element('span', '', words));
    return wrap;
  };
  const pick = element('div', 'fw-export-pick');
  const choose = element('button', 'fw-export-choose');
  choose.type = 'button';
  choose.append(element('span', '', 'Choose folder...'));
  const shown = element('span', 'fw-export-path');
  shown.dataset.noI18n = '';
  const none = element('span', 'fw-export-path is-empty', 'No folder chosen yet.');
  pick.append(choose, shown, none);
  const note = element('p', 'micro', 'Every download from the editor follows this choice: Export static site, Download .fweb project, QR codes and picture exports. With Ask each time, each file asks where it goes. If the chosen folder cannot be used when a file is saved, the file goes to Downloads and the notice says so.');
  row.append(option('downloads', 'The Downloads folder'), option('folder', 'A folder you choose'), pick, option('ask', 'Ask each time'), note);
  const paint = (): void => {
    for (const [mode, radio] of radios) if (radio.checked !== (current.mode === mode)) radio.checked = current.mode === mode;
    const path = current.path;
    if (shown.textContent !== path) shown.textContent = path;
    if (path) { if (shown.title !== path) shown.title = path; } else if (shown.hasAttribute('title')) shown.removeAttribute('title');
    if (shown.hidden !== !path) shown.hidden = !path;
    if (none.hidden !== !!path) none.hidden = !!path;
    labelAttr(choose, 'title', path ? 'Choose another folder' : 'Choose the folder exports are saved to');
  };
  let choosing = false;
  const chooseFolder = async (): Promise<boolean> => {
    const bridge = core();
    if (!bridge || choosing) return false;
    choosing = true;
    choose.setAttribute('aria-busy', 'true');
    try {
      const folder = await bridge.invoke('choose_export_folder');
      if (typeof folder !== 'string' || !folder || folder.length > PATH_MAX) return false;
      keep({ mode: 'folder', path: folder });
      return true;
    } catch {
      return false;
    } finally {
      choosing = false;
      choose.removeAttribute('aria-busy');
    }
  };
  choose.addEventListener('click', () => { void chooseFolder().then(paint); });
  for (const [mode, radio] of radios) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      if (mode === 'folder' && !current.path) { void chooseFolder().then(paint); return; }
      keep({ mode, path: current.path });
    });
  }
  listeners.add(paint);
  paint();
  return row;
}
