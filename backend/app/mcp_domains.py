"""Agent-readable MCP surface: domain tools generated from the engine catalogue, compact results,
outline resources and workflow prompts. Kept apart from mcp_catalog so the generic tools stay stable.

Limits observed in client documentation (fetched 2026-10-11, see the release sidecar):
- Claude Code truncates server instructions and each tool description at 2,048 characters, warns above
  10,000 output tokens and saves results above 25,000 tokens or 50,000 characters to a file.
- Codex applies tool_timeout_sec (default 60 s; FormWeb's project file sets 120 s).
- Cursor documents no tool-count limit.
So: instructions stay short with the essentials first, edits return a compact summary by default, and
the full site is opt-in.
"""
from typing import Any

from .mcp_catalog import REVISION, schema

INSTRUCTIONS = (
    'FormWeb is a local visual website builder. Use these tools to read, edit, check, save, export and publish '
    'the site that is open in the FormWeb editor; the person sees every change live and can undo it.\n'
    'Start: read formweb://site/tree (page and element outline with IDs) or call get_site with detail "summary". '
    'Edit with the domain tools (edit_nodes, edit_pages, edit_styles, edit_components, edit_cms, edit_locales, edit_site, edit_creative) '
    'or apply_commands for a multi-command batch. Pass expected_revision from your last read; on a revision conflict, '
    're-read and apply only what is still needed. Edits return a compact summary; pass detail "site" only when you need the whole document.\n'
    'Brand: style with var(--brand-...) or a linked team library\'s var(--lib-...) tokens (list_team_libraries, use_team_library); run brand_check before delivery.\n'
    'AI (the person\'s models, set in formvis): generate_site plan (with references, or plan+instruction to revise), show it, then build; write_copy returns a suggestion to show before applying.\n'
    'Check: audit_site, then compile_preview or export_site. Deliver: save_project, export_site, publish_site (local only, not hosting).\n'
    'formweb://selection is what the person has selected in the editor. A call may wait for the person to approve it in '
    'Agent Connect; if it is denied or times out, ask before retrying.\n'
    'Workflow guide: the formweb-harness skill (.claude/skills/formweb-harness, start at sub-skills/harness-director). '
    'Prompts: build_page, edit_copy, responsive_review, publish_site, recover_session.'
)

