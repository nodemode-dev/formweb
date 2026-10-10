export interface SiteNode {
  id: string;
  tag: string;
  name: string;
  text: string;
  children: string[];
  attrs: Record<string, string>;
  styles: Record<string, string>;
  breakpoints: Record<string, Record<string, string>>;
  componentId?: string;
  componentSourceId?: string;
  overrides?: string[];
  binding?: { collection: string; field?: string };
  interactions?: Interaction[];
}
export interface Interaction {
  trigger: 'click' | 'hover' | 'scroll';
  action: 'toggle-class' | 'navigate' | 'fade-in';
  className?: string;
  url?: string;
  duration?: number;
}
export interface Page {
  id: string;
  name: string;
  slug: string;
  root: string;
  seo: { title: string; description: string; noindex?: boolean };
}
export interface Collection {
  id: string;
  name: string;
  fields: { name: string; type: string; required?: boolean }[];
  items: { id: string; slug: string; values: Record<string, unknown>; status: string }[];
}
export interface Site {
  schemaVersion: number;
  id: string;
  name: string;
  pages: Page[];
  nodes: Record<string, SiteNode>;
  tokens: Record<string, string>;
  breakpoints: { id: string; name: string; maxWidth: number }[];
  components: Record<string, { id: string; name: string; root: string }>;
  collections: Record<string, Collection>;
  locales: Record<string, Record<string, string>>;
  defaultLocale: string;
  settings: Record<string, string>;
  extensions?: Record<string, unknown>;
}
export interface EditorState { site: Site; revision: number; canUndo: boolean; canRedo: boolean }
export interface Command { command: string; params: Record<string, unknown> }
export interface AuditIssue { severity: string; code: string; page?: string; node?: string; message: string }
