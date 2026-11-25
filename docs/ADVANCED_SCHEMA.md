# FormWeb advanced authority contract

This contract describes the implemented Rust document boundary and consuming commands. The schema version remains 1. `Site.extensions` defaults to an empty object. Unknown namespaces and unknown keys inside known records are rejected. All mutations, including batches, operate on a candidate document; errors preserve the acknowledged document, revision, undo and redo. A batch accepts 1 to 500 commands and commits once. Since 0.19.3 a batch checks the extension groups once at its end instead of after each `variables`, `code` and `design` command, and synchronizes text presets, linked components and pruning once at its end, unless it contains a `component.*` command (linked instances must materialize between steps, so such a batch still synchronizes after every command). The resulting document is byte-identical and a failing batch is still atomic with the same message; a batch that sets many variables no longer costs time quadratic in the document. Single commands are unchanged.

The whole serialized site is limited to 8 MiB and its extensions to 4 MiB. The existing semantic tag, attribute, URL and CSS guards also apply to extension content. Node IDs, component IDs, token IDs and other identifiers use the existing bounded ASCII identifier rule. Secrets belong in backend provider configuration.

## Protocol methods

`checkpoint {}` returns `{schemaVersion:1,site,revision,undo:[Site],redo:[Site]}`. The last array entry is the next undo or redo. `restore {checkpoint,expectedRevision?,restoreRevision?}` validates the complete checkpoint before switching authority. The default restored revision is the greater of the current revision plus one and the saved revision. The supervisor can supply the saved `restoreRevision` for exact crash recovery. History has at most 100 entries in either array, all documents must have the checkpoint site's ID, and the checkpoint must fit within 32 MiB. Ordinary mutations trim the oldest history until total serialized documents fit within 31 MiB. No-op mutations retain redo.

`validate {site}` returns `{valid:true}` without changing the document or revision. `load {site,restoreRevision?}` is the legacy document-only operation and clears history. `site.replace {site}` preserves the current site ID and records one undo entry. All `exec` and `batch` requests can carry `expectedRevision` outside command params.

## Authoring commands

| Command | Params | Consuming behavior |
| --- | --- | --- |
| `page.duplicate` | `{id,name?,slug}` | Fresh owned node IDs, linked component associations, instance data, node bindings, behaviors, forms, code/provider instances, preset references, localized assets and strings, and page SEO/template settings are copied. HTML references are remapped. Duplicated localized/template routes receive the new route prefix. Since 0.19.4 the copy also carries `motion.scripts` (steps remapped to the copied nodes), `code.sections`, and `variables.inputs` and `variables.outputs` (copied as they are, since they hold names and code). |
| `page.move` | `{id,index}` | Moves the page to `index` in the page list (0 is first), shifting the pages between; one undo step (0.29.0). The first page is the home page: the editor opens it first and marks it Home, and paste, the section library and releases default to it. The exported `index.html` is still the page whose slug is `/`, so making another page the home page in the editor also needs its slug changed. Refused: an unknown page, an `index` outside the list and the index the page already has. |
| `node.duplicate` | `{id,parent?,index?}` | Copies the element and its subtree (0.19.4). The copy goes right after the original, or under `parent` last or at `index`. It uses the same copying of node-keyed extension entries as `page.duplicate`, including motion scripts, code sections and variable inputs and outputs; HTML ids get the copy's suffix (0.20.1, narrowed in 0.20.2: a trailing -copy-N or -page-N is replaced by the new ending instead of extended only when copy-N or page-N is the copied element itself or one of its ancestors in the site, and the result is free in the site; an author id such as x-copy-5, step-page-2, step-copy or hero-2 is appended to, as in x-copy-5-copy-N, never renumbered; behavior timeline and overlay ids swap their leading copy-N- under the same condition; label for, aria-labelledby, href="#id", node interactions and behavior actions with a #id url follow to the copy's ids; the node's behaviors.nodes entry is kept and pointed at the copy), and element copies on one page share a variable by design. The result is validated and the command is one undo step. Refused: a page root (use `page.duplicate`), a node inside or a destination inside a linked component instance, more than 2,000 nodes and an `index` outside the children. |
| `node.paste` | `{fragment,parent?,index?}` | Inserts an element fragment (see Element fragments below) under fresh node IDs: last under `parent`, the first page root by default, or at `index`. HTML ids get the paste's suffix (short ids as for `node.duplicate`, 0.20.1; since 0.20.2 an ending is swapped only when copy-N or page-N is an element inside the fragment itself, so an author id like x-copy-5 is appended to; since 0.20.3 the fragment's optional `ancestors` ids, at most 256 strings of at most 128 bytes, count as well and are otherwise ignored). Node-keyed entries are copied as `node.duplicate` copies them, and object keys inside entries are never renamed, so a node called `stage` survives. Code component definitions and variables the site lacks are added; when the site already has one of the same name that differs, the site's own is kept and a line in the batch state's `warnings` says so. Code sections are refused unless the site has `code.allowSections`. Refused: a wrong format or version, an invalid tree or entries, more than 2,000 nodes, a destination inside a linked component instance and an `index` outside the children. The result is validated and the command is one undo step. |
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
| `cms.query` | `{node,query}` | Stores a validated list query consumed by the CMS compiler. `node` is the repeating element: export renders that node itself once per matching published item, so it goes on the card or row, not on the container that holds the cards. |
| `cms.binding` | `{node,binding}` | Stores an explicit typed text, href or src binding. |
| `cms.localize` | `{collection,item,locale,values,slug?,status?}` | Stores localized field overrides and validates merged localized items, slug uniqueness and actual relation targets. Register export locales with `locale.set`. |
| `extension.set` | `{group,value}` | Replaces one rigorously validated extension group. Existing unrelated groups persist. |
| `extension.remove` | `{group}` | Removes a group subject to final whole-document validation. |
| `library.import` | `{id,name,version,site,parent,components?:[sourceComponentID]}` | Imports a pinned snapshot's selected component sources, namespaced tokens/breakpoints, definitions, forms and strings. |
| `library.update` | `{id,version,site}` | Applies a new explicit pin, preserves source node identity and instance overrides, and rejects conflicting local source/definition/token/breakpoint edits. |
| `library.detach` | `{id}` | Removes provenance while keeping the local authored sources and instances. |
| `motion.set` | `{kind,node,value}` | Upserts one entry of the `motion` group. `kind` is reveals, scenes, loops, counters, text, drag, pointer, disclosure, actions or scripts; the entry is validated at once, so a bad value fails the command. |
| `motion.remove` | `{kind,node}` | Deletes one motion entry; removing the last one clears the group. |
| `motion.track` | `{scene,list,index,track}` | Edits one entry of a scene's `tracks` (default) or `distribute` list (`list` is `"tracks"` or `"distribute"`). `index` runs from 0 to the list length: an object replaces the entry, or appends when `index` equals the length; `track: null` removes the entry. The whole scene is validated afterwards, and a failing change leaves the document untouched and returns the validator's message. |
| `design.set` | `{key,value}` | Replaces `properties`, `themes` or `fonts` inside `design`, leaving tokens, text presets and applications untouched. |
| `variables.set` | `{kind,name,value}` | Upserts one entry of the `variables` group. `kind` is values, tables, formulas, inputs or outputs; for inputs and outputs `name` is the node ID. The resulting group is validated, and a failure leaves the document unchanged. |
| `variables.remove` | `{kind,name}` | Deletes one entry of the `variables` group, subject to the same validation. Removing a value or formula that another entry still uses fails. |
| `code.instance.set` | `{node,value}` | Upserts a code component instance `{component,props,poster?,posterLight?}` on a node, validated against the component's props. `poster` and `posterLight` are owned image assets that replace the component's poster for this one element (the light one counts only beside an own `poster`); without them the instance shows the component's poster. |
| `code.instance.remove` | `{node}` | Removes the instance on a node. |
| `code.section.set` | `{node,value}` | Upserts a code section on a childless node. Requires `code.allowSections`. |
| `code.section.remove` | `{node}` | Removes the code section on a node. |
| `code.sections.allow` | `{enabled}` | Sets `code.allowSections`. Disabling fails while any section exists. |