# Parameter signatures, taken from the engine match arms (native/crates/formweb-engine) and docs/ADVANCED_SCHEMA.md.
COMMAND_DOCS = {
    'node.add': '{parent, node:{id?, tag, name, text, attrs, styles, breakpoints, children:[]}} appends a new element to parent',
    'node.update': '{id, patch:{tag?, text?, attrs?, styles?, breakpoints?, interactions?, binding?}} merges keys; null removes one',
    'node.remove': '{id} removes the element and its subtree',
    'node.move': '{id, parent, index?} reparents or reorders',
    'page.add': '{name, slug, id?, root?} creates a page with its own root; pass new ids to fill the root in the same batch',
    'page.update': '{id, patch:{name?, slug?, seo?}}',
    'page.remove': '{id}',
    'page.duplicate': '{id, name?, slug} copies the whole page tree with fresh IDs',
    'page.bulk': '{template, rows:[{slug, name?, values:{column:value}}]} 1 to 300 pages from a template; {{column}} tokens in text, attributes and SEO are filled',
    'token.set': '{name, value} sets a CSS custom property',
    'token.define': '{name, type: color|number|length|text, value} typed design token',
    'textpreset.set': '{name, styles} defines a reusable text style',
    'textpreset.apply': '{id, name} applies a text style to an element',
    'breakpoint.set': '{id, name, maxWidth} creates or updates a breakpoint; exported as a CSS max-width media query, so the browser switches it at that width (the editor canvas shows only the breakpoint the person picked)',
    'breakpoint.remove': '{id} removes the breakpoint and its style overrides',
    'component.create': '{name, root, id?} makes a reusable component from an element',
    'component.insert': '{component, parent} inserts a linked instance',
    'component.configure': '{component, definition} typed props, variants and slots',
    'component.props': '{id, props} sets instance props; null removes one',
    'component.variant': '{id, variant|null}',
    'component.reset': '{id, fields?} clears local overrides',
    'component.slot': '{id, slot, nodes:[nodeId]}',
    'component.detach': '{id} keeps the elements, drops the link',
    'library.import': '{id, name, version, site, parent, components?}',
    'library.update': '{id, version, site}',
    'library.detach': '{id}',
    'collection.create': '{name, fields, id?} new CMS collection',
    'collection.update': '{id, patch:{name?, fields?}}',
    'cms.upsert': '{collection, item} adds or replaces one item',
    'cms.remove': '{collection, id}',
    'cms.replace': '{collection, items} replaces all items atomically',
    'cms.query': '{node, query} list query for a repeating element; inside another list a filter value of "{parent.field}" (for example {"field":"maker","op":"eq","value":"{parent.id}"}) is replaced by that field of the enclosing item, so a nested list shows only the items related to its parent',
    'cms.binding': '{node, binding} binds text, href or src to a field',
    'cms.localize': '{collection, item, locale, values, slug?, status?}',
    'locale.set': '{locale, translations:{key:text}}',
    'site.update': '{patch:{name?, settings?, defaultLocale?, locales?}} settings include hideScrollbars, favicon, faviconDark',
    'site.replace': '{site} replaces the whole document (use sparingly)',
    'extension.set': '{group, value} replaces one validated extension group',
    'extension.remove': '{group}',
    'cms.list': '{node, patch:{facets?, sortOptions?, slider?, pageSize?, filter?, sort?, limit?}} merges keys into the list config; null removes one. facets [{key, field, kind: checkbox|select|search|range, label}] and sortOptions [{key, field, direction, label}] become live filter and sort controls on the published list, with state in the URL; slider {perView, arrows, dots, autoplay, interval, loop, label, gap} turns the list into a slider (not combinable with facets)',
    'cms.reorder': '{collection, ids:[itemId]} sets the manual item order; ids must list every item once',
    'cms.move': '{collection, id, index} moves one item to a position',
    'cms.folder': '{id, name?, collections?:[collectionId], remove?} creates or updates a collection folder; a collection lives in one folder',
    'slider.create': '{parent, collection, perView?, index?} inserts a slide card bound to the collection plus its slider list config',
    'table.insert': '{parent, rows?, cols?, header?, caption?, index?} inserts a semantic table (caption, thead with th scope col, tbody)',
    'table.row.add': '{table, index?} adds a body row before the row at index (all rows count), or at the end',
    'table.row.remove': '{table, index}',
    'table.col.add': '{table, index?} adds a column of cells before index, or at the end; regular tables without merged cells',
    'table.col.remove': '{table, index}',
    'layout.convert': '{id, mode: flex|grid, direction?, columns?, gap?, padding?} sets display, gap and padding, defaulting to the site settings layoutGap, layoutPadding and layoutColumns',
    'text.script': '{id, mode?: super|sub|none|keep, shift?: "-0.2em"|null, trueGlyphs?} makes a span a real sup or sub element and sets a baseline shift (vertical-align)',
    'form.steps': '{form, steps:[{title, nodes:[childId]}]} groups direct children of a form into steps (Back, Next, per-step validation); steps [] removes them',
}

DOMAINS = [
    ('edit_nodes', 'Edit elements', 'Add, change, move or remove elements (sections, text, images, buttons, forms) on a page. Use for most visual edits.', ['node.add', 'node.update', 'node.move', 'node.remove']),
    ('edit_pages', 'Edit pages', 'Create, rename, re-slug, duplicate, bulk-create from data, or remove pages, and set page SEO.', ['page.add', 'page.update', 'page.duplicate', 'page.bulk', 'page.remove']),
    ('edit_styles', 'Edit design system', 'Change design tokens, text presets and responsive breakpoints shared across the site.', ['token.set', 'token.define', 'textpreset.set', 'textpreset.apply', 'breakpoint.set', 'breakpoint.remove']),
    ('edit_components', 'Edit components', 'Create reusable components, insert linked instances, set props, variants and slots, or work with pinned libraries.', ['component.create', 'component.insert', 'component.configure', 'component.props', 'component.variant', 'component.reset', 'component.slot', 'component.detach', 'library.import', 'library.update', 'library.detach']),
    ('edit_cms', 'Edit CMS', 'Create collections, add or replace items, bind elements to fields and set list queries for dynamic pages.', ['collection.create', 'collection.update', 'cms.upsert', 'cms.remove', 'cms.replace', 'cms.query', 'cms.binding', 'cms.localize', 'cms.list', 'cms.reorder', 'cms.move', 'cms.folder']),
    ('edit_locales', 'Edit translations', 'Set translated text for a locale.', ['locale.set']),
    ('edit_site', 'Edit site settings', 'Change site name, locales and settings (icons, hidden scrollbars), or replace extension groups.', ['site.update', 'extension.set', 'extension.remove', 'site.replace']),
    ('edit_creative', 'Edit tables, sliders, layout and forms', 'Insert and edit semantic tables, CMS sliders, flex or grid layout with site defaults, superscript and subscript, and multi-step forms.', ['table.insert', 'table.row.add', 'table.row.remove', 'table.col.add', 'table.col.remove', 'slider.create', 'layout.convert', 'text.script', 'form.steps']),
]

