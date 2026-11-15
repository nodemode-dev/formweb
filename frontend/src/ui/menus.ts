import type { Commands } from '../commands/registry';

export type MenuItem = string;
export interface MenuDef { label: string; items: MenuItem[] | (() => MenuItem[]) }

export const itemsOf = (def: MenuDef): MenuItem[] => (typeof def.items === 'function' ? def.items() : def.items);

export const MENU_LABELS = ['File', 'Edit', 'View', 'Insert', 'Page', 'Arrange', 'Vector', 'CMS', 'Window', 'Help'];

function itemsFor(commands: Commands, label: string): MenuItem[] {
  const out: MenuItem[] = [];
  let group: number | null = null;
  for (const command of commands.all()) {
    if (command.menu !== label) continue;
    const sep = command.sep ?? 0;
    if (group !== null && sep !== group) out.push('-');
    group = sep;
    out.push(command.id);
  }
  return out;
}

export function menuModel(commands: Commands): MenuDef[] {
  return MENU_LABELS.map(label => ({ label, items: () => itemsFor(commands, label) }));
}
