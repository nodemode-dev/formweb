import type { EditorState } from '../types';

export interface Selection { node: string; page: string; breakpoint: string; locale: string; width: number }
export interface FeatureContext {
  selection(): Selection;
  notify(message: string, error?: boolean): void;
  selectNode(id: string): void;
  selectPage(id: string): void;
}
export interface Parameter {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'boolean' | 'json' | 'password' | 'multiline' | 'file';
  choices?: string[];
  optional?: boolean;
  hint?: string;
}
export interface FeatureAction {
  id: string;
  category: string;
  title: string;
  description: string;
  parameters?: Parameter[];
  example?: (state: EditorState, selection: Selection) => Record<string, unknown>;
  command?: string;
  group?: string;
  path?: string | ((parameters: Record<string, unknown>) => string);
  method?: 'GET' | 'POST' | 'DELETE';
  download?: string;
  stateResult?: boolean;
  execute?: (parameters: Record<string, unknown>, context: FeatureContext) => Promise<unknown>;
  responseNote?: string;
  runLabel?: string;
}
export const categories = [
  { id: 'design', title: 'Layout & design' },
  { id: 'components', title: 'Components & libraries' },
  { id: 'cms', title: 'CMS & content' },
  { id: 'runtime', title: 'Motion & forms' },
  { id: 'localization', title: 'Localization & SEO' },
  { id: 'publishing', title: 'Publishing & delivery' },
  { id: 'collaboration', title: 'Review & access' },
  { id: 'providers', title: 'Connected providers' },
  { id: 'insights', title: 'Visitors & insights' }
];
export const parameters = {
  node: { name: 'id', label: 'Element ID', hint: 'Use the selected element, shown in the inspector.' } as Parameter,
  page: { name: 'id', label: 'Page ID' } as Parameter,
  name: { name: 'name', label: 'Name' } as Parameter,
  value: { name: 'value', label: 'Configuration', type: 'json' } as Parameter
};