DETAIL = {'type': 'string', 'enum': ['summary', 'site'], 'default': 'summary', 'description': 'summary (default) returns revision, undo state and an outline of pages; site returns the whole document.'}

SUMMARY_SCHEMA = {
    'type': 'object',
    'properties': {
        'revision': {'type': 'integer'},
        'canUndo': {'type': 'boolean'},
        'canRedo': {'type': 'boolean'},
        'site': {'type': 'object'},
    },
    'required': ['revision'],
}


def domain_tools():
    tools = []
    for name, title, intro, commands in DOMAINS:
        lines = '\n'.join(f'- {command} {COMMAND_DOCS[command]}' for command in commands)
        description = f'{intro} One command per call, applied as one undo step.\n{lines}'
        removes = any(command.endswith('.remove') or command == 'site.replace' for command in commands)
        tools.append({
            'name': name,
            'title': title,
            'description': description[:2000],
            'inputSchema': schema({'command': {'type': 'string', 'enum': commands}, 'params': {'type': 'object', 'description': 'Parameters for the command, as listed in the description.'}, 'expected_revision': REVISION, 'detail': DETAIL}, ['command', 'params']),
            'outputSchema': SUMMARY_SCHEMA,
            'annotations': {'title': title, 'readOnlyHint': False, 'destructiveHint': removes, 'idempotentHint': False, 'openWorldHint': False},
        })
    return tools


DOMAIN_TOOLS = domain_tools()
DOMAIN_BY_NAME = {tool['name']: tool for tool in DOMAIN_TOOLS}


def compact(state: dict[str, Any]) -> dict[str, Any]:
    """A few hundred bytes instead of the whole document: what an agent needs to continue."""
    site = state.get('site', {})
    nodes = site.get('nodes', {})
    return {
        'revision': state.get('revision'),
        'canUndo': state.get('canUndo'),
        'canRedo': state.get('canRedo'),
        'site': {
            'id': site.get('id'), 'name': site.get('name'),
            'defaultLocale': site.get('defaultLocale'), 'locales': sorted((site.get('locales') or {}).keys()),
            'nodeCount': len(nodes),
            'pages': [{'id': page['id'], 'name': page['name'], 'slug': page['slug'], 'root': page['root']} for page in site.get('pages', [])],
            'components': [{'id': key, 'name': value.get('name')} for key, value in (site.get('components') or {}).items()],
            'collections': sorted((site.get('collections') or {}).keys()),
            'breakpoints': [item.get('id') for item in site.get('breakpoints', [])],
            'settings': site.get('settings', {}),
        },
        'next': 'Read formweb://site/tree for element IDs, or call get_site with detail "full" for styles and attributes.',
    }


def tree(state: dict[str, Any], max_text: int = 48) -> dict[str, Any]:
    """Indented outline per page: one line per element with id, tag, name and a text excerpt."""
    site = state.get('site', {})
    nodes = site.get('nodes', {})
    pages = []
    for page in site.get('pages', []):
        lines: list[str] = []
        stack = [(page['root'], 0)]
        while stack and len(lines) < 2000:
            node_id, depth = stack.pop()
            node = nodes.get(node_id)
            if not node:
                continue
            excerpt = (node.get('text') or '').strip().replace('\n', ' ')
            excerpt = f' "{excerpt[:max_text]}{"..." if len(excerpt) > max_text else ""}"' if excerpt else ''
            extra = ' [component]' if node.get('componentId') else ''
            lines.append(f'{"  " * depth}{node_id} <{node.get("tag")}> {node.get("name", "")}{excerpt}{extra}')
            for child in reversed(node.get('children', [])):
                stack.append((child, depth + 1))
        pages.append({'id': page['id'], 'name': page['name'], 'slug': page['slug'], 'outline': '\n'.join(lines)})
    return {'revision': state.get('revision'), 'pages': pages}


