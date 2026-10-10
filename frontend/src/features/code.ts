import { command, request, state } from '../api';
import type { FeatureAction } from './contracts';

interface CodeGroup { components?: Record<string, unknown>; instances?: Record<string, unknown> }
interface BuiltComponent { ok: boolean; component: Record<string, unknown>; diagnostics?: unknown }
export const codeActions: FeatureAction[] = [
  {
    id: 'code-build', category: 'components', title: 'Build isolated code component', runLabel: 'Build & install',
    description: 'Explicitly opt in to compiling a self-contained module that exports mount(root, props). TypeScript diagnostics block installation. The compiled component runs in an opaque iframe with external network access denied. No imports or secrets belong in its source.',
    parameters: [
      { name: 'id', label: 'Code component ID' },
      { name: 'node', label: 'Host element ID' },
      { name: 'enabled', label: 'I enable this component source', type: 'boolean' },
      { name: 'language', label: 'Language', choices: ['typescript', 'javascript'] },
      { name: 'source', label: 'Module source', type: 'multiline' },
      { name: 'props', label: 'Typed property descriptors', type: 'json', hint: 'Each property declares type string, number, boolean or json, with optional required and default.' },
      { name: 'values', label: 'Instance property values', type: 'json' }
    ],
    example: (s, x) => ({
      id: 'counter', node: x.node, enabled: false, language: 'typescript',
      source: 'export function mount(root: HTMLElement, props: { label?: string }): void {\n  let count = 0;\n  const button = document.createElement("button");\n  button.textContent = props.label || "Count: 0";\n  button.style.cssText = "padding:16px 24px;background:#fa5d29;color:#fff;border:0;border-radius:8px;font:600 16px system-ui;cursor:pointer";\n  button.addEventListener("click", () => { count += 1; button.textContent = "Count: " + count; });\n  root.append(button);\n}',
      props: { label: { type: 'string', default: 'Count: 0' } }, values: { label: 'Count: 0' }
    }),
    execute: async parameters => {
      if (parameters.enabled !== true) throw new Error('Enable the source explicitly before compiling it.');
      if (!state().site.nodes[String(parameters.node)]) throw new Error('The component host element does not exist.');
      const result = await request<BuiltComponent>('/api/code/build', { enabled: true, language: parameters.language, source: parameters.source, props: parameters.props });
      if (!result.ok || !result.component?.javascript) throw new Error('The compiler returned no usable component build.');
      const existing = (state().site.extensions?.code || {}) as CodeGroup;
      const next = await command('extension.set', { group: 'code', value: {
        components: { ...existing.components, [String(parameters.id)]: result.component },
        instances: { ...existing.instances, [String(parameters.node)]: { component: parameters.id, props: parameters.values } }
      } });
      return { revision: next.revision, installed: parameters.id, node: parameters.node, diagnostics: result.diagnostics, sourceDigest: result.component.sourceDigest, builtDigest: result.component.builtDigest };
    }, responseNote: 'The compiler manifest and installed revision are shown after both compilation and engine validation succeed.'
  },
  {
    id: 'code-instances', category: 'components', title: 'Code component bindings',
    description: 'Inspect or edit installed component manifests and host bindings. Prefer Build isolated code component for source changes so source and compiled digests remain consistent. Remove a host entry to detach that code instance.',
    group: 'code', parameters: [{ name: 'value', label: 'Code definitions and instances', type: 'json' }],
    example: s => ({ value: s.site.extensions?.code || { components: {}, instances: {} } })
  }
];
