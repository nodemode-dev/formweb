import json

from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.transport_security import TransportSecuritySettings

from contextlib import asynccontextmanager
from urllib.parse import quote
from jsonschema import Draft202012Validator

from . import claude_code
from .access import actor
from .advanced_catalog import ADVANCED_BY_NAME, ADVANCED_TOOLS
from .config import ORIGINS, PORT, VERSION
from .engine import EngineError
from .mcp_catalog import TOOLS as BASE_TOOLS
from .mcp_domains import COMMAND_DOCS, DOMAIN_BY_NAME, DOMAIN_TOOLS, INSTRUCTIONS, PROMPTS, compact, tokens, tree
from .providers.catalog import PROVIDER_BY_NAME, PROVIDER_TOOLS
from .providers.service import dispatch_tool as provider_dispatch
from .service import studio
from .workflows import dispatch as workflow_dispatch

TOOLS = BASE_TOOLS[:3] + DOMAIN_TOOLS + BASE_TOOLS[3:] + ADVANCED_TOOLS + PROVIDER_TOOLS
BY_NAME = {item['name']: item for item in TOOLS}
# Loaded upfront by Claude Code even with tool search on (code.claude.com/docs/en/mcp, "anthropic/alwaysLoad").
ALWAYS_LOAD = {'get_site', 'apply_commands', 'edit_nodes'}
CLIENT_HEADER = 'x-formweb-client'


def title_of(item):
    return item.get('title') or item['name'].replace('_', ' ').capitalize().replace('Cms', 'CMS').replace('Csv', 'CSV')


def listed(item):
    entry = {**item, 'title': title_of(item)}
    entry['annotations'] = {**item['annotations'], 'title': title_of(item)}
    if item['name'] in ALWAYS_LOAD:
        entry['_meta'] = {'anthropic/alwaysLoad': True}
    return types.Tool.model_validate(entry)


@asynccontextmanager
async def request_actor(context):
    headers = getattr(context.request, 'headers', None)
    if headers is None:
        raise EngineError('FormWeb MCP requires its authenticated shared HTTP service.', 401)
    identity = studio.access.authenticate(headers, mcp=True)
    token = actor.set(identity)
    try:
        yield
    finally:
        actor.reset(token)


def caller(context):
    headers = getattr(context.request, 'headers', None) or {}
    own = claude_code.tab_name(headers.get(claude_code.INAPP_HEADER.lower(), ''))
    if own:
        return {'agent': own, 'inApp': True}
    named = (headers.get(CLIENT_HEADER) or headers.get('user-agent', '').split('/', 1)[0]).strip()[:60]
    return {'agent': named if named.isprintable() else '', 'inApp': False}


async def list_tools(context, params):
    return types.ListToolsResult(tools=[listed(item) for item in TOOLS])


