import json

from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.transport_security import TransportSecuritySettings

from .config import ORIGINS, PORT, VERSION
from .engine import EngineError
from .mcp_catalog import BY_NAME, TOOLS
from .service import studio


async def list_tools(context, params):
    return types.ListToolsResult(tools=[types.Tool(**item) for item in TOOLS])


async def call_tool(context, params):
    arguments = params.arguments or {}
    try:
        if not studio.agents_enabled:
            raise EngineError('Agents are disabled. Enable Agents in FormWeb or set FORMWEB_AGENTS=1.', 403)
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
                result = await studio.engine.request('audit')
            case 'save_project':
                result = await studio.save_project(arguments.get('name'))
            case 'list_projects':
                result = studio.store.projects()
            case 'open_project':
                result = await studio.open_project(arguments['project_id'])
            case 'export_site':
                result = await studio.export_to_path(arguments.get('locale'))
            case 'publish_site':
                result = await studio.publish(arguments.get('slug'))
            case 'list_submissions':
                result = studio.store.submissions()
            case _:
                raise EngineError('Unknown tool.')
        return types.CallToolResult(content=[types.TextContent(type='text', text=json.dumps(result, ensure_ascii=False))], structuredContent=result)
    except EngineError as error:
        result = {'error': str(error), 'status': error.status}
        return types.CallToolResult(content=[types.TextContent(type='text', text=json.dumps(result))], structuredContent=result, isError=True)


async def list_resources(context, params):
    return types.ListResourcesResult(resources=[types.Resource(uri='formweb://site', name='Current site', description='Rust-owned editable site and revision.', mimeType='application/json'), types.Resource(uri='formweb://commands', name='Engine commands', description='Supported engine command names and model shape.', mimeType='application/json')])


async def read_resource(context, params):
    if not studio.agents_enabled:
        raise EngineError('Agents are disabled.', 403)
    uri = str(params.uri)
    if uri == 'formweb://site':
        result = await studio.state()
    elif uri == 'formweb://commands':
        result = {'commands': studio.engine.commands, 'request': {'command': 'node.update', 'params': {'id': 'headline', 'patch': {'text': 'New headline'}}, 'expectedRevision': 0}, 'batch': {'commands': [{'command': 'node.update', 'params': {'id': 'headline', 'patch': {'text': 'New headline'}}}], 'expected_revision': 0}, 'owner': 'rust'}
    else:
        raise ValueError('Unknown FormWeb resource.')
    return types.ReadResourceResult(contents=[types.TextResourceContents(uri=params.uri, mimeType='application/json', text=json.dumps(result, ensure_ascii=False))])


mcp = Server('FormWeb', version=VERSION, instructions='FormWeb website editor. Read the site and revision before edits. All tools share the editor Rust engine. Local publication is not external hosting.', get_tool_input_schema=lambda name: BY_NAME[name]['inputSchema'] if name in BY_NAME else None, on_list_tools=list_tools, on_call_tool=call_tool, on_list_resources=list_resources, on_read_resource=read_resource)
mcp_app = mcp.streamable_http_app(streamable_http_path='/mcp', json_response=True, stateless_http=True, max_request_body_size=8 * 1024 * 1024, transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=True, allowed_hosts=[f'localhost:{PORT}', f'127.0.0.1:{PORT}', f'[::1]:{PORT}'], allowed_origins=list(ORIGINS)))
