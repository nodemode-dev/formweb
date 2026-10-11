# FormWeb advanced authority contract

This contract describes the implemented Rust document boundary and consuming commands. The schema version remains 1. `Site.extensions` defaults to an empty object. Unknown namespaces and unknown keys inside known records are rejected. All mutations, including batches, operate on a candidate document; errors preserve the acknowledged document, revision, undo and redo. A batch accepts 1 to 500 commands and commits once.

The whole serialized site is limited to 8 MiB and its extensions to 4 MiB. The existing semantic tag, attribute, URL and CSS guards also apply to extension content. Node IDs, component IDs, token IDs and other identifiers use the existing bounded ASCII identifier rule. Secrets belong in backend provider configuration.

## Protocol methods

`checkpoint {}` returns `{schemaVersion:1,site,revision,undo:[Site],redo:[Site]}`. The last array entry is the next undo or redo. `restore {checkpoint,expectedRevision?,restoreRevision?}` validates the complete checkpoint before switching authority. The default restored revision is the greater of the current revision plus one and the saved revision. The supervisor can supply the saved `restoreRevision` for exact crash recovery. History has at most 100 entries in either array, all documents must have the checkpoint site's ID, and the checkpoint must fit within 32 MiB. Ordinary mutations trim the oldest history until total serialized documents fit within 31 MiB. No-op mutations retain redo.

`validate {site}` returns `{valid:true}` without changing the document or revision. `load {site,restoreRevision?}` is the legacy document-only operation and clears history. `site.replace {site}` preserves the current site ID and records one undo entry. All `exec` and `batch` requests can carry `expectedRevision` outside command params.

## Authoring commands

| Command | Params | Consuming behavior |
| --- | --- | --- |
| `page.duplicate` | `{id,name?,slug}` | Fresh owned node IDs, linked component associations, instance data, node bindings, behaviors, forms, code/provider instances, preset references, localized assets and strings, and page SEO/template settings are copied. HTML references are remapped. Duplicated localized/template routes receive the new route prefix. |
| `page.bulk` | `{template,rows:[{slug,name?,values:{column:value}}]}` | 1 to 300 rows in one undo step. Each row runs `page.duplicate` on the template, then replaces `{{column}}` tokens in node text, every attribute value, the page name (when `name` is omitted) and SEO title/description. Unknown tokens are left as written. |
| `breakpoint.set` | `{id,name,maxWidth}` | Creates or updates a bounded positive max-width breakpoint used by node inheritance and exported CSS. |
| `breakpoint.remove` | `{id}` | Removes the breakpoint and corresponding node overrides; the final breakpoint cannot be removed. |
| `token.define` | `{name,type,value:string}` | Stores typed metadata and the actual CSS token together. Types: color, number, length, text. Number values use finite numeric strings. |
| `textpreset.set` | `{name,styles}` | Changes a referenced preset; applied nodes update unoverridden properties and remove obsolete preset properties. |
| `textpreset.apply` | `{id,name}` | Records a node-to-preset association and applies its styles. Later direct style edits override the edited properties. |
| `component.configure` | `{component,definition}` | Defines typed props, variants and named typed slots on an existing component. |
| `component.props` | `{id,props}` | Validates instance props and materializes them; null removes an explicit value and restores its default. |
| `component.variant` | `{id,variant:string\|null}` | Switches a linked instance variant, clearing the prior variant's managed fields. |
| `component.reset` | `{id,fields?:[fieldGroup]}` | Clears local overrides. Without fields, resets instance data and releases supplied slot content to the instance parent's children. A subset preserves unrelated prop/variant/slot data and suppresses that category's managed patches. |
| `component.slot` | `{id,slot,nodes:[nodeID]}` | Moves independent nodes into a typed slot. Replacement releases previous supplied content to the instance parent. Cycles and duplicate ownership are rejected. |
| `component.detach` | `{id}` | Keeps the materialized subtree and clears its linked metadata. |
| `collection.update` | `{id,patch:{name?,fields?}}` | Changes an existing schema with final whole-document validation. Fields still in use cannot become invalid silently. |
| `cms.replace` | `{collection,items:[Item]}` | Replaces up to 10,000 items atomically, validating relations and all consumers against the final item set. |
| `cms.query` | `{node,query}` | Stores a validated list query consumed by the CMS compiler. |
| `cms.binding` | `{node,binding}` | Stores an explicit typed text, href or src binding. |
| `cms.localize` | `{collection,item,locale,values,slug?,status?}` | Stores localized field overrides and validates merged localized items, slug uniqueness and actual relation targets. Register export locales with `locale.set`. |
| `extension.set` | `{group,value}` | Replaces one rigorously validated extension group. Existing unrelated groups persist. |
| `extension.remove` | `{group}` | Removes a group subject to final whole-document validation. |
| `library.import` | `{id,name,version,site,parent,components?:[sourceComponentID]}` | Imports a pinned snapshot's selected component sources, namespaced tokens/breakpoints, definitions, forms and strings. |
| `library.update` | `{id,version,site}` | Applies a new explicit pin, preserves source node identity and instance overrides, and rejects conflicting local source/definition/token/breakpoint edits. |
| `library.detach` | `{id}` | Removes provenance while keeping the local authored sources and instances. |