async def call_tool(context, params):
    arguments = params.arguments or {}
    try:
        if not studio.agents_enabled:
            raise EngineError('Agents are disabled. Enable Agents in FormWeb or set FORMWEB_AGENTS=1.', 403)
        if params.name not in BY_NAME:
            raise EngineError('Unknown tool.', 404)
        errors = list(Draft202012Validator(BY_NAME[params.name]['inputSchema']).iter_errors(arguments))
        if errors:
            raise EngineError(errors[0].message[:400], 422)
        removes = params.name == 'apply_commands' and any(str(item.get('command', '')).endswith(('.remove', '.delete')) for item in arguments.get('commands', []) if isinstance(item, dict))
        if params.name in DOMAIN_BY_NAME:  # domain tools: judge the one command, not the tool's worst case
            removes = arguments['command'].endswith('.remove') or arguments['command'] == 'site.replace'
        if params.name == 'motion_track':  # judged per call like the domain tools: only a null track deletes
            removes = arguments['track'] is None
        destructive = BY_NAME[params.name]['annotations'].get('destructiveHint') and params.name not in DOMAIN_BY_NAME and params.name != 'motion_track'
        if (destructive or removes) and studio.approvals.settings()['agentDestructive']:
            # Agent Connect: the owner asked to approve destructive agent calls; this waits for a person's decision.
            await studio.approvals.wait('agent.tool', {'tool': params.name, 'arguments': json.dumps(arguments, ensure_ascii=False)[:1000], **caller(context)})
        match params.name:
            case 'get_site':
                result = await studio.state()
                if arguments.get('detail') == 'summary':
                    result = compact(result)
            case 'apply_commands':
                payload = {'commands': arguments['commands']}
                if 'expected_revision' in arguments:
                    payload['expectedRevision'] = arguments['expected_revision']
                result = await studio.mutate('batch', payload)
                if arguments.get('detail', 'summary') == 'summary':
                    result = compact(result)
            case 'history':
                payload = {'command': 'history.' + arguments['action'], 'params': {}}
                if 'expected_revision' in arguments:
                    payload['expectedRevision'] = arguments['expected_revision']
                result = await studio.mutate('exec', payload)
                if arguments.get('detail', 'summary') == 'summary':
                    result = compact(result)
            case name if name in DOMAIN_BY_NAME:
                result = await studio.substrates.active.dispatch(arguments['command'], arguments['params'], arguments.get('expected_revision'))
                if arguments.get('detail', 'summary') == 'summary':
                    result = compact(result)
            case 'audit_site':
                result = await studio.audit()
            case 'save_project':
                result = await studio.save_project(arguments.get('name'))
            case 'list_projects':
                result = studio.projects()
            case 'open_project':
                result = await studio.open_project(arguments['project_id'])
            case 'export_site':
                result = await studio.export_to_path(arguments.get('locale'))
            case 'publish_site':
                result = await studio.publish(arguments.get('slug'))
            case 'list_submissions':
                result = studio.forms.inbox()
            case 'set_page_password':
                result = await studio.passwords.set(arguments['route'], arguments['password'])
            case 'list_page_passwords':
                result = await studio.passwords.list()
            case 'brand_check':
                from .brand import check
                studio.access.authorize('read')
                try:
                    result = check(await studio.state(), arguments.get('page'))
                except ValueError as error:
                    raise EngineError(str(error), 404)
            case 'list_team_libraries':
                result = await (studio.team_libraries.get(arguments['id']) if arguments.get('id') else studio.team_libraries.list())
            case 'save_team_library':
                data = {kind: arguments[kind] for kind in ('colors', 'fonts', 'graphics') if kind in arguments}
                if arguments.get('id'):
                    result = await studio.team_libraries.save(arguments['id'], arguments.get('name'), data, arguments.get('expected_revision'))
                else:
                    result = await studio.team_libraries.create(arguments.get('name', ''), arguments.get('from_brand', False), data)
            case 'share_team_library':
                result = await studio.team_libraries.share(arguments['id'], arguments['identity_id'], arguments['role'])
            case 'use_team_library':
                result = await studio.team_libraries.use(arguments['id'], arguments.get('action', 'link'))
                result = {key: value for key, value in result.items() if key != 'state'} | {'site': compact(result['state'])}
            case 'write_copy':
                from . import writer
                result = await writer.copy(studio, arguments['node'], arguments['action'], arguments.get('tone'), arguments.get('brief'))
            case 'generate_site':
                from . import writer
                if arguments['action'] == 'status':
                    result = await writer.status(studio)
                elif arguments['action'] == 'reference':
                    result = await writer.reference_from(studio, arguments.get('asset'), arguments.get('name'), arguments.get('data'))
                elif arguments['action'] == 'plan':
                    if not arguments.get('prompt'):
                        raise EngineError('Pass prompt: what the site is for, who it is for and what pages it needs.', 422)
                    if arguments.get('instruction') and not isinstance(arguments.get('plan'), dict):
                        raise EngineError('To revise, pass plan (the outline to change) with instruction.', 422)
                    result = await writer.plan(studio, arguments['prompt'], arguments.get('pages', 3), arguments.get('references'),
                                               arguments.get('plan') if arguments.get('instruction') else None, arguments.get('instruction'))
                else:
                    if not isinstance(arguments.get('plan'), dict):
                        raise EngineError('Pass plan, the outline returned by action plan (edited if needed).', 422)
                    result = await writer.build(studio, arguments['plan'])
                    result = {key: value for key, value in result.items() if key != 'state'} | {'site': compact(result['state'])}
            case 'generate_image':
                from . import imagegen
                if arguments.get('action') == 'generators':
                    result = imagegen.generators(studio)
                else:
                    job = arguments.get('job')
                    if not job:
                        if not arguments.get('prompt'):
                            raise EngineError('Pass prompt, a description of the picture (or job to follow an earlier one).', 422)
                        job = imagegen.start(studio, arguments['prompt'], arguments.get('generator'), arguments.get('size'), arguments.get('count', 1))['job']
                    result = await imagegen.wait(studio, job, 90.0)
                    if result['status'] == 'done' and arguments.get('insert') and result['assets']:
                        placed = await imagegen.insert_asset(studio, result['assets'][0], arguments.get('alt') or '', arguments.get('parent'))
                        result = {**result, 'node': placed['node'], 'site': compact(placed['state'])}
                    elif result['status'] != 'done':
                        result = {**result, 'next': 'Call generate_image again with this job to collect the pictures when formvis finishes.'}
            case 'edit_in_formvis':
                from . import imagegen
                if arguments['action'] == 'send':
                    result = await imagegen.send_to_formvis(studio, arguments['node'])
                else:
                    result = await imagegen.update_from_formvis(studio, arguments['node'])
                    result = {key: value for key, value in result.items() if key != 'state'} | {'site': compact(result['state'])}
            case 'search_stock':
                from . import stock
                limit = arguments.get('limit', 24)
                if arguments['source'] == 'icons':
                    studio.access.authorize('read')
                    found = stock.search_icons(arguments.get('query', ''), limit)
                    result = {'total': found['total'], 'source': found['source'], 'icons': [{'name': item['name'], 'tags': item['tags'], 'license': item['license']} for item in found['icons']]}
                else:
                    result = stock.search_photos(studio, arguments.get('query', ''), limit)
            case 'insert_stock':
                from . import stock
                result = await stock.insert(studio, arguments['source'], arguments['id'], arguments.get('parent'), {key: arguments[key] for key in ('color', 'stroke', 'size') if key in arguments})
                result = {key: value for key, value in result.items() if key != 'state'} | {'site': compact(result['state'])}
            case 'remove_background':
                from . import background
                action = arguments.get('action', 'remove')
                if action == 'status':
                    studio.access.authorize('read')
                    result = background.status()
                elif not arguments.get('node'):
                    raise EngineError('Pass node, the ID of an img element (formweb://site/tree).', 422)
                elif action == 'restore':
                    result = await background.restore(studio, arguments['node'])
                else:
                    result = await background.apply(studio, arguments['node'], None, arguments.get('method', 'auto'), arguments.get('feather', 0))
                if 'state' in result:
                    result = {key: value for key, value in result.items() if key != 'state'} | {'site': compact(result['state'])}
            case 'list_ui_commands':
                from .commands_mirror import listing
                studio.access.authorize('read')
                result = listing(arguments.get('query', ''))
            case 'describe_ui_command':
                from .commands_mirror import describe
                studio.access.authorize('read')
                result = describe(arguments['id'])
            case 'run_ui_command':
                from .commands_mirror import run as run_ui_command
                result = await run_ui_command(arguments['id'], arguments.get('params'))
            case 'qr_code':
                from .qr import qr_image
                studio.access.authorize('read')
                data, _, filename = qr_image(arguments['url'], 'svg', arguments.get('dark', '#000000'), arguments.get('light', '#ffffff'), 8)
                result = {'url': arguments['url'], 'filename': filename, 'svg': data.decode('utf-8'), 'png': '/api/qr?format=png&url=' + quote(arguments['url'], safe='')}
            case _:
                if params.name in ADVANCED_BY_NAME:
                    result = await workflow_dispatch(params.name, arguments)
                elif params.name in PROVIDER_BY_NAME:
                    result = await provider_dispatch(params.name, arguments)
                else:
                    raise EngineError('Unknown tool.', 404)
        return types.CallToolResult(content=[types.TextContent(type='text', text=json.dumps(result, ensure_ascii=False))], structuredContent=result)
    except EngineError as error:
        result = {'error': str(error), 'status': error.status, **getattr(error, 'details', {})}
        hint = next_step(str(error), error.status)
        if hint:
            result['next'] = hint
        return types.CallToolResult(content=[types.TextContent(type='text', text=json.dumps(result))], structuredContent=result, isError=True)


