import { comboOf, type Commands } from './registry';

const TYPING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], .xterm, .fw-term, [data-no-keys]';

export function installKeymap(registry: Commands, ready: () => boolean): void {
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.key === 'Dead' || event.key === 'Process') return;
    const command = registry.forEvent(event);
    if (!command) return;
    if (!command.global && !ready()) return;
    const mod = comboOf(event).includes('Mod+');
    const typing = !!(event.target as Element | null)?.closest?.(TYPING);
    if (typing && !(command.global && mod)) return;
    if (command.native?.()) return;
    if (event.repeat && !command.repeat) { if (mod) event.preventDefault(); return; }
    if (!mod && !registry.enabled(command)) return;
    event.preventDefault();
    registry.run(command.id);
  }, true);
}
