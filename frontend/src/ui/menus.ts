import type { Commands } from '../commands/registry';

export interface SubMenu { label: string; items: string[] }
export type MenuItem = string | SubMenu;
export interface MenuDef { label: string; items: MenuItem[] | (() => MenuItem[]) }

export const itemsOf = (def: MenuDef): MenuItem[] => (typeof def.items === 'function' ? def.items() : def.items);

export const MENU_LABELS = ['File', 'Edit', 'View', 'Insert', 'Page', 'Arrange', 'Vector', 'CMS', 'Window', 'Help'];

function itemsFor(commands: Commands, label: string): MenuItem[] {
  const out: MenuItem[] = [];
  const subs = new Map<string, { menu: SubMenu; group: number }>();
  let group: number | null = null;
  for (const command of commands.all()) {
    if (command.menu !== label) continue;
    const sep = command.sep ?? 0;
    const sub = command.submenu ? subs.get(command.submenu) : undefined;
    if (sub) {
      if (sep !== sub.group) sub.menu.items.push('-');
      sub.group = sep;
      sub.menu.items.push(command.id);
      continue;
    }
    if (group !== null && sep !== group) out.push('-');
    group = sep;
    if (!command.submenu) { out.push(command.id); continue; }
    const menu: SubMenu = { label: command.submenu, items: [command.id] };
    subs.set(command.submenu, { menu, group: sep });
    out.push(menu);
  }
  return out;
}

export function menuModel(commands: Commands): MenuDef[] {
  return MENU_LABELS.map(label => ({ label, items: () => itemsFor(commands, label) }));
}
