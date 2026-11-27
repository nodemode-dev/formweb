import { comboOf, type Commands } from './registry';

const TYPING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], .xterm, .ft-dock, .ft-consent, .ft-tour, [data-no-keys]';
const OWN_KEYS = '[data-own-keys]';

export function installKeymap(registry: Commands, ready: () => boolean): void {
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.key === 'Dead' || event.key === 'Process') return;
    const command = registry.forEvent(event);
    if (!command) return;
    if (!command.global && !ready()) return;
    const mod = comboOf(event).includes('Mod+');
    const target = event.target as Element | null;
    const typing = !!target?.closest?.(TYPING);
    if (typing && !(mod && (command.global || target?.matches?.('select[data-style]')))) return;
    if (!mod && target?.closest?.(OWN_KEYS)) return;
    if (command.native?.()) return;
    if (event.repeat && !command.repeat) { if (mod) event.preventDefault(); return; }
    if (!mod && !registry.enabled(command)) return;
    event.preventDefault();
    registry.run(command.id);
  }, true);
}
