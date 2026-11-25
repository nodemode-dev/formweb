import type { Command, Page, Site, SiteNode } from '../../src/types';

export interface NodeSpec { tag: string; children?: string[]; attrs?: Record<string, string>; styles?: Record<string, string>; componentSourceId?: string; interactions?: SiteNode['interactions'] }
export interface PageSpec { id: string; name: string; slug: string; root: string }

export function makeSite(pages: PageSpec[], nodes: Record<string, NodeSpec>, extensions: Record<string, unknown> = {}): Site {
  const built: Record<string, SiteNode> = {};
  for (const [id, spec] of Object.entries(nodes)) {
    built[id] = { id, tag: spec.tag, name: id, text: '', children: [...(spec.children ?? [])], attrs: { ...(spec.attrs ?? {}) }, styles: { ...(spec.styles ?? {}) }, breakpoints: {}, ...(spec.componentSourceId ? { componentSourceId: spec.componentSourceId } : {}), ...(spec.interactions ? { interactions: spec.interactions } : {}) };
  }
  return {
    schemaVersion: 1, id: 'site', name: 'Test site',
    pages: pages.map(page => ({ ...page, seo: { title: page.name, description: '' } } as Page)),
    nodes: built, tokens: {}, breakpoints: [{ id: 'tablet', name: 'Tablet', maxWidth: 991 }], components: {}, collections: {}, locales: {}, defaultLocale: 'en', settings: {}, extensions
  };
}

const parentOf = (site: Site, id: string): string | undefined => Object.values(site.nodes).find(node => node.children.includes(id))?.id;

function within(site: Site, id: string, ancestor: string): boolean {
  for (let at: string | undefined = id; at; at = parentOf(site, at)) if (at === ancestor) return true;
  return false;
}

export function applyCommands(site: Site, list: readonly Command[]): Site {
  const next: Site = structuredClone(site);
  for (const { command, params } of list) {
    if (command === 'node.move') {
      const id = params.id as string;
      const parent = params.parent as string;
      const from = parentOf(next, id);
      if (!from) throw new Error(`node.move: ${id} has no parent`);
      if (!next.nodes[parent]) throw new Error(`node.move: unknown parent ${parent}`);
      if (within(next, parent, id)) throw new Error(`node.move: ${parent} is inside ${id}`);
      next.nodes[from].children = next.nodes[from].children.filter(child => child !== id);
      const children = next.nodes[parent].children;
      const index = params.index === undefined ? children.length : params.index as number;
      if (!Number.isInteger(index) || index < 0 || index > children.length) throw new Error(`node.move: index ${index} outside 0..${children.length}`);
      children.splice(index, 0, id);
    } else if (command === 'page.move') {
      const id = params.id as string;
      const index = params.index as number;
      const at = next.pages.findIndex(page => page.id === id);
      if (at < 0) throw new Error(`page.move: unknown page ${id}`);
      if (!Number.isInteger(index) || index < 0 || index >= next.pages.length) throw new Error(`page.move: index ${index} outside the list`);
      if (index === at) throw new Error(`page.move: ${id} is already at ${index}`);
      const [page] = next.pages.splice(at, 1);
      next.pages.splice(index, 0, page);
    } else if (command === 'page.update') {
      const page = next.pages.find(entry => entry.id === params.id);
      if (!page) throw new Error(`page.update: unknown page ${params.id}`);
      Object.assign(page, params.patch as Partial<Page>);
    } else if (command === 'node.update') {
      const node = next.nodes[params.id as string];
      if (!node) throw new Error(`node.update: unknown node ${params.id}`);
      const patch = params.patch as Partial<SiteNode> & { styles?: Record<string, string | null> };
      if (patch.attrs) node.attrs = { ...node.attrs, ...patch.attrs };
      if (patch.styles) for (const [key, value] of Object.entries(patch.styles)) { if (value === null) delete node.styles[key]; else node.styles[key] = value; }
      if (patch.interactions) node.interactions = patch.interactions;
    } else throw new Error(`no reference for ${command}`);
  }
  return next;
}

export const childrenOf = (site: Site, id: string): string[] => site.nodes[id].children;
export const pageOrder = (site: Site): string[] => site.pages.map(page => page.id);