Page addresses (0.31.1): `page.add`, `page.duplicate` (and so every `page.bulk` row) and a `page.update` that changes a slug refuse an address another page already has when the two differ only in capital letters or in leading and trailing slashes, because the export writes one folder per page and `/two` and `/TWO` are the same folder on macOS and Windows. The refusal is one sentence that names the page using the address, for example `/TWO is the same address as /two, which Two uses: addresses that differ only in capital letters are the same folder on macOS and Windows. Choose another address.` A batch is checked command by command, so to swap addresses give the old page a free address first (Set as home page does). A page may change the capitals of its own address. `cms.upsert` applies the same rule to a new or changed item slug inside its collection. Slugs are ASCII letters, digits, `-`, `_` and `/` only, so no Unicode normalisation is needed. The check is for changes only: a site saved before 0.31.1 with two such addresses still loads, the audit reports `page.address-case` on the second page (Select opens its settings), and the export warns that the two folders differ only in capital letters.

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

`localization` accepts `{allLocales?,pageSlugs?:{pageID:{locale:slug}},assets?:{nodeID:{locale:safeURL}}}`. `seo` accepts `{pages?:{pageID:{titleTemplate?,descriptionTemplate?,jsonLd?}},robots?:{allow?:[path],disallow?:[path]},redirects?:{oldLocalPath:newLocalPath|{to:newLocalPath,status:301|302|307|308}}}`. Legacy strings use status 301. Typed entries require both to and an allowed integer status, with no additional keys. Redirect cycles, self redirects, duplicate normalized source paths and non-local paths reject. A source `/x/*` (one star, last segment only, non-empty base) is a splat rule and may target a path that uses `/:splat` once; `:splat` needs a splat path. A splat into its own prefix (`/docs/*` to `/docs/:splat`), `/*`, `/a/*/b`, `/a*` and splat cycles are refused. Exact paths win over splats, then the longest splat prefix. `redirects.json` keeps its shape (a map of path to target or {to, status}). Published releases follow splats and never let a splat become a redirect off the site. A page routed at `/404` is also exported as a root `404.html` whose URLs start at the base URL's path (`/assets/...`, or `/repo/assets/...` for a base URL ending in `/repo`), so a host can serve it at any missing address; it is not in the sitemap or routes.json, and sites without one export as before. A published release answers a missing path with that page and status 404, after the same visitor and password gates as the page itself, and an unpublished preview does the same under `/preview/<token>/` when its export has a 404 page (redirects still win). The served copy points fragment-only links (the skip link, in-content `#anchors`) at the request's own path and query so they scroll on the same document; the exported files are unchanged. A site with a page at `/404` and a base URL unset or `https://example.com` gets an export warning on both export paths and the audit issue `seo.base-url-404`, because under a path the 404 page would lose its styles. Trailing slash aliases share one route identity. JSON-LD is a bounded object and compiler output escapes script-sensitive characters.

`behaviors` accepts nodes, timelines and overlays. Node data is `{states?:{hover?,focus?,press?,selected?},conditions?,actions?}`; state maps contain safe CSS strings. `selected` is the look of a chosen tab or filter chip: export writes it for `[aria-selected="true"]` and `[aria-pressed="true"]` on that element, and the tab or chip that is chosen when the page opens carries that attribute in the HTML so the look is there before the runtime starts. Sites that do not use `selected` export byte for byte as before. Conditions are bounded arrays of `{source:"query"|"session",key,op:"eq"|"ne"|"exists"|"contains",value?}`. A value is required except for exists. Actions use `{trigger,action,target?,variant?,timeline?,overlay?,className?,url?,duration?,easing?,once?,conditions?,event?,experiment?}`. Triggers are click, hover, press, scroll and load. Actions are toggle-class, navigate, fade-in, variant, timeline, overlay-open, overlay-close and analytics-event. Required action arguments and references are validated. Variant targets must be linked roots with the named variant. Analytics event names must match the configured experiment goal when experiment is supplied. Timelines are `{tracks:[{node,keyframes:[styleMap],duration,delay?,at?,easing?}],repeat?}`. Overlays are `{node,label,dismissible?,initial?,sessionKey?}`. Easing is linear/ease/ease-in/ease-out/ease-in-out or bounded cubic-bezier coordinates; durations are bounded to 60,000ms. A sessionKey records authored dismissal state in session storage.