def next_step(message, status):
    """One actionable sentence an agent can follow after an error."""
    text = message.lower()
    if 'language model' in text and ('no language model' in text or 'has no language model' in text):
        return 'Tell the person to set a language model in formvis (Preferences > Plugins): a local one such as Ollama or LM Studio, or a hosted service with their key. Then retry.'
    if 'outline is not usable' in text:
        return 'Pass the plan object exactly as generate_site action plan returned it (pages, each with sections), editing only text fields.'
    if 'could not revise the outline' in text:
        return 'Keep the outline you have: edit its text fields yourself and build it, or build it and change the pages with edit_nodes.'
    if 'reference' in text or 'pdf' in text:
        return 'Pass a PDF with a text layer or a PNG, JPEG, WebP or GIF image (at most 15 MB), or type the facts into prompt instead.'
    if 'outline' in text and ('cut short' in text or 'usable' in text or 'no json' in text):
        return 'Retry once with fewer pages or a shorter description; if it fails again, tell the person their model may need to be a stronger one.'
    if 'formvis' in text and ('not open' in text or 'outside agent' in text or 'not allowed' in text or 'no image generator' in text):
        return 'Ask the person to open the formvis window (and allow outside agents when it asks) or set up a generator there, then retry once.'
    if 'formlit' in text and 'not reachable' in text:
        return 'Tell the person stock photos come from formlit on their computer: start it (./formlit backend in the formlit folder), then retry; icons work without it.'
    if 'formvis' in text and ('not reachable' in text or 'no background engine' in text):
        return 'Tell the person background removal runs in formvis on their computer: start it (./formvis backend in the formvis folder), then retry; remove_background with action status checks it.'
    if text.startswith('library ') and 'not found' in text or text.startswith(('unknown field', 'invalid library')):
        return 'Call library_list (with kind, category or query) for the section, preset or starter ids and, for sections, the fields you can re-cast.'
    if 'library' in text and ('changed' in text or 'not found' in text or 'not edit' in text or 'not share' in text):
        return 'Call list_team_libraries (with id for one library) to see current revisions and your role, then retry with that revision as expected_revision; ask the library owner named in the error for more access.'
    if status == 409 or 'revision' in text:
        return 'Call get_site with detail "summary", then retry only the changes that did not land, with the new revision as expected_revision.'
    if 'unknown' in text and any(word in text for word in ('node', 'parent', 'page', 'id')):
        return 'Read formweb://site/tree for current page and element IDs; IDs change after duplicate, bulk create and undo.'
    if status == 403 and 'agents are disabled' in text:
        return 'Ask the person to turn Agents on in Agent Connect (rail bolt icon) in the FormWeb editor.'
    if status in (403, 408) and ('approve' in text or 'denied' in text):
        return 'Tell the person what you need approved and why; retry once after they confirm they are watching Agent Connect.'
    if status == 403:
        return 'Call get_access to see your role; ask the owner for the needed permission.'
    if status == 422 or 'invalid' in text or 'required' in text or 'must' in text:
        return 'Check the parameters listed in this tool\'s description (formweb://commands lists every command).'
    return ''