def tokens(state: dict[str, Any]) -> dict[str, Any]:
    site = state.get('site', {})
    design = (site.get('extensions') or {}).get('design') or {}
    typed = design.get('tokens', {})
    settings = site.get('settings', {})
    # Brand kit (FW-066): brand-[name] color tokens, brand-font-[name] text tokens, brandLogo and brandLogoDark settings.
    brand = {
        'colors': {name: item.get('value') for name, item in typed.items() if name.startswith('brand-') and not name.startswith('brand-font-') and item.get('type') == 'color'},
        'fonts': {name: item.get('value') for name, item in typed.items() if name.startswith('brand-font-') and item.get('type') == 'text'},
        'logo': settings.get('brandLogo'), 'logoDark': settings.get('brandLogoDark'),
        'use': 'Style values var(--brand-[name]); add with edit_styles token.define {name: "brand-[name]", type: "color", value}.',
    }
    return {'revision': state.get('revision'), 'brand': brand, 'tokens': site.get('tokens', {}), 'typedTokens': typed, 'textPresets': design.get('textPresets', {}), 'breakpoints': site.get('breakpoints', [])}


PROMPTS = {
    'build_page': {
        'title': 'Build a page',
        'description': 'Plan and build a responsive page in the open FormWeb site from a short brief.',
        'arguments': [{'name': 'brief', 'description': 'What the page is for and what it should contain', 'required': True}, {'name': 'slug', 'description': 'URL path, for example /about', 'required': False}],
        'text': 'In FormWeb, build a page for this brief: {brief}. Target slug: {slug}.\n1. Read formweb://site/tree and formweb://tokens; reuse existing sections, components and tokens.\n2. Create the page with edit_pages page.add (or page.duplicate from a similar page).\n3. Add sections and content with edit_nodes; keep semantic tags (header, section, h1/h2, p, a, img with alt).\n4. Add tablet and mobile overrides in node breakpoints where layout should change.\n5. Run audit_site and fix what it reports. Summarize what you built and the page URL path.',
    },
    'edit_copy': {
        'title': 'Edit copy',
        'description': 'Rewrite text on the open site (selection, a page, or everything) in a given voice.',
        'arguments': [{'name': 'instruction', 'description': 'How the copy should change', 'required': True}, {'name': 'scope', 'description': 'selection, a page slug, or site', 'required': False}],
        'text': 'In FormWeb, change the copy: {instruction}. Scope: {scope}.\n1. If the scope is selection, read formweb://selection; otherwise read formweb://site/tree for the scope.\n2. Change only text with edit_nodes node.update patch.text, one element per call or one apply_commands batch.\n3. Keep headings short, keep links and button labels meaningful. Report each changed element ID with before and after.',
    },
    'responsive_review': {
        'title': 'Responsive review',
        'description': 'Check a page at desktop, tablet and mobile widths and fix layout problems.',
        'arguments': [{'name': 'page', 'description': 'Page slug or ID; default is the home page', 'required': False}],
        'text': 'In FormWeb, review page {page} at desktop, tablet and mobile.\n1. Read formweb://site/tree and get_site detail full for the page nodes.\n2. Look for fixed widths, rows that should stack, oversized type and missing gaps on small screens.\n3. Fix with edit_nodes node.update breakpoints overrides (tablet, mobile) rather than changing desktop styles.\n4. compile_preview and report what you changed per breakpoint.',
    },
    'publish_site': {
        'title': 'Check and publish',
        'description': 'Audit, save, export and publish the open site locally.',
        'arguments': [{'name': 'slug', 'description': 'Publication slug, lowercase letters, numbers and hyphens', 'required': False}],
        'text': 'In FormWeb, prepare and publish the site (slug: {slug}).\n1. audit_site; fix errors or list the ones left.\n2. save_project, then export_site and confirm the manifest.\n3. publish_site; if publish review is on, a promotion waits for a reviewer in Agent Connect. Report the local URL and version. Local publication is not hosting.',
    },
    'recover_session': {
        'title': 'Recover a stopped task',
        'description': 'Find out what happened after an error, conflict, denial or timeout, and resume safely.',
        'arguments': [{'name': 'error', 'description': 'The error or symptom you saw', 'required': False}],
        'text': 'In FormWeb, recover from: {error}.\n1. Call get_site detail summary and compare the revision with your last one.\n2. Read formweb://activity to see what was applied and by whom (human, agent, terminal).\n3. If a call was denied or timed out waiting for approval, ask the person before retrying.\n4. Re-apply only the steps that did not land, with the fresh expected_revision. Do not replay successful steps.',
    },
}
