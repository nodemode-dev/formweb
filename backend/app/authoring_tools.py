"""MCP tools for motion, variables, page components, the section library and the FormPublisher hand-off (TURN_D_SPEC
Phase 10, D1). Each tool is a thin layer over an engine command or an existing HTTP route, so one call is one undo
step and the rules (validation, permissions, attribution) are the same as in the editor.

Annotations follow the MCP meaning: readOnlyHint false for anything that changes the site; destructiveHint only where
a call deletes or overwrites what a person may have made (removals, a preset applied over existing values);
idempotentHint where repeating the same call leaves the same result."""
import asyncio
import json
import urllib.error
import urllib.request

from .config import AUTH_TOKEN, PORT
from .engine import EngineError
from .mcp_catalog import REVISION, tool
from .mcp_domains import compact
from .service import studio

NODE = {'type': 'string', 'minLength': 1, 'maxLength': 160}
IDENT = {'type': 'string', 'pattern': '^[A-Za-z0-9_-]{1,96}$'}
MOTION_KINDS = ['reveals', 'scenes', 'loops', 'counters', 'text', 'drag', 'pointer', 'disclosure', 'actions', 'scripts']
VARIABLE_KINDS = ['values', 'tables', 'formulas', 'inputs', 'outputs']
FIELD_VALUES = {'type': 'object', 'description': 'Field values to re-cast the template (see library_list: each section lists its fields with type and default). Omitted fields keep the template default.'}