Field groups for overrides and reset are text, styles, attrs, breakpoints and interactions. Source structure add/move/remove propagates to linked instances. Nested linked component definitions require detaching the nested content before defining the outer source. Independent linked instances can exist inside supplied slot subtrees.

## Native extension groups

```json
{
  "design": {
    "tokens": {"brand": {"type": "color", "value": "#223344"}},
    "textPresets": {"body": {"styles": {"font-size": "18px"}}},
    "applications": {"description": {"preset": "body", "overrides": ["font-size"]}}
  },
  "components": {
    "definitions": {
      "primary-button": {
        "props": {"label": {"type": "text", "default": "Continue", "target": "cta", "field": "text"}},
        "variants": {"inverse": {"nodes": {"cta": {"styles": {"color": "#ffffff"}}}}},
        "slots": {"body": {"target": "slot-container", "allowedTags": ["p", "div"]}}
      }
    },
    "instances": {
      "instance-1": {"props": {"label": "Get started"}, "variant": "inverse", "slots": {"body": ["content-1"]}, "resetFields": ["styles"]}
    }
  },
  "libraries": {
    "packages": {
      "shared": {"name": "Shared", "version": "1.0.0", "site": "a full Site object", "components": ["primary-button"], "imported": {"primary-button": "library-component-1"}, "nodes": {"cta": "library-node-1"}, "tokens": {"ink": "lib-shared-ink"}, "breakpoints": {"mobile": "lib-shared-mobile"}}
    }
  }
}
```

Prop types are text, number, boolean, url and color. Target fields are text, allowed `styles.PROPERTY`, or attrs.href/src/alt/title/aria-label/value/placeholder. Prop values retain their JSON type; numbers and booleans are rendered as strings at their target. Variant patches permit text, attrs and styles, but cannot mutate id, for, aria-labelledby or aria-describedby. Local href fragments referencing source HTML IDs are remapped to the linked instance's existing identity map. Slot allowedTags is optional; when present, every supplied top-level content tag must match. Targets must belong to the definition subtree. Library provenance maps are optional for old documents; a legacy pin without node provenance requires detach and reimport before update.

Library snapshots cannot contain nested library pins. Imports reject overlapping selected source trees, nested linked sources, and selected source CMS, code, provider, advanced behavior, applied-preset or localized-asset dependencies that require explicit local authoring. No dependency is silently discarded. A fragment reference can resolve within the imported source or against an existing destination HTML ID; missing destinations reject. Tokens and breakpoints use `lib-PIN-NAME`, preventing host replacements. A namespace beyond the identifier limit rejects.

## Compiler extension groups

`cms` accepts bindings, lists, templates and localized maps. A binding is `{collection,field?,target:"text"|"src"|"href",item?}` keyed by node ID. URL bindings require a URL or image field and a compatible semantic element. A list is `{collection,filter?,sort?,offset?,limit?,pageSize?,emptyNode?}` keyed by node ID. Filters are `{field,op,value}`, up to 32. Operators eq/ne require the field's type; ordered comparisons gt/lt/gte/lte require number or date; contains accepts string fields or one reference against a references field; in accepts an array of typed operands. Sort entries are `{field,direction:"asc"|"desc"}`. Dotted fields dereference reference collections; id/slug/status are virtual text fields. Templates are keyed by page ID and contain `{collection,slug,title?,description?}`, where slug must contain `{item.slug}`. Localized data is `{collectionID:{itemID:{locale:{values,slug?,status?}}}}`.

