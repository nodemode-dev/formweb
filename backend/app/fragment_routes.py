"""Copy and paste of elements (TURN_F_SPEC Phase 16, W2).

`POST /api/fragment {node}` asks the core for a self-contained fragment of an element's subtree (read permission).
`POST /api/paste {fragment, parent?, index?}` checks the fragment's format, version and size, makes sure every asset it
names is in this FormWeb's asset store (missing ones are named in a 409 and nothing changes), runs the core's
`node.paste` command through the same mutate path as the editor (one undo step, permissions, attribution, revision),
and then makes the current project an owner of the assets, the way an upload does."""
import json

from fastapi import APIRouter, Request

from .assets import ASSET_NAME, ASSET_REF, asset_path, own_asset, visible_assets
from .engine import EngineError
from .service import studio

router = APIRouter()

FORMAT = 'com.nodemode.formweb.fragment'
VERSION = 1
MAX_PASTE_BYTES = 8 * 1024 * 1024
MAX_NODES = 2000


async def _body(request: Request, maximum: int = MAX_PASTE_BYTES) -> dict:
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > maximum:
            raise EngineError('Request body is too large.', 413)
    try:
        body = json.loads(bytes(data) or b'{}')
    except ValueError:
        raise EngineError('The request body is not valid JSON.', 400)
    if not isinstance(body, dict):
        raise EngineError('The request body must be a JSON object.', 400)
    return body


def _asset_names(fragment: dict) -> list[str]:
    """Every asset the fragment lists or refers to, as store names, in first-seen order."""
    names: list[str] = []
    listed = fragment.get('assets')
    if not isinstance(listed, list):
        raise EngineError('The fragment needs an assets list.', 400)
    for item in listed:
        text = item if isinstance(item, str) else ''
        match = ASSET_REF.search(text)
        name = match.group(1) if match else text
        if not ASSET_NAME.fullmatch(name):
            raise EngineError('The fragment lists an asset id that is not valid.', 400)
        if name not in names:
            names.append(name)
    for name in ASSET_REF.findall(json.dumps(fragment)):
        if name not in names:
            names.append(name)
    return names


def _check(fragment) -> list[str]:
    if not isinstance(fragment, dict):
        raise EngineError('The fragment must be an object.', 400)
    if fragment.get('format') != FORMAT:
        raise EngineError('This is not a FormWeb fragment.', 400)
    if fragment.get('version') != VERSION:
        raise EngineError('This fragment version is not supported.', 400)
    nodes = fragment.get('nodes')
    if not isinstance(nodes, (list, dict)) or not nodes:
        raise EngineError('The fragment has no nodes.', 400)
    if len(nodes) > MAX_NODES:
        raise EngineError(f'A fragment holds at most {MAX_NODES} nodes.', 400)
    return _asset_names(fragment)


async def fragment_of(node):
    """The fragment of one element's subtree (read permission); shared by the route and the MCP tool."""
    studio.access.authorize('read')
    if not isinstance(node, str) or not 1 <= len(node) <= 160:
        raise EngineError('node must be an element id.', 400)
    return await studio.engine.request('fragment', {'id': node})


@router.post('/api/fragment')
async def make_fragment(request: Request):
    studio.access.authorize('read')
    body = await _body(request, 64 * 1024)
    return await fragment_of(body.get('node'))


@router.post('/api/paste')
async def paste_fragment(request: Request):
    studio.access.authorize('edit')
    return await paste_body(await _body(request))


async def paste_body(body: dict):
    """Check and paste one fragment as one undo step; shared by the route and the MCP tool."""
    studio.access.authorize('edit')
    fragment = body.get('fragment')
    names = _check(fragment)
    missing = []
    visible = visible_assets(studio) if names else set()
    for name in names:
        try:
            asset_path(name)
        except EngineError:
            missing.append(name)
            continue
        # An asset this identity cannot already see reads as missing, so a known hash cannot claim another project's file.
        if name not in visible:
            missing.append(name)
    if missing:
        raise EngineError('This FormWeb does not have these assets: ' + ', '.join(missing) + '. Nothing was pasted.', 409)
    params: dict = {'fragment': fragment}
    if body.get('parent') is not None:
        if not isinstance(body['parent'], str) or not 1 <= len(body['parent']) <= 160:
            raise EngineError('parent must be an element id.', 400)
        params['parent'] = body['parent']
    if body.get('index') is not None:
        index = body['index']
        if isinstance(index, bool) or not isinstance(index, int) or index < 0:
            raise EngineError('index must be a whole number from 0.', 400)
        params['index'] = index
    payload: dict = {'command': 'node.paste', 'params': params}
    if body.get('expectedRevision') is not None:
        payload['expectedRevision'] = body['expectedRevision']
    result = await studio.mutate('exec', payload)
    for name in names:
        own_asset(studio, name)
    studio.access.record('node.paste', {'assets': len(names)})
    return result