AUTHORING_TOOLS = [
    tool('motion_set', 'Upsert one native motion entry on an element: kind is reveals, scenes, loops, counters, text, drag, pointer, disclosure, actions or scripts, value the entry (shapes: docs/ADVANCED_SCHEMA.md, "motion"). The entry is validated at once; a bad value fails and changes nothing. One undo step. Prefer this over a code section for scroll reveals, pinned scroll scenes, loops, counters, tilt, accordions and click scripts.',
         {'kind': {'type': 'string', 'enum': MOTION_KINDS}, 'node': NODE, 'value': {'type': 'object'}, 'expected_revision': REVISION}, ['kind', 'node', 'value'], idempotent=True),
    tool('motion_remove', 'Delete one motion entry (kind and element). Removing the last entry clears the motion group. One undo step.',
         {'kind': {'type': 'string', 'enum': MOTION_KINDS}, 'node': NODE, 'expected_revision': REVISION}, ['kind', 'node'], destructive=True, idempotent=True),
    tool('motion_track', 'Edit one entry of a scene\'s tracks (default) or distribute list without replacing the scene: index 0 to the list length; an object replaces the entry or appends when index equals the length; track null removes it. The whole scene is validated afterwards; a failing change leaves the site untouched.',
         {'scene': NODE, 'list': {'type': 'string', 'enum': ['tracks', 'distribute'], 'default': 'tracks'}, 'index': {'type': 'integer', 'minimum': 0}, 'track': {'type': ['object', 'null']}, 'expected_revision': REVISION}, ['scene', 'index', 'track'], destructive=True),
    tool('variables_set', 'Upsert one entry of the site\'s variables: kind values (name, value), tables, formulas (an expression), inputs or outputs (name is the element ID, value binds it). The resulting group is validated; a failure changes nothing. One undo step.',
         {'kind': {'type': 'string', 'enum': VARIABLE_KINDS}, 'name': NODE, 'value': {}, 'expected_revision': REVISION}, ['kind', 'name', 'value'], idempotent=True),
    tool('variables_remove', 'Delete one variables entry. Removing a value or formula that another entry still uses fails and changes nothing.',
         {'kind': {'type': 'string', 'enum': VARIABLE_KINDS}, 'name': NODE, 'expected_revision': REVISION}, ['kind', 'name'], destructive=True, idempotent=True),
    tool('component_build_install', 'Compile a page or isolated code component (JavaScript or TypeScript, with real compiler diagnostics) and merge the built record into the site\'s code components under id, in one undo step. Page mode exports mount(root, props, ctx). Then place it with component_instance_set. Needs Node (./formweb install).',
         {'id': IDENT, 'language': {'type': 'string', 'enum': ['typescript', 'javascript']}, 'source': {'type': 'string', 'maxLength': 262144}, 'props': {'type': 'object'}, 'mode': {'type': 'string', 'enum': ['isolated', 'page'], 'default': 'page'}, 'poster': {'type': 'string', 'maxLength': 200}, 'posterLight': {'type': 'string', 'maxLength': 200}}, ['id', 'language', 'source'], idempotent=True),
    tool('component_instance_set', 'Place or update a built code component on an element: node gets {component, props}, validated against the component\'s declared props. One undo step.',
         {'node': NODE, 'component': IDENT, 'props': {'type': 'object'}, 'expected_revision': REVISION}, ['node', 'component'], idempotent=True),
    tool('library_list', 'List the first-party section library: sections (id, name, category, tags, fields to re-cast, page components, preset), page components, design-system presets and starter sites. Filter with kind, category and query. Read-only; use before library_insert to pick an id and its fields.',
         {'kind': {'type': 'string', 'enum': ['sections', 'components', 'presets', 'starters']}, 'category': {'type': 'string', 'maxLength': 60}, 'query': {'type': 'string', 'maxLength': 120}}, read_only=True, idempotent=True),
    tool('library_insert', 'Insert one library section as ordinary elements, re-cast with field values (for example the product name and accent colour), under parent on page. Installs the page components and design values it needs, without overwriting the designer\'s own tokens. One undo step; two inserts keep independent ids and variables. Returns the new root id and warnings.',
         {'section': IDENT, 'values': FIELD_VALUES, 'parent': NODE, 'page': NODE, 'index': {'type': 'integer', 'minimum': 0}, 'update_components': {'type': 'boolean', 'default': False}}, ['section']),
    tool('library_apply_preset', 'Apply a design-system preset (tokens, themes, fonts, text presets, page styles). mode "all" (default) replaces every value the preset defines; "missing" only adds what the site lacks. One undo step.',
         {'preset': IDENT, 'mode': {'type': 'string', 'enum': ['all', 'missing'], 'default': 'all'}, 'page': NODE}, ['preset'], destructive=True, idempotent=True),
    tool('library_apply_starter', 'Build a starter site: its pages and sections, re-cast with field values shared across the sections that own them. An empty single page is reused for the first starter page. One undo step.',
         {'starter': IDENT, 'values': FIELD_VALUES, 'update_components': {'type': 'boolean', 'default': False}}, ['starter']),
    tool('library_import_html', 'Import a finished HTML page as one code section: style tags become its css, the first inline script its js, the body markup its html. Allows code sections on the site. One undo step; the result runs in the exported site, not on the canvas.',
         {'html': {'type': 'string', 'minLength': 1, 'maxLength': 1048576}, 'css': {'type': 'string', 'maxLength': 262144}, 'name': {'type': 'string', 'maxLength': 120}, 'parent': NODE, 'page': NODE, 'index': {'type': 'integer', 'minimum': 0}}, ['html']),
    tool('send_to_formpublisher', 'Send the open site to FormPublisher on this computer, as File > Send to FormPublisher does: delivered "live" when FormPublisher is running (returns its site id and revision), or "inbox" with the path of the zip it will import next time it runs. Also returns warnings: the export\'s own warning strings, the same as export_site gives. Does not change the site.',
         {'locale': {'type': 'string', 'maxLength': 40}}),
    tool('new_site', 'Replace the open site with a new one, as File > New does: blank true (default) gives one empty home page to assemble from library sections; blank false gives the sample site. The replaced site stays in autosave and saved projects. Save it first with save_project if it matters.',
         {'name': {'type': 'string', 'minLength': 1, 'maxLength': 120}, 'blank': {'type': 'boolean'}}, ['name'], destructive=True),
    tool('copy_element', 'Copy one element and everything under it as a fragment: the subtree, its motion, code and variables entries, the page components it uses and the assets it names. Read-only; the fragment is plain JSON you can keep and give to paste_element, in this site or in another site open on this FormWeb. Refuses a page root, a node inside a linked component instance and subtrees over 2,000 nodes. With embed_assets true the result also carries embedded (asset id to base64 bytes, smallest first, up to 16 MiB of raw bytes) and notEmbedded (the ids that did not fit), so the fragment can be pasted into another FormWeb; leave it off for a paste on this FormWeb. With clip true (needs embed_assets) only 4 MiB rides inline and larger assets, up to 512 MiB in all, wait behind a clip link in fragment.clip ({url, token, ids, expires}) that stays valid for 15 minutes and works only between two FormWebs on the same computer while this one keeps running.',
         {'node': NODE, 'embed_assets': {'type': 'boolean', 'description': 'Carry the assets\' bytes in the result. Default false.'}, 'clip': {'type': 'boolean', 'description': 'With embed_assets, keep the result small: assets beyond 4 MiB sit behind a clip link. Default false; refused (400) without embed_assets.'}}, ['node'], read_only=True, idempotent=True),
    tool('paste_element', 'Paste a fragment from copy_element under parent (an element ID; default: the first page\'s root) at index (default: last), with fresh element IDs, so pass the parent of the page you are working on. Every asset the fragment names must exist on this FormWeb; missing ones are listed (409) unless embedded carries their bytes, which are checked like an upload and then owned by this project; nothing changes on any refusal. A clip link (the clip the fragment carries, or the clip argument) lets the paste fetch the larger assets from the FormWeb that made the copy; it works only between two FormWebs on the same computer for 15 minutes, and if the source is stopped or the link expired the paste answers 409 naming the missing assets and stores nothing. Adds the code components the site lacks. One undo step. Refuses another format or version, more than 2,000 nodes and bodies over 32 MiB.',
         {'fragment': {'type': 'object', 'description': 'The object copy_element returned, unchanged.'}, 'embedded': {'type': 'object', 'description': 'The embedded map copy_element returned with embed_assets, if any.'}, 'clip': {'type': 'object', 'description': 'The clip link ({url, token, ids, expires}) from copy_element with clip, if the fragment no longer carries it.'}, 'parent': NODE, 'index': {'type': 'integer', 'minimum': 0}, 'expected_revision': REVISION}, ['fragment']),
]
AUTHORING_BY_NAME = {item['name']: item for item in AUTHORING_TOOLS}