`design` also accepts `properties`, `themes` and `fonts` (0.19.0). Properties are `{name:{syntax,inherits,initial}}` for registered custom properties, compiled to `@property`; syntax is `<number>`, `<integer>`, `<length>`, `<percentage>`, `<length-percentage>`, `<color>`, `<angle>`, `<time>` or `*`. Themes are `{default:"dark"|"light",followSystem?,values?:{dark?,light?}}`; every value key must be an existing token, `site.tokens` hold the default mode, and export writes the other mode as `html[data-theme="..."]` overrides plus a blocking head script that picks the saved choice, then the system preference when `followSystem`, then the default. A node with `data-fw-theme-only="dark"` or `"light"` shows only in that theme. Fonts are `{id:{family,src,weight?,style?,display?}}` with an owned `/api/assets/<sha>.woff2` or https source, at most 16, exported as `@font-face` with a preload link; display defaults to optional.

`motion` (0.19.0, ten maps from 0.19.1) holds maps keyed by existing node IDs: `reveals` `{from,duration?,delay?,stagger?,children?,easing?,threshold?,rootMargin?,once?,trigger:"view"|"load"}`; `scenes` `{stage,length(100..2000 svh),offset? (a length, `var(--token)` or a `calc()` of lengths and tokens since 0.19.3),smoothing?,tracks:[{node,keyframes:[{at,styles}],easing?}],distribute?:[{parent,stagger,keyframes}],markers?:[{at,action}],reducedAt?,progressVar?}`; `loops` `{type:"marquee"|"spin"|"float"|"keyframes",...}`; `counters` `{to,from?,duration?,decimals?,trigger?,odometer?}`; `text` `{type:"split"|"typewriter"|"ghost",...}`; `drag` `{axis?,bounds?,inertia?,friction?,restitution?,rotate?,keyboard?,flip?:{back}}`; `pointer` `{type:"tilt"|"follow"|"proximity",...}`; `disclosure` `{type:"accordion"|"tabs"|"filter",items|chips,...}`; and `actions` arrays of `{trigger,action,...}` with actions copy, scroll-to, media, lightbox, toggle-theme, set-variable, search and play; and `scripts` (see Motion scripts below). Triggers are click, hover, submit, change, load, view and input. Keyframes and from-states take motion-safe properties only (opacity, transform, translate, scale, rotate, filter, backdrop-filter, clip-path, colours, box-shadow and custom properties), so motion never moves layout. Easing adds `spring(stiffness,damping)`. Scene keyframes start at 0, end at 1 and ascend; tracks and distribute parents must sit inside the scene. The group holds at most 2,000 entries. Removing a node prunes every entry that keys on it or points at it. Edit a single scene track with `motion.track` instead of replacing the scene. Export appends `motion.js` and `interact.js` to the runtime only for sites that use motion (`interact.js` also when `variables` exists), then `variables.js`, `play.js` and `components.js` only when used; reduced motion shows each scene's `reducedAt` state and runs no animation.

`forms` accepts `{forms:{formNodeID:{successRedirect?,successMessage?,errorMessage?,tracking?,constraints?}}}`. Tracking maps generated hidden field names to query keys; matching authored controls must be hidden inputs. Constraints map existing enabled descendant field names to `{required?,pattern?,min?,max?,minLength?,maxLength?}`. Bounds are ordered and patterns are bounded with backreferences, lookarounds and common nested repetition forms excluded. Backend intake performs its own supported-field validation.

`integrations` accepts `{endpointBase?,widgets?,experiments?,gates?}`. Endpoint bases are HTTPS or exact loopback HTTP without userinfo. Widgets are keyed by existing node IDs and contain `{type,source?,product?,group?,field?}`. Types are fetch, product, cart, checkout, member-login, member-gate and analytics-consent. Experiments are `{name:{variants:[{id,weight}],event}}` with 2 to 8 uniquely named positive-weight variants. Gates are `{route,groups:[group]}` arrays. Limits are 256 widgets, 32 experiments and 128 gates; descriptors carry identifiers, never provider secrets.

`code` accepts components, instances, `allowSections` and `sections`. Components are `{id:{enabled:true,language:"typescript"|"javascript",source,sourceDigest,builtDigest,javascript,props,mode?,poster?,posterLight?}}`. Sources are limited to 128 KiB, compiled JavaScript to 256 KiB (page mode: 256 KiB and 512 KiB), and both SHA-256 digests are verified against the actual strings. Dependency imports are excluded in both modes; the backend build pipeline supplies compiled output. Props are `{name:{type:"string"|"number"|"boolean"|"json"|"color"|"asset",required?,default?}}`. Instances are `{nodeID:{component:id,props:{}}}` with typed required values. Isolated components export as opt-in iframes; page components and sections are described below.

## Motion scripts and site search (0.19.1)

`motion.scripts` is keyed by the trigger node: `{trigger,once?,restart?,reset?,loop?,loopDelay?,steps}`. `trigger` is submit (the node is a form and its default submission is prevented), click, load, view or change. At most 50 scripts and 100 steps each; texts at most 4,000 characters; `wait.ms` 0 to 60,000; `speed` 1 to 2,000 characters or words per second; `duration` 0 to 10,000; `loopDelay` 0 to 60,000. The 2,000 entry total of `motion` covers scripts too.

| Step | Fields | Behavior |
| --- | --- | --- |
| `append` | `template,into,as?,text?` | Clones a node that carries the `hidden` attribute (validated) into `into` as its last child, removes `hidden` and every `id` in the clone, marks it `data-fw-clone`, and sets its text when `text` is given (the deepest first element with text, else the clone). `as` names the clone as `@alias` for later steps. |
| `stream` | `target,text,speed?,by?` | Reveals text into the target by `chars` (default) or `words`. |
| `type` | `target,text,speed?` | Types into an input or textarea value and dispatches `input` events, so bound variables update. |
| `clear` | `target` | Empties an input value or an element's text. |
| `wait` | `ms` | Pauses the script. |
| `class` | `target,add?,remove?` | Adds and removes class names (identifiers). |
| `pointer` | `target,to,duration?,easing?` | Moves an absolutely positioned target so its top-left lands on the centre of `to`, with `translate` only. |
| `press` | `target` | Sets `data-fw-pressed` for 160 ms. |
| `scroll` | `target,to` | Scrolls the container to `start`, `end` or a node ID into view. |
| `focus` | `target` | Focuses the target without scrolling. |
| `action` | `action` | Runs one motion action object (no `trigger`) through the shared action runner. |

Targets are node IDs on the page or `@alias`. Text tokens `{input:<node>}` (that input's value) and `{var:<name>}` (a variable's formatted text) are inserted as text, never HTML; anything else is literal. `once` runs the script once per page view; `restart` lets a new trigger stop the running run, otherwise triggers during a run are ignored; `reset` removes the clones the previous run made first; `loop` repeats after `loopDelay` (load and view triggers only). Under reduced motion `stream` and `type` complete at once and `pointer` jumps; waits stay. The action `{"action":"play","script":"<key>"}` runs a script from any action trigger. A form that triggers a `submit` script and has no `forms` entry is exported without `action`, `method` and the form status line, so the forms runtime never posts it.