Collection fields use `{name,type,required?,collection?}`. Supported types are text, number, boolean, url, image, date, reference and references. Reference fields require a target collection. Single values are item IDs; multiple values are arrays of item IDs. Base and localized targets must exist. Items are `{id,slug,values,status}` with status draft, published or archived.

`localization` accepts `{allLocales?,pageSlugs?:{pageID:{locale:slug}},assets?:{nodeID:{locale:safeURL}}}`. `seo` accepts `{pages?:{pageID:{titleTemplate?,descriptionTemplate?,jsonLd?}},robots?:{allow?:[path],disallow?:[path]},redirects?:{oldLocalPath:newLocalPath|{to:newLocalPath,status:301|302|307|308}}}`. Legacy strings use status 301. Typed entries require both to and an allowed integer status, with no additional keys. Redirect cycles, self redirects, duplicate normalized source paths and non-local paths reject. Trailing slash aliases share one route identity. JSON-LD is a bounded object and compiler output escapes script-sensitive characters.

`behaviors` accepts nodes, timelines and overlays. Node data is `{states?:{hover?,focus?,press?},conditions?,actions?}`; state maps contain safe CSS strings. Conditions are bounded arrays of `{source:"query"|"session",key,op:"eq"|"ne"|"exists"|"contains",value?}`. A value is required except for exists. Actions use `{trigger,action,target?,variant?,timeline?,overlay?,className?,url?,duration?,easing?,once?,conditions?,event?,experiment?}`. Triggers are click, hover, press, scroll and load. Actions are toggle-class, navigate, fade-in, variant, timeline, overlay-open, overlay-close and analytics-event. Required action arguments and references are validated. Variant targets must be linked roots with the named variant. Analytics event names must match the configured experiment goal when experiment is supplied. Timelines are `{tracks:[{node,keyframes:[styleMap],duration,delay?,at?,easing?}],repeat?}`. Overlays are `{node,label,dismissible?,initial?,sessionKey?}`. Easing is linear/ease/ease-in/ease-out/ease-in-out or bounded cubic-bezier coordinates; durations are bounded to 60,000ms. A sessionKey records authored dismissal state in session storage.

`forms` accepts `{forms:{formNodeID:{successRedirect?,successMessage?,errorMessage?,tracking?,constraints?}}}`. Tracking maps generated hidden field names to query keys; matching authored controls must be hidden inputs. Constraints map existing enabled descendant field names to `{required?,pattern?,min?,max?,minLength?,maxLength?}`. Bounds are ordered and patterns are bounded with backreferences, lookarounds and common nested repetition forms excluded. Backend intake performs its own supported-field validation.

`integrations` accepts `{endpointBase?,widgets?,experiments?,gates?}`. Endpoint bases are HTTPS or exact loopback HTTP without userinfo. Widgets are keyed by existing node IDs and contain `{type,source?,product?,group?,field?}`. Types are fetch, product, cart, checkout, member-login, member-gate and analytics-consent. Experiments are `{name:{variants:[{id,weight}],event}}` with 2 to 8 uniquely named positive-weight variants. Gates are `{route,groups:[group]}` arrays. Limits are 256 widgets, 32 experiments and 128 gates; descriptors carry identifiers, never provider secrets.

`code` accepts components and instances. Components are `{id:{enabled:true,language:"typescript"|"javascript",source,sourceDigest,builtDigest,javascript,props}}`. Sources are limited to 128 KiB, compiled JavaScript to 256 KiB, and both SHA-256 digests are verified against the actual strings. Dependency imports are excluded; the backend build pipeline supplies compiled output. Props are `{name:{type:"string"|"number"|"boolean"|"json",required?,default?}}`. Instances are `{nodeID:{component:id,props:{}}}` with typed required values. Export uses isolated opt-in iframe execution.