class JsonBody:
    """Stands in for the request the library routes read, so their code runs unchanged from a tool call."""

    def __init__(self, data: dict):
        self.data = json.dumps(data).encode()

    async def body(self):
        return self.data

    async def json(self):
        return json.loads(self.data)


def _state(result, extra=None):
    if isinstance(result, dict) and 'site' in result:
        return {**compact(result), **(extra or {})}
    return {**(result if isinstance(result, dict) else {}), **(extra or {})}


def _drop(arguments, *keys):
    return {key: value for key, value in arguments.items() if key not in keys and value is not None}


async def _command(command, params, arguments):
    return compact(await studio.substrates.active.dispatch(command, params, arguments.get('expected_revision')))


def _listing(arguments):
    from . import library
    data = library.index()
    kind, category, query = arguments.get('kind'), arguments.get('category'), (arguments.get('query') or '').lower().strip()

    def matches(item):
        if category and item.get('category') != category:
            return False
        text = ' '.join(str(item.get(key) or '') for key in ('id', 'name', 'description', 'category')) + ' ' + ' '.join(map(str, item.get('tags') or []))
        return not query or all(word in text.lower() for word in query.split())

    result = {key: [item for item in data[key] if matches(item)] for key in ('sections', 'components', 'presets', 'starters') if not kind or key == kind}
    if not kind or kind == 'sections':
        result['categories'] = data['categories']
    return result


def _send(locale):
    url = f'http://127.0.0.1:{PORT}/api/handoff/formpublisher' + (f'?locale={urllib.request.quote(locale)}' if locale else '')
    headers = {'X-FormWeb-Channel': 'agent', 'Content-Type': 'application/json'}
    if AUTH_TOKEN:
        headers['Authorization'] = 'Bearer ' + AUTH_TOKEN
    request = urllib.request.Request(url, data=b'{}', headers=headers, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read()).get('detail', error.reason)
        except ValueError:
            detail = error.reason
        raise EngineError(str(detail), error.code)
    except (urllib.error.URLError, OSError) as error:
        raise EngineError(f'Could not reach the FormWeb hand-off route: {error}', 502)


