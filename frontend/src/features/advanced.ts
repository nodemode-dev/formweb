import { command, state } from '../api';
import type { FeatureAction } from './contracts';

function group(name: string): Record<string, unknown> { return structuredClone(state().site.extensions?.[name] || {}) as Record<string, unknown>; }
function entries(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
async function put(name: string, section: string, id: string, value: unknown): Promise<unknown> {
  const next = group(name);
  next[section] = { ...entries(next[section]), [id]: value };
  return command('extension.set', { group: name, value: next });
}
function chooser(motion: unknown, id: string): boolean {
  return Object.values(entries(entries(motion).disclosure)).some(entry => {
    const data = entries(entry);
    const list = data.type === 'tabs' ? data.items : data.type === 'filter' ? data.chips : undefined;
    return Array.isArray(list) && list.some(item => entries(item).trigger === id);
  });
}
export const advancedActions: FeatureAction[] = [
  {
    id: 'node-states', category: 'runtime', title: 'Pointer & keyboard states',
    description: 'Set CSS for hover, focus, press and the chosen state of a tab or filter chip on one element. Existing actions, conditions and other elements remain in the compiled behavior group.',
    parameters: [{ name: 'node', label: 'Element ID' }, { name: 'states', label: 'State style maps', type: 'json', hint: 'Supported state keys: hover, focus, press and selected (the chosen tab or filter chip). Each value is a validated CSS style map.' }],
    example: (s, x) => {
      const own = entries(entries(entries(s.site.extensions?.behaviors).nodes)[x.node]).states;
      const states: Record<string, unknown> = own && typeof own === 'object' ? { ...entries(own) } : { hover: { opacity: '0.8' }, focus: { outline: '2px solid #fa5d29' }, press: { transform: 'scale(0.98)' } };
      if (chooser(s.site.extensions?.motion, x.node) && !states.selected) states.selected = { background: '#fa5d29', color: '#ffffff' };
      return { node: x.node, states };
    },
    execute: parameters => {
      const existing = entries(entries(group('behaviors').nodes)[String(parameters.node)]);
      return put('behaviors', 'nodes', String(parameters.node), { ...existing, states: parameters.states });
    }
  },
  {
    id: 'node-actions', category: 'runtime', title: 'Actions & visibility conditions',
    description: 'Compose conditional reveal, navigation, class, variant, timeline and overlay actions. Conditions can inspect a query parameter or session key; per-element conditions control visibility.',
    parameters: [{ name: 'node', label: 'Element ID' }, { name: 'actions', label: 'Ordered actions', type: 'json', hint: 'Triggers: click, hover, press, scroll, load. Actions: toggle-class, navigate, fade-in, variant, timeline, overlay-open, overlay-close. Variant uses target/variant; timeline and overlay use their configured IDs.' }, { name: 'conditions', label: 'Element visibility conditions', type: 'json', hint: 'Each condition has source query or session, key, op eq/ne/exists/contains, and optional string value.' }],
    example: (s, x) => ({ node: x.node, actions: [{ trigger: 'scroll', action: 'fade-in', duration: 600, easing: 'ease-out', once: true, conditions: [] }], conditions: [] }),
    execute: parameters => {
      const existing = entries(entries(group('behaviors').nodes)[String(parameters.node)]);
      return put('behaviors', 'nodes', String(parameters.node), { ...existing, actions: parameters.actions, conditions: parameters.conditions });
    }
  },
  {
    id: 'timeline', category: 'runtime', title: 'Author timeline tracks',
    description: 'Create timed tracks for existing element IDs. Bind the timeline name with a timeline action in Actions & visibility conditions. Motion respects reduced-motion preferences.',
    parameters: [{ name: 'id', label: 'Timeline ID' }, { name: 'tracks', label: 'Animation tracks', type: 'json', hint: 'Each track has node, two or more keyframe CSS maps, duration in ms, optional delay/at in ms and easing.' }, { name: 'repeat', label: 'Repeat count', type: 'number' }],
    example: (s, x) => ({ id: 'entrance', tracks: [{ node: x.node, keyframes: [{ opacity: '0', transform: 'translateY(24px)' }, { opacity: '1', transform: 'translateY(0)' }], duration: 600, delay: 0, at: 0, easing: 'ease-out' }], repeat: 1 }),
    execute: parameters => put('behaviors', 'timelines', String(parameters.id), { tracks: parameters.tracks, repeat: parameters.repeat })
  },
  {
    id: 'overlay', category: 'runtime', title: 'Accessible overlay',
    description: 'Turn an existing container into a labeled overlay. Bind overlay-open or overlay-close actions to its ID. Dismissible overlays support Escape and focus restoration in the compiled runtime.',
    parameters: [{ name: 'id', label: 'Overlay ID' }, { name: 'node', label: 'Container element ID' }, { name: 'label', label: 'Accessible dialog label' }, { name: 'dismissible', label: 'Allow dismissal', type: 'boolean' }, { name: 'initial', label: 'Initially open', type: 'boolean' }],
    example: (s, x) => ({ id: 'contact', node: x.node, label: 'Contact the studio', dismissible: true, initial: false }),
    execute: parameters => put('behaviors', 'overlays', String(parameters.id), { node: parameters.node, label: parameters.label, dismissible: parameters.dismissible, initial: parameters.initial })
  },
  {
    id: 'translated-asset', category: 'localization', title: 'Translate one media asset',
    description: 'Override a media element’s source for one locale. Upload the asset in Content first and copy its stored URL, or provide an allowed HTTPS URL. The default source is retained.',
    parameters: [{ name: 'node', label: 'Media element ID' }, { name: 'locale', label: 'Locale' }, { name: 'url', label: 'Translated media URL' }],
    example: (s, x) => ({ node: x.node, locale: x.locale, url: s.site.nodes[x.node]?.attrs.src || '/api/assets/asset-id' }),
    execute: parameters => {
      const existing = entries(entries(group('localization').assets)[String(parameters.node)]);
      return put('localization', 'assets', String(parameters.node), { ...existing, [String(parameters.locale)]: parameters.url });
    }
  },
  {
    id: 'translated-route', category: 'localization', title: 'Translate one page route',
    description: 'Set a page slug in one locale and enable compiling all configured locales. The compiler adds reciprocal alternate-language metadata.',
    parameters: [{ name: 'page', label: 'Page ID' }, { name: 'locale', label: 'Locale' }, { name: 'slug', label: 'Localized URL slug' }],
    example: (s, x) => ({ page: x.page, locale: x.locale, slug: s.site.pages.find(page => page.id === x.page)?.slug || '/' }),
    execute: parameters => {
      const next = group('localization');
      const routes = entries(next.pageSlugs);
      next.pageSlugs = { ...routes, [String(parameters.page)]: { ...entries(routes[String(parameters.page)]), [String(parameters.locale)]: parameters.slug } };
      next.allLocales = true;
      return command('extension.set', { group: 'localization', value: next });
    }
  },
  {
    id: 'runtime-widget', category: 'providers', title: 'Bind one runtime widget',
    description: 'Bind a real element to a server-backed widget. Fetch uses source/field, product uses product, member-gate uses group. Cart and checkout consume the configured commerce catalogue; member-login renders visitor sign-in controls; analytics-consent renders explicit visitor choice.',
    parameters: [{ name: 'node', label: 'Host element ID' }, { name: 'type', label: 'Widget type', choices: ['fetch', 'product', 'cart', 'checkout', 'member-login', 'member-gate', 'analytics-consent'] }, { name: 'source', label: 'Data source name', optional: true }, { name: 'field', label: 'Result field', optional: true }, { name: 'product', label: 'Product ID', optional: true }, { name: 'group', label: 'Member group', optional: true }],
    example: (s, x) => ({ node: x.node, type: 'analytics-consent' }),
    execute: parameters => {
      const { node, ...widget } = parameters;
      return put('integrations', 'widgets', String(node), widget);
    }, responseNote: 'Save then use Runtime Preview. Provider status explains missing configuration; a saved binding alone does not establish a successful external connection.'
  },
  {
    id: 'member-gates', category: 'providers', title: 'Member route gates',
    description: 'Declare route access groups in the public site configuration. Actual membership checks and cookie sessions are performed by the runtime service.',
    parameters: [{ name: 'gates', label: 'Protected routes and groups', type: 'json' }],
    example: () => ({ gates: [{ route: '/members', groups: ['member'] }] }),
    execute: parameters => command('extension.set', { group: 'integrations', value: { ...group('integrations'), gates: parameters.gates } })
  },
  {
    id: 'experiment', category: 'insights', title: 'Weighted experiment definition',
    description: 'Configure named weighted variants and an explicit conversion goal. Assignment waits for analytics consent. Record the authored event with an analytics-event behavior; viewing or clicking unrelated content does not count as conversion.',
    parameters: [{ name: 'id', label: 'Experiment ID' }, { name: 'variants', label: 'Variant IDs and positive weights', type: 'json' }, { name: 'event', label: 'Conversion event name' }],
    example: () => ({ id: 'hero', variants: [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }], event: 'conversion' }),
    execute: parameters => put('integrations', 'experiments', String(parameters.id), { variants: parameters.variants, event: parameters.event })
  },
  {
    id: 'conversion-goal', category: 'insights', title: 'Bind conversion goal action',
    description: 'Append a consent-aware analytics action to the selected element. If an experiment is provided, its configured event must match. The runtime records this explicit goal independently from assignment.',
    parameters: [{ name: 'node', label: 'Trigger element ID' }, { name: 'trigger', label: 'Trigger', choices: ['click', 'hover', 'press', 'scroll', 'load'] }, { name: 'event', label: 'Event name' }, { name: 'experiment', label: 'Experiment ID', optional: true }],
    example: (s, x) => ({ node: x.node, trigger: 'click', event: 'conversion' }),
    execute: parameters => {
      const { node, ...action } = parameters;
      const existing = entries(entries(group('behaviors').nodes)[String(node)]);
      const actions = Array.isArray(existing.actions) ? existing.actions : [];
      return put('behaviors', 'nodes', String(node), { ...existing, actions: [...actions, { ...action, action: 'analytics-event' }] });
    }
  },
  {
    id: 'route-redirects', category: 'publishing', title: 'Portable route redirects',
    description: 'Map old local routes to their destination paths. Rust rejects cycles. The exported redirect manifest is consumed by active local releases; static hosts need their own redirect adapter for that manifest.',
    parameters: [{ name: 'redirects', label: 'Old route to destination map', type: 'json' }],
    example: (s, x) => ({ redirects: { '/old-home': s.site.pages.find(page => page.id === x.page)?.slug || '/' } }),
    execute: parameters => command('extension.set', { group: 'seo', value: { ...group('seo'), redirects: parameters.redirects } })
  }
];
