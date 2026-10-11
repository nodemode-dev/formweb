import json

from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.transport_security import TransportSecuritySettings

from contextlib import asynccontextmanager
from urllib.parse import quote
from jsonschema import Draft202012Validator

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
        destructive = BY_NAME[params.name]['annotations'].get('destructiveHint') and params.name not in DOMAIN_BY_NAME
        if (destructive or removes) and studio.approvals.settings()['agentDestructive']:
            # Agent Connect: the owner asked to approve destructive agent calls; this waits for a person's decision.
            await studio.approvals.wait('agent.tool', {'tool': params.name, 'arguments': json.dumps(arguments, ensure_ascii=False)[:1000]})
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
                studio.access.authorize('read')
                result = await studio.engine.request('audit')
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
        studio.access.authorize('read')
        result = await studio.engine.request('audit')
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