async def dispatch(name, arguments):
    from . import library, library_routes
    from .code_components import build_component
    if name == 'motion_set':
        return await _command('motion.set', {key: arguments[key] for key in ('kind', 'node', 'value')}, arguments)
    if name == 'motion_remove':
        return await _command('motion.remove', {key: arguments[key] for key in ('kind', 'node')}, arguments)
    if name == 'motion_track':
        return await _command('motion.track', {'scene': arguments['scene'], 'list': arguments.get('list', 'tracks'), 'index': arguments['index'], 'track': arguments['track']}, arguments)
    if name == 'variables_set':
        return await _command('variables.set', {key: arguments[key] for key in ('kind', 'name', 'value')}, arguments)
    if name == 'variables_remove':
        return await _command('variables.remove', {key: arguments[key] for key in ('kind', 'name')}, arguments)
    if name == 'component_instance_set':
        return await _command('code.instance.set', {'node': arguments['node'], 'value': {'component': arguments['component'], 'props': arguments.get('props') or {}}}, arguments)
    if name == 'component_build_install':
        studio.access.authorize('edit')
        built = await build_component({'enabled': True, 'language': arguments['language'], 'source': arguments['source'], 'props': arguments.get('props') or {}, 'mode': arguments.get('mode', 'page'), **({'poster': arguments['poster']} if arguments.get('poster') else {}), **({'posterLight': arguments['posterLight']} if arguments.get('posterLight') else {})})
        record = built['component']
        studio.access.record('code.build', {'language': arguments['language'], 'digest': record.get('sourceDigest')})
        state = await studio.state()
        group = library.component_group(state['site'], {arguments['id']: record})
        if group is None:
            return {'changed': False, 'component': arguments['id'], 'sourceDigest': record.get('sourceDigest'), 'revision': state['revision']}
        result = await studio.mutate('exec', {'command': 'extension.set', 'params': {'group': 'code', 'value': group}, 'expectedRevision': state['revision']})
        return _state(result, {'changed': True, 'component': arguments['id'], 'sourceDigest': record.get('sourceDigest')})
    if name == 'library_list':
        studio.access.authorize('read')
        return _listing(arguments)
    if name == 'library_insert':
        body = {'values': arguments.get('values') or {}, 'updateComponents': arguments.get('update_components', False), **{k: arguments[k] for k in ('parent', 'page', 'index') if k in arguments}}
        result = await library_routes.library_insert(arguments['section'], JsonBody(body))
        return _state(result, {'root': result.get('root'), 'warnings': result.get('warnings', [])})
    if name == 'library_apply_preset':
        result = await library_routes.library_apply_preset(arguments['preset'], JsonBody(_drop(arguments, 'preset')))
        return _state(result, {'changed': result.get('changed')})
    if name == 'library_apply_starter':
        body = {'values': arguments.get('values') or {}, 'updateComponents': arguments.get('update_components', False)}
        result = await library_routes.library_apply_starter(arguments['starter'], JsonBody(body))
        return _state(result, {'pages': result.get('pages'), 'warnings': result.get('warnings', [])})
    if name == 'library_import_html':
        result = await library_routes.library_import_html(JsonBody(_drop(arguments)))
        return _state(result, {'root': result.get('root'), 'warnings': result.get('warnings', [])})
    if name == 'send_to_formpublisher':
        studio.access.authorize('read')
        return await asyncio.to_thread(_send, arguments.get('locale'))
    if name == 'copy_element':
        from .fragment_routes import fragment_of
        if arguments.get('clip') is True and arguments.get('embed_assets') is not True:
            raise EngineError('clip needs embed_assets set to true.', 400)
        if arguments.get('clip') is True:
            return await fragment_of(arguments['node'], True, True)
        return await fragment_of(arguments['node'], arguments.get('embed_assets') is True)
    if name == 'paste_element':
        from .fragment_routes import paste_body
        body = {'fragment': arguments['fragment'], **{k: arguments[k] for k in ('parent', 'index', 'embedded', 'clip') if arguments.get(k) is not None}}
        if arguments.get('expected_revision') is not None:
            body['expectedRevision'] = arguments['expected_revision']
        return _state(await paste_body(body))
    if name == 'new_site':
        result = await studio.mutate('new', {'name': str(arguments['name']), 'blank': arguments.get('blank', True) is not False})
        return _state(result, {'blank': arguments.get('blank', True) is not False})
    raise EngineError('Unknown tool.', 404)