New actions in `motion.actions`: `set-variable` `{variable,value}` or `{variable,formula}` (`value` must match the variable's type; `formula` is an expression validated by the formula grammar), `search` and `play` `{script}`. Trigger `input` fires on the element's `input` event for every action.

Site search is the action `{"trigger":"input","action":"search","input":"q","results":"results-list","template":"result-tpl","limit":8,"empty":"no-results","fromParam":true}`. `input` is a text input node, `results` a container, `template` a node with `hidden` on the page, `limit` 1 to 50 (default 8), `empty` an optional node whose `hidden` is removed when a non-empty query has no results, and `fromParam` seeds the input on load from the address: `?q=` (or `?` plus the input's own `name` attribute when that differs), taken as typed with control characters and runs of spaces collapsed and cut at 200 characters, else `?from=` (the path's words split on `/`, `-`, `_`, `.`). A result clone fills `[data-fw-slot="title"]`, `[data-fw-slot="path"]` and `[data-fw-slot="excerpt"]` text and sets `href` on `[data-fw-slot="link"]`.

When any page has a `search` action, export writes `search-index.json` at the export root: an array in route order of `{path,locale,title,headings,text}`. `path` is relative to the export root (`""` for home, `"about/"`), `headings` holds up to 50 h1 to h3 texts, `text` the first 4000 characters of visible text with whitespace collapsed, leaving out text inside `nav` and `footer`; the page at `/404` is not listed. An excerpt slot shows the first 400 characters of `text`. The runtime fetches it once on first focus or input (or on load when `fromParam` has a value). Queries are lowercased, diacritics removed and split on non letters and digits. Per token the best match counts in title (weight 3), headings (2) and text (1): exact word 1.0, word prefix 0.8, in-order subsequence inside a word of 3 or more characters 0.4. Scores add, zero scores drop, ties sort by path.

Runtime action handlers register on `globalThis.__formwebActions`; `interact.js` falls back to it for unknown actions, and `play.js` (scripts and search) is appended only when scripts or `search` or `play` actions exist.

## Variables and formulas (0.19.1)

`variables` is an extension group of optional objects `values`, `tables`, `formulas`, `inputs` and `outputs`; unknown keys are rejected everywhere.

```json
{
  "values": {
    "seats": {"type": "number", "initial": 12, "min": 1, "max": 500, "step": 1, "cssVar": true},
    "plan": {"type": "text", "initial": "team", "options": ["solo", "team", "studio"]},
    "annual": {"type": "boolean", "initial": false, "cssVar": true}
  },
  "tables": {"price": {"solo": 12, "team": 29, "studio": 59}},
  "formulas": {"monthly": "seats * lookup(price, plan)", "yearly": "round(monthly * 12 * if(annual, 0.8, 1), 0)"},
  "inputs": {"seats-range": {"variable": "seats", "event": "input"}, "plan-select": {"variable": "plan"}},
  "outputs": {"monthly-out": {"from": "monthly", "decimals": 0, "prefix": "$", "suffix": "/mo", "grouping": true, "reserve": 7}}
}
```

Limits: names match `^[A-Za-z_][A-Za-z0-9_]{0,63}$`, are unique across values, tables and formulas, and are not a function name, `true` or `false`. At most 200 values, 50 tables (500 entries each, keys up to 64 characters, values finite numbers or strings up to 200 characters), 200 formulas (2,000 bytes each), 500 inputs and 500 outputs.

- Number values: finite `initial`; optional finite `min`, `max`, `step` with `min <= initial <= max` and `step > 0`. Text values: `initial` up to 2,000 characters; optional `options` (1 to 100 strings up to 200 characters) that contain `initial`. Boolean values: boolean `initial`. `cssVar` (number and boolean only) writes `--fw-v-<name>` on `<html>`.
- Inputs are keyed by an existing `input`, `select` or `textarea` node; `variable` names a value, not a formula; `event` is `input` (default) or `change`. Range and number inputs parse as numbers, checkboxes give booleans, and all inputs bound to one value stay in sync.
- Outputs are keyed by an existing node; `from` names a value or formula; `decimals` 0 to 10 (default 0); `prefix` and `suffix` up to 32 characters; `grouping` (default false); `reserve` 1 to 64 characters of minimum width (default: the formatted initial value's length plus 2).
- Formulas reference only known names, use tables only as the first argument of `lookup` or as arguments of `sum`, have no cycles, and are at most 512 tokens long with at most 64 levels of nesting.

Grammar, lowest to highest precedence:

```
or     := and ( "||" and )*
and    := cmp ( "&&" cmp )*
cmp    := add ( ( "==" | "!=" | "<" | "<=" | ">" | ">=" ) add )?
add    := mul ( ( "+" | "-" ) mul )*
mul    := unary ( ( "*" | "/" | "%" ) unary )*
unary  := ( "-" | "!" ) unary | pow
pow    := atom ( "^" unary )?
atom   := number | string | name | call | "(" or ")"
```

Strings are double quoted without `"` or `\`, up to 200 characters. Functions: `min`, `max` (one or more arguments), `round(x)` and `round(x, digits)` (digits 0 to 10), `floor`, `ceil`, `abs`, `clamp(x, lo, hi)`, `sum(a, ...)` (a table argument adds its numeric entries), `lookup(table, key)` and `lookup(table, key, fallback)` (key converted to text; missing key gives `fallback`, default 0) and `if(cond, a, b)`.

Semantics: values are numbers, text or booleans. Arithmetic turns booleans into 1 and 0 and text into a number by trimming and parsing a decimal literal, else 0. Two texts compare as text, anything else as numbers. `&&`, `||`, `!` and `if` use truthiness: 0, empty text and false are false. `%` takes the sign of the dividend, `^` is right-associative, division or remainder by 0 gives 0, and any non-finite result becomes 0. A number converts to text without a decimal point when an integer, otherwise with up to 10 decimals and trailing zeros removed.

Output formatting rounds half away from zero to `decimals` (`sign(x) * floor(|x| * 10^d + 0.5) / 10^d`), then writes exactly `decimals` digits with `.` as the decimal point, `,` thousands groups when `grouping`, then `prefix` and `suffix`. The Rust exporter and the JavaScript runtime produce identical strings.

Export pre-renders every output with its formatted initial value, gives it `font-variant-numeric:tabular-nums` and `min-width:<reserve>ch` (plus `display:inline-block` for inline tags), sets `value` or `checked` on bound inputs from the initial value (and `min`, `max`, `step` from a number value when the node has none), and writes the `--fw-v-*` properties from the head boot script, so first paint already shows final numbers. The runtime `variables.js` parses and evaluates formulas without `eval`, writes an output only when its string changed, and exposes `globalThis.__formwebVariables = {get(name), set(name, value), subscribe(name, fn)}`. `node.remove` prunes inputs, outputs, scripts and search actions that name the removed node.

## Page components and code sections (0.19.1)

A code component gains `mode`, `poster` and two prop types. `mode` is `"isolated"` (default, an iframe) or `"page"` (runs in the page with full access; use it only for trusted code). `poster` is an owned asset path `/api/assets/<64 hex>.(png|jpg|jpeg|webp|gif|svg)`. `posterLight` (0.19.4) is a second poster with the same owned-image rule, shown instead of `poster` in the light theme. An instance record `code.instances.<node>` may carry its own `poster` and `posterLight` under the same rule: they replace the component's pair for that element only (an own `posterLight` counts only beside an own `poster`), so two instances with different settings can show different posters; an instance without them shows the component's pair, and exports of such sites do not change. The `color` prop is a 3, 4, 6 or 8 digit hex colour, an `rgb(`, `rgba(`, `hsl(` or `hsla(` function with digits, commas, spaces, dots, `%` and `/` only, or `var(--name)`; the `asset` prop is an owned asset path.

A page component module exports `mount(root, props, ctx)` and may return nothing, a cleanup function or `{update(props), destroy()}`. `root` is a `div[data-fw-layer]` that the runtime creates inside the host with `position:absolute;inset:0`, so the component never changes the host's size.

```ts
interface ComponentContext {
  host: HTMLElement; id: string; reduced: boolean;
  theme(): 'dark' | 'light'; onTheme(fn: (mode: 'dark' | 'light') => void): () => void;
  token(name: string): string;
  asset(path: string): string;
  progress(scene?: string): number;
  onProgress(fn: (p: number) => void, scene?: string): () => void;
  onFrame(fn: (now: number) => void): () => void;
  visible(): boolean; onVisible(fn: (v: boolean) => void): () => void;
  size(): { width: number; height: number }; onResize(fn: (s: { width: number; height: number }) => void): () => void;
  variable(name: string): unknown; onVariable(name: string, fn: (v: unknown) => void): () => void;
  ready(): void;
}
```

`token(name)` reads the computed `--name` on `:root`; `asset(path)` maps an `/api/assets/<file>` prop value to its exported URL; `progress` and `onProgress` follow the nearest enclosing scene by default and return 0 without the motion group; `onFrame` is the shared loop, paused when hidden; `ready()` marks the first frame drawn and hides the poster.

Export writes each enabled page component used on any page to `assets/components/<id>.js` with its compiled JavaScript unchanged. The host renders as the node's own element with `data-fw-component="<id>"` and, with a poster, a first child `<img data-fw-poster src alt="" decoding="async">`; route CSS keeps the host `position:relative` and the poster `display:block;width:100%;height:100%;object-fit:cover`. The page config holds `components.page = {host: {component, props}}` with asset props rewritten to exported URLs, and page instances render no iframe. `components.js` imports a module once when its host comes within one viewport, calls `mount`, and on `ready()` sets the poster to `visibility:hidden` so its box stays. An error keeps the poster, sets `data-fw-component-error` on the host (`data-fw-error` belongs to form fields) and logs one console error with the component id, the host node and the error. Page instances are drawn on the canvas as the poster (or a dashed "Component" placeholder) and never run there. When the site has themes and the component has both `poster` and `posterLight` (0.19.4), the host gets two images: the dark one with `data-fw-theme-only="dark"` and the light one with `data-fw-theme-only="light"`. The theme-only rule is emitted for them even when no node carries the attribute, and one sibling rule hides the second poster once the runtime hides the first on `ready()`, so `components.js` is unchanged. Without `posterLight`, or without themes, the output is the same as before. On the canvas the light poster is drawn while the Design system dialog previews the light theme.

Code sections need `code.allowSections: true`. A section is `code.sections.<node> = {enabled,html?,css?,js?,module?,poster?}` with `html` up to 512 KiB, `css` 256 KiB, `js` 512 KiB, `module` boolean and `poster` an owned image path. The host node must have no children. Export renders the host's open tag, `html` raw and the close tag; appends `css` to that route's page stylesheet; and, when `js` exists, writes `assets/sections/<node>.js` and loads it with `<script src defer>` right after the host. A classic script is wrapped as `(function(host){ ...js... })(document.querySelector('[data-fw-node="<node>"]'))`; with `module: true` it is a module with the prelude `const host=document.querySelector(...)` and `type="module"`. Section code never runs on the canvas. The editor's Import HTML file moves `<style>` contents to `css`, inline `<script>` contents to `js` and the remaining body markup to `html`; external scripts and stylesheets stay in `html`.

Preview responses under `/preview/<token>/` carry `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups`, and `/api/` or `/mcp` requests with `Origin: null` (or `Sec-Fetch-Site: cross-site`) are refused with 403 unless they come from a verified preview runtime or forms path, so a page component cannot reach the editor API.

SVG assets: `POST /api/assets` accepts `image/svg+xml` up to 2 MiB when it parses as XML with an `svg` root and contains no `<!DOCTYPE`, `<!ENTITY`, `script`, `foreignObject`, `iframe`, `embed` or `object` elements, no attribute starting with `on`, no `javascript:`, no `href` or `xlink:href` value that does not start with `#`, no `@import`, and no `url(` other than `url(#`. It is stored as `<sha256>.svg`, served as `image/svg+xml` with a locked-down Content-Security-Policy, carried in the `.fweb` envelope and bundled into exports like other images.

## Section library (0.19.2)

The library ships section templates, page components, presets and starters as data under `library/` and expands them into ordinary commands. The full guide is [LIBRARY.md](LIBRARY.md); this section is the contract.

Routes (reads authorize `read`, writes `edit`; each write is one `/api/batch` with the current revision, so one undo step):

| Route | Body | Result |
| --- | --- | --- |
| `GET /api/library` | | `{categories, sections, components, presets, starters}` summaries |
| `GET /api/library/thumbs/{id}.webp` | | thumbnail, `Cache-Control: no-cache` |
| `GET /api/library/components/{id}/poster.webp` | | component poster, `no-cache` |
| `GET /api/library/components/{id}/poster-light.webp` | | light-theme poster, `no-cache`; 404 when the component has none (0.19.4) |
| `POST /api/library/sections/{id}/insert` | `{parent?, index?, values?, page?, updateComponents?}` | `{root, warnings}` plus the batch result |
| `POST /api/library/presets/{id}/apply` | `{mode?: "all" \| "missing", page?}` | `{changed}` plus the batch result |
| `POST /api/library/starters/{id}/apply` | `{values?, updateComponents?}` | `{pages, warnings}` plus the batch result |
| `POST /api/library/import-html` | `{html, css?, name?, parent?, index?, page?}` | `{root, warnings}` plus the batch result |

A section template is `formweb-section` version 1 with the keys `id`, `name`, `category`, `tags`, `product`, `description`, `source`, `preset`, `components`, `fields`, `tree`, `commands`, optional `behaviors` and optional `properties`. A tree node has only `key`, `tag`, `name`, `text`, `attrs`, `styles`, `breakpoints` and `children`; each becomes a `node.add` whose id is `<key>-<suffix>`. Placeholders are `$parent` (the whole string), `@@key@@` (a node id), `{{field}}` (a field value; the raw value when it is the whole string) and, since 0.19.3, `%%name%%`, a variable scoped to the insert that expands to `name_<suffix>` (the node ids' suffix) in variable names, formulas, actions, scripts, component props and `var(--fw-v-...)` styles. Fields have types `text` (400 characters), `longtext` (4,000), `color` (hex), `url`, `asset` and `number`. `commands` run after the tree; `extension.set` and `design.set` are refused in a template. `behaviors` is merged into the `behaviors` group with one `extension.set` at the end of the batch, and `properties` into the registered properties with one `design.set`, each keeping what the site already has. A component manifest is `formweb-component` version 1 whose `props` descriptors carry only `type`, `required` and `default`.

Insert applies the template's preset in mode `missing` (only tokens, light values, fonts, text presets and root styles the site lacks), while the preset route's default mode `all` replaces every value the preset defines. Insert also owns the bundled media the template references as `/api/assets/<sha256>.<ext>` and merges missing built components into the `code` group. Import HTML takes the whole body into one code section, so `html` up to 512 KiB, `css` 256 KiB and `js` 512 KiB apply, and it replaces the formai kit's `reduced`, `onTheme` and `token` helpers with an inline shim.

Export change: the route stylesheet keeps a token only when something on the route references it with `var(--name)`. Page component sources and props, component instances on the route, and code section `html`, `css` and `js` now count as references, so a token that only a component or a code section reads is no longer dropped from the export.

## Wider authoring vocabulary (0.19.3)

Every new style property below passes the shared value check first (no `url()`, no `expression`, no control characters, at most 4,096 bytes) and then its own check, implemented in `native/crates/formweb-model/src/css.rs`. Wide keywords (`inherit`, `initial`, `unset`, `revert`) are accepted wherever a keyword list is. A "length" is `0`, a number with one of `px rem em % vh vw svh lvh dvh vmin vmax ch ex vi vb lh cqw cqh`, `var(--ident)`, or `calc()`, `min()`, `max()` or `clamp()` whose body holds only numbers, units, `+ - * /`, commas, parentheses and `var(--ident)` (at most 512 characters, balanced). A "colour" is a hex value of 3, 4, 6 or 8 digits, a keyword name, `var(--ident)` or `rgb()`, `rgba()`, `hsl()`, `hsla()`.

| Property | Accepts |
| --- | --- |
| `margin-block`, `margin-inline`, `inset-block`, `inset-inline` | one or two lengths, `auto` allowed |
| `margin-block-start`, `-end`, `margin-inline-start`, `-end`, `inset-block-start`, `-end`, `inset-inline-start`, `-end` | one length, `auto` allowed |
| `padding-block`, `padding-inline` and their `-start` and `-end` | one or two lengths (one for the longhands), no `auto` |
| `inline-size`, `block-size`, `min-inline-size`, `min-block-size` | a length or `auto`, `min-content`, `max-content`, `fit-content` |
| `max-inline-size`, `max-block-size` | a length or `none`, `min-content`, `max-content`, `fit-content` |
| `border-block`, `border-inline` | up to three of a border style, a length and a colour |
| `background-clip`, `-webkit-background-clip` | up to four comma separated `border-box`, `padding-box`, `content-box`, `text` |
| `-webkit-text-fill-color`, `text-decoration-color` | a colour (`transparent` included) |
| `fill`, `stroke` | `none` or a colour (`currentColor` and `var(--token)` included); no `url()` |
| `stroke-width` | a number or a length |
| `writing-mode` | `horizontal-tb`, `vertical-rl`, `vertical-lr`, `sideways-rl`, `sideways-lr` |
| `text-orientation` | `mixed`, `upright`, `sideways` |
| `scrollbar-width` | `auto`, `thin`, `none` |
| `scrollbar-color` | `auto` or two colours |
| `scrollbar-gutter` | `auto`, `stable`, `stable both-edges` |
| `text-underline-offset` | `auto` or a length |
| `text-decoration-thickness` | `auto`, `from-font` or a length |
| `overflow-wrap` | `normal`, `break-word`, `anywhere` |
| `hyphens` | `none`, `manual`, `auto` |
| `appearance`, `-webkit-appearance` | `none`, `auto` |
| `resize` | `none`, `both`, `horizontal`, `vertical`, `block`, `inline` |
| `text-rendering` | `auto`, `optimizeSpeed`, `optimizeLegibility`, `geometricPrecision` |
| `-webkit-user-select` | `auto`, `none`, `text`, `all`, `contain` |

`word-break`, `user-select`, `caret-color` and `accent-color` were already allowed and keep their earlier checks.

Attributes: `enterkeyhint` is `enter`, `done`, `go`, `next`, `previous`, `search` or `send`; `inputmode` is `none`, `text`, `tel`, `url`, `email`, `numeric`, `decimal` or `search`; `spellcheck` is `true` or `false`; `autocomplete` is one or more space separated tokens of letters, digits and `-`, at most 100 characters; `focusable` is allowed on `svg` only, with `true`, `false` or `auto`.

SVG tags: `rect`, `circle`, `ellipse`, `line`, `polyline` and `polygon` are allowed inside `svg`, `g`, `pattern`, `symbol`, `mask` and `clipPath`. Geometry attributes are numbers and lengths only: `rect` takes `x`, `y`, `width`, `height`, `rx`, `ry`; `circle` `cx`, `cy`, `r`; `ellipse` `cx`, `cy`, `rx`, `ry`; `line` `x1`, `y1`, `x2`, `y2`; `polyline` and `polygon` `points`, a list of an even count of numbers between -1,000,000 and 1,000,000 separated by spaces or commas, at most 10,000 characters. They take the same presentation attributes as `path`.

Scene offset: `motion.scenes.*.offset` accepts a length, `var(--token)` or a `calc()` of lengths and tokens; anything else, such as a colour, fails with "scene offset must be a length, var(--token) or a calc() of lengths and tokens". The exporter writes it as the stage's sticky `top` and `motion.js` reads the stage's computed `top` instead of parsing the value, so a token that changes at a breakpoint (for example `--bar-h`) moves the pin with it.

Section library: the preset may carry `pageBreakpoints` (a map from breakpoint name to root styles), applied to the page root like `page` and merged with the designer's values; in mode `missing` it never overwrites one.

## Send to FormPublisher (0.19.3)

`POST /api/handoff/formpublisher` (optional query `locale`) exports the open site exactly as `GET /api/export` does and posts the zip to FormPublisher's `POST /api/receive/formweb`. The target is found in this order (0.19.4): `FORMWEB_FORMPUBLISHER_URL` when set; the `engine.json` in `FORMPUBLISHER_HOME`, or `~/FormPublisher` when that is unset; then `http://127.0.0.1:8280`. The port in `engine.json` is used only when it is an integer from 1 to 65535 and `GET /api/health` on 127.0.0.1 at that port answers within 1.5 s with `app` equal to `formpublisher`; the host is always loopback. The post carries `Content-Type: application/zip`, `X-FormWeb-Version`, `X-FormWeb-Site-Name` (the site name, URL-encoded) and `X-FormWeb-Project` (the saved project id, URL-encoded), no `Origin` header and an 8 second timeout. A refusal from FormPublisher is returned as status 502 with its message, which names FormPublisher's code in brackets, for example `FormPublisher refused this site [not-a-site]: ...`. When nothing answers, the zip is written atomically (a temporary name, then a rename) into `FORMPUBLISHER_HOME/inbox`, or `~/FormPublisher/inbox`, created if missing, together with `<zip name>.json` holding `{siteName, project, version}` so FormPublisher files it as a revision of the same site when it next runs. The route returns `{delivered: "live", site, revision, warnings, localForms}` or `{delivered: "inbox", path, warnings, localForms}`, where `warnings` is the export's own warning list (0.19.9), the same strings `export_site` gives, and `localForms` (0.21.1) lists, at most 20 times, the name of each page that has a form posting to this computer (empty when there is none); the editor writes the `forms.local-address` sentence for each name in its own language. `GET /api/export` carries the same list in the response header `X-FormWeb-Local-Forms`, percent-encoded JSON, only when it is not empty; the header is exposed to cross-origin readers. The route does not change the site. The File menu item and the command `file.send-formpublisher` call it.

## Project files: .fweb version 2 (0.19.4)

A project whose version 1 JSON envelope would pass 64 MiB downloads as a version 2 file instead; every project that fits still saves as version 1, so older FormWeb and FormPublisher releases keep reading them. Version 2 is a zip. `project.json` is the first entry and holds `{format: "com.nodemode.formweb", version: 2, site, checkpoint?, assets}`, where `assets` lists `{id, mime, name?, license?}` without content. Each asset follows as `assets/<id>`, stored uncompressed. The backend builds the file in `DATA_DIR/tmp` and streams it, then removes it.

`POST /api/load` takes it as `application/zip` (or a body starting with the zip signature) up to 512 MiB, spooled to disk while the bytes are counted, and checks it before anything is stored: `project.json` first and at most 64 MiB, format and version 2, a `site` object, at most 500 assets each listed once, every other member named exactly `assets/<listed id>` with no duplicates and none missing, each asset within its per-type size limit with a SHA-256 that matches its id and the mime type for its extension, then the same ingest checks as version 1. Any failure answers 400 (413 for size) and stores nothing. The File > Import file input sends the file raw. MCP `save_project` and `open_project` stay on version 1.

Since 0.19.5 a version 2 load reads each asset once and keeps the server answering. Validation streams each asset from the zip into a `.stage-*.part` file in the asset folder while it hashes and counts, and restore stores that verified file: assets up to 8 MiB go through ingest as before, and larger ones (video) get the same magic-byte, type and size checks on their first 64 bytes and are renamed into place. Validation and restore run off the event loop, and every staged file is removed on success or failure. A 74 MiB project with two videos loads in about 0.15 s, and `/api/health` answers within a few milliseconds during the load. The checks and error messages are unchanged.

## Element fragments (0.19.5)

The read-only core method `fragment {id}` returns `{format: "com.nodemode.formweb.fragment", version: 1, root, nodes, entries, codeComponents, variables, locales, assets, source}`: the element's subtree, every node-keyed entry it owns (the same list `node.duplicate` and `page.duplicate` copy, including timelines and overlays), the definitions of the code components its instances use, the variables its inputs, outputs and formulas bind, its node-keyed translations, and every `/api/assets` ID it mentions. `source` says where it came from. It refuses a page root, a node inside or holding a linked component instance, and more than 2,000 nodes. `node.paste` takes the result.

Since 0.19.6 a fragment also carries `design: {tokens, textPresets, themes}` and `collections`. The tokens are the design tokens the copied elements use as `var(--name)`, followed through tokens that name other tokens, with every theme value. The text presets are the ones named by their `design.applications` entries. The collections are the ones named by `cms.bindings`, `cms.lists` and repeaters, with at most 500 items; a larger collection travels as its definition and the fragment carries a warning. Paste adds what the site lacks and keeps the site's own on a name clash with a different value, with a warning per clash. Older fragments paste as before. Form configuration travels with the copied form elements. Since 0.19.7 a fragment also carries the collections that carried collections reference, transitively, and the variables that `set-variable` actions name. Past 500 items, a collection travels as its first 500 plus every item a copied binding, list filter or carried reference names; the warning counts the rest. A binding that names an item of a collection cut to its definition is still refused and nothing changes. `design` also carries `fonts`: the site's `design.fonts` faces whose family the copied styles, entries or carried tokens and text presets name, so their `/api/assets` woff2 files travel in `assets` too. When the copied element has no `font-family` of its own, the fragment carries `inheritedFont`, the nearest ancestor's value at the source; paste sets it on the pasted root when the destination would resolve a different one. Paste adds a face the site lacks, skips one it already has, keeps the site's own on an id clash with a different face and stops at 16 faces, with a warning for each face it leaves out.

Since 0.20.3 `POST /api/fragment` adds an optional `ancestors` field: the ids of the copied element's ancestors at the source, nearest first, ids only. A paste adds them to the ids that can have made an ending, so a child of an earlier copy pasted into another site swaps its ending from the first paste (label-copy-1 becomes label-copy-N). The field is read only as an array of at most 256 strings of at most 128 bytes and is ignored otherwise; it cannot add, rename or remove nodes. A fragment without it pastes as before, and a 0.20.2 engine ignores it.

`POST /api/fragment {node}` needs read permission and returns the fragment. `POST /api/paste {fragment, parent?, index?, expectedRevision?}` needs edit permission and runs `node.paste` as one undo step. `fragments` (1 to 64) in place of `fragment` pastes several as one batch; together they hold at most 8,000 nodes (four times the 2,000 of one fragment), and more is refused with "A paste can bring at most 8,000 elements in all. Copy fewer elements at a time." The body is capped at 8 MiB, and the format, version and size are checked. Every asset the fragment names must exist and be visible to the person pasting: for the local owner every asset, otherwise the assets of projects they have a role in and shared team libraries. A missing or invisible asset is named in a 409 and nothing changes; the assets belong to the current project only after the engine accepts the paste. `apply_commands` can reach `node.paste` too, without the asset check.

Between two FormWeb installations (0.19.6): `POST /api/fragment {node, embed: true}` also answers with `embedded` (asset ID to base64, smallest first, up to 16 MiB of raw bytes) and `notEmbedded` (the IDs left out). `POST /api/paste` takes `embedded`, and its body limit is now 32 MiB (it was 8 MiB). An asset this person cannot see is taken from the embedded bytes after the same checks an upload gets (digest equals the ID, magic bytes, size by type, SVG checks) and is then owned by the current project. Without embedded bytes the paste answers 409 naming the asset. Everything is checked before anything is stored.

Clip links (0.19.7): `POST /api/fragment {node, embed: true, clip: true}` keeps the smallest assets inline up to 4 MiB and puts the rest (up to 512 MiB, each within its upload limit) behind `clip: {url, token, ids, expires}`. The link lasts 15 minutes by default (`FORMWEB_CLIP_SECONDS` sets it: a whole number from 10 to 3600, anything else falls back to 900 with one startup log line), lives on this FormWeb at `GET /api/clips/[token]/[asset id]`, and the token is the only credential. `POST /api/paste` accepts `clip` and fetches missing assets only from a loopback address (127.0.0.1, ::1, localhost) with the exact clip path, with the upload checks, before anything is stored. Since 0.20.1 each asset streams into a staged `.stage-*.part` file in the asset folder with a running sha256 and is checked like embedded bytes (digest, the type's size limit, magic bytes, svg checks; files over 8 MiB are judged from their first bytes); the files are stored only after `node.paste` succeeds and every refusal removes them. Since 0.20.2, if the backend is killed mid-paste, the next start removes any such file more than 10 minutes old (see Start-up sweep in the manual's data folder paragraph). If the source is gone the paste answers 409 naming them. Without `clip` nothing changes (inline up to 16 MiB). The editor's Copy and Cut use clips, so a copy with large images or videos pastes in another FormWeb on the same computer while the first one is running; the status says how many assets will only paste on this computer. Images stay limited to 8 MiB and videos to 64 MiB.

## Authoring MCP tools (0.19.3)

The MCP server has 17 authoring tools for the native vocabulary (`copy_element` and `paste_element` joined them in 0.19.5, `library_import_site` later; 104 tools in all), each over the existing routes or engine commands and one undo step. The motion, variables and component tools accept `expected_revision`.

| Tool | Effect | Hints |
| --- | --- | --- |
| `motion_set` | `motion.set` for a kind and element; validated at once | idempotent |
| `motion_remove` | `motion.remove` | destructive, idempotent |
| `motion_track` | `motion.track` on a scene's tracks or distribute list; approval only when it removes a track | destructive |
| `variables_set` | `variables.set` | idempotent |
| `variables_remove` | `variables.remove` | destructive, idempotent |
| `component_build_install` | compiles a page or isolated component through the build pipeline (Node needed) and merges the record into `code.components` | idempotent |
| `component_instance_set` | `code.instance.set` on an element | idempotent |
| `library_list` | the library index, filtered by kind, category and query | read-only, idempotent |
| `library_insert` | `POST /api/library/sections/{id}/insert` with `section`, parent, page, index, field values and `update_components` | |
| `library_apply_preset` | the preset route, mode `all` or `missing` | destructive, idempotent |
| `library_apply_starter` | the starter route | |
| `library_import_html` | `POST /api/library/import-html` | |
| `library_import_site` | `data` (the zip as base64): `action` `review` (default) is `POST /api/library/import-site/review`; `import` is `POST /api/library/import-site` with `mode` `new` or `replace` and the review's revision as `expected_revision`, the name the other tools use (the older `revision` is still accepted; `expected_revision` wins when both are given) | destructive; approval only for an import with mode `replace` |
| `send_to_formpublisher` | `POST /api/handoff/formpublisher` | does not change the site |
| `new_site` | replaces the open site with a blank home page (`blank` true, the default) or the sample site, as File > New does | destructive, approval-gated |
| `copy_element` | `POST /api/fragment` for `node` (0.19.5); returns the fragment JSON; `embed_assets` (default false, 0.19.6) adds `embedded` and `notEmbedded`; `clip` (default false, 0.19.8, needs `embed_assets`, else 400) keeps 4 MiB inline and puts larger assets behind the loopback clip link (15 minutes by default) in `fragment.clip`; one clip serves any number of pastes, into one installation or several, until it expires, then answers 404 (0.19.9) | read-only, idempotent |
| `paste_element` | `POST /api/paste` with `fragment`, `parent`, `index` and `expected_revision` (0.19.5); a missing asset is a tool error naming it; passes `embedded` through (0.19.6) and `clip` (0.19.8; a stopped source or expired link answers 409 naming the assets) | |

The tool set is also reachable with `apply_commands` and the REST routes on servers that predate them.