RESOURCE_WORKFLOWS = {'checkpoint': 'get_checkpoint', 'branches': 'list_branches', 'releases': 'list_releases', 'comments': 'list_comments', 'access': 'get_access', 'activity': 'get_activity', 'presence': 'get_presence', 'deliveries': 'list_deliveries'}


RESOURCE_TEXT = {
    'site/tree': ('Page and element outline', 'Every page as an indented outline: element ID, tag, name and a text excerpt. Read this first to find IDs; it is far smaller than the full site.'),
    'selection': ('Editor selection', 'What the person has selected in the FormWeb editor right now: page, element and its styles. Use for "this", "here" or "the selected" requests.'),
    'tokens': ('Design system', 'Design tokens, typed tokens, text presets and breakpoints. Reuse these instead of hard-coded values.'),
    'audit': ('Audit results', 'Current accessibility, SEO and integrity findings, as audit_site returns them.'),
    'commands': ('Command reference', 'Every engine command with its parameters, for apply_commands and the edit_* tools.'),
    'site': ('Full site document', 'The whole site with every element, style and setting. Large; prefer site/tree or get_site detail "summary".'),
    'activity': ('Activity', 'Recent changes with who made them and the channel: human, agent or terminal.'),
}


async def list_resources(context, params):
    names = ['site/tree', 'selection', 'tokens', 'audit', 'commands', 'site', *RESOURCE_WORKFLOWS, 'inbox', 'providers', 'catalog']
    resources = []
    for name in dict.fromkeys(names):
        title, description = RESOURCE_TEXT.get(name, ('FormWeb ' + name, 'Current permitted FormWeb ' + name + ' state.'))
        resources.append(types.Resource(uri='formweb://' + name, name=name, title=title, description=description, mimeType='application/json'))
    return types.ListResourcesResult(resources=resources)


async def selection():
    presence = studio.access.presence()['presence']
    state = await studio.state()
    nodes = state['site']['nodes']
    mine = sorted((item for item in presence if item.get('nodeId') in nodes), key=lambda item: item['lastSeen'], reverse=True)
    if not mine:
        return {'revision': state['revision'], 'selection': None, 'note': 'Nothing is selected in an open editor within the last minute.'}
    node = nodes[mine[0]['nodeId']]
    page = next((page for page in state['site']['pages'] if node['id'] == page['root'] or node['id'] in tree_ids(nodes, page['root'])), None)
    return {'revision': state['revision'], 'selectedBy': mine[0]['name'], 'page': page and {'id': page['id'], 'name': page['name'], 'slug': page['slug']}, 'node': {key: node.get(key) for key in ('id', 'tag', 'name', 'text', 'attrs', 'styles', 'breakpoints', 'children')}}


