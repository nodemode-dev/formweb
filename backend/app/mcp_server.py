import json

from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.transport_security import TransportSecuritySettings

from contextlib import asynccontextmanager
from jsonschema import Draft202012Validator

from .access import actor
from .advanced_catalog import ADVANCED_BY_NAME, ADVANCED_TOOLS
from .config import ORIGINS, PORT, VERSION
from .engine import EngineError
from .mcp_catalog import TOOLS as BASE_TOOLS
from .providers.catalog import PROVIDER_BY_NAME, PROVIDER_TOOLS
from .providers.service import dispatch_tool as provider_dispatch
from .service import studio
from .workflows import dispatch as workflow_dispatch

TOOLS = BASE_TOOLS + ADVANCED_TOOLS + PROVIDER_TOOLS
BY_NAME = {item['name']: item for item in TOOLS}


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
    return types.ListToolsResult(tools=[types.Tool(**item) for item in TOOLS])


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
        match params.name:
            case 'get_site':
                result = await studio.state()
            case 'apply_commands':
                payload = {'commands': arguments['commands']}
                if 'expected_revision' in arguments:
                    payload['expectedRevision'] = arguments['expected_revision']
                result = await studio.mutate('batch', payload)
            case 'history':
                payload = {'command': 'history.' + arguments['action'], 'params': {}}
                if 'expected_revision' in arguments:
                    payload['expectedRevision'] = arguments['expected_revision']
                result = await studio.mutate('exec', payload)
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
        return types.CallToolResult(content=[types.TextContent(type='text', text=json.dumps(result))], structuredContent=result, isError=True)


RESOURCE_WORKFLOWS = {'checkpoint': 'get_checkpoint', 'branches': 'list_branches', 'releases': 'list_releases', 'comments': 'list_comments', 'access': 'get_access', 'activity': 'get_activity', 'presence': 'get_presence', 'deliveries': 'list_deliveries'}


async def list_resources(context, params):
    names = ['site', 'commands', *RESOURCE_WORKFLOWS, 'inbox', 'providers', 'catalog']
    return types.ListResourcesResult(resources=[types.Resource(uri='formweb://' + name, name='FormWeb ' + name, description='Current permitted FormWeb ' + name + ' state.', mimeType='application/json') for name in names])


async def read_resource(context, params):
    if not studio.agents_enabled:
        raise EngineError('Agents are disabled.', 403)
    uri = str(params.uri)
    if uri == 'formweb://site':
        result = await studio.state()
    elif uri == 'formweb://commands':
        result = {'commands': studio.engine.commands, 'request': {'command': 'node.update', 'params': {'id': 'headline', 'patch': {'text': 'New headline'}}, 'expectedRevision': 0}, 'batch': {'commands': [{'command': 'node.update', 'params': {'id': 'headline', 'patch': {'text': 'New headline'}}}], 'expected_revision': 0}, 'owner': 'rust'}
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


mcp = Server('FormWeb', version=VERSION, instructions='FormWeb website editor. Read the site and revision before edits. All tools share the editor Rust engine. Project roles apply equally to REST and MCP. Local publication is not external hosting.', get_tool_input_schema=lambda name: BY_NAME[name]['inputSchema'] if name in BY_NAME else None, on_list_tools=list_tools, on_call_tool=authenticated_call_tool, on_list_resources=list_resources, on_read_resource=authenticated_read_resource)
mcp_app = mcp.streamable_http_app(streamable_http_path='/mcp', json_response=True, stateless_http=True, max_request_body_size=64 * 1024 * 1024, transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=True, allowed_hosts=[f'localhost:{PORT}', f'127.0.0.1:{PORT}', f'[::1]:{PORT}'], allowed_origins=list(ORIGINS)))