def tree_ids(nodes, root):
    seen, stack = set(), [root]
    while stack:
        current = stack.pop()
        if current in seen or current not in nodes:
            continue
        seen.add(current)
        stack.extend(nodes[current].get('children', []))
    return seen


async def list_prompts(context, params):
    return types.ListPromptsResult(prompts=[types.Prompt(name=name, title=item['title'], description=item['description'], arguments=[types.PromptArgument(**argument) for argument in item['arguments']]) for name, item in PROMPTS.items()])


async def get_prompt(context, params):
    item = PROMPTS.get(params.name)
    if not item:
        raise ValueError('Unknown FormWeb prompt. Available: ' + ', '.join(PROMPTS))
    values = {argument['name']: '' for argument in item['arguments']}
    values.update({key: str(value) for key, value in (params.arguments or {}).items() if key in values})
    missing = [argument['name'] for argument in item['arguments'] if argument['required'] and not values[argument['name']].strip()]
    if missing:
        raise ValueError('Missing prompt argument: ' + ', '.join(missing))
    text = item['text'].format(**{key: value or 'not given' for key, value in values.items()})
    return types.GetPromptResult(description=item['description'], messages=[types.PromptMessage(role='user', content=types.TextContent(type='text', text=text))])


async def read_resource(context, params):
    if not studio.agents_enabled:
        raise EngineError('Agents are disabled.', 403)
    uri = str(params.uri)
    if uri == 'formweb://site':
        result = await studio.state()
    elif uri == 'formweb://site/tree':
        studio.access.authorize('read')
        result = tree(await studio.state())
    elif uri == 'formweb://selection':
        result = await selection()
    elif uri == 'formweb://tokens':
        studio.access.authorize('read')
        result = tokens(await studio.state())
    elif uri == 'formweb://audit':
        result = await studio.audit()
    elif uri == 'formweb://commands':
        result = {'commands': studio.engine.commands, 'parameters': COMMAND_DOCS, 'tools': {tool['name']: tool['inputSchema']['properties']['command']['enum'] for tool in DOMAIN_TOOLS}, 'request': {'command': 'node.update', 'params': {'id': 'headline', 'patch': {'text': 'New headline'}}, 'expectedRevision': 0}, 'batch': {'commands': [{'command': 'node.update', 'params': {'id': 'headline', 'patch': {'text': 'New headline'}}}], 'expected_revision': 0}, 'owner': 'rust'}
    elif uri.removeprefix('formweb://') in RESOURCE_WORKFLOWS:
        result = await workflow_dispatch(RESOURCE_WORKFLOWS[uri.removeprefix('formweb://')], {})
    elif uri == 'formweb://inbox':
        result = studio.forms.inbox()
    elif uri == 'formweb://providers':
        result = await provider_dispatch('provider_status', {})
    elif uri == 'formweb://catalog':
        result = {'tools': TOOLS}
    else:
        raise ValueError('Unknown FormWeb resource.')
    return types.ReadResourceResult(contents=[types.TextResourceContents(uri=params.uri, mimeType='application/json', text=json.dumps(result, ensure_ascii=False))])


async def authenticated_call_tool(context, params):
    try:
        async with request_actor(context):
            return await call_tool(context, params)
    except EngineError as error:
        result = {'error': str(error), 'status': error.status}
        return types.CallToolResult(content=[types.TextContent(type='text', text=json.dumps(result))], structuredContent=result, isError=True)


async def authenticated_read_resource(context, params):
    async with request_actor(context):
        return await read_resource(context, params)


async def authenticated_get_prompt(context, params):
    async with request_actor(context):
        return await get_prompt(context, params)


mcp = Server('FormWeb', version=VERSION, instructions=INSTRUCTIONS, get_tool_input_schema=lambda name: BY_NAME[name]['inputSchema'] if name in BY_NAME else None, on_list_tools=list_tools, on_call_tool=authenticated_call_tool, on_list_resources=list_resources, on_read_resource=authenticated_read_resource, on_list_prompts=list_prompts, on_get_prompt=authenticated_get_prompt)
mcp_app = mcp.streamable_http_app(streamable_http_path='/mcp', json_response=True, stateless_http=True, max_request_body_size=64 * 1024 * 1024, transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=True, allowed_hosts=[f'localhost:{PORT}', f'127.0.0.1:{PORT}', f'[::1]:{PORT}'], allowed_origins=list(ORIGINS)))
