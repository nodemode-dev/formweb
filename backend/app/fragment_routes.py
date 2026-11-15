"""Copy and paste of elements (TURN_F_SPEC Phase 16, W2).

`POST /api/fragment {node}` asks the core for a self-contained fragment of an element's subtree (read permission).
`POST /api/paste {fragment, parent?, index?}` checks the fragment's format, version and size, makes sure every asset it
names is in this FormWeb's asset store (missing ones are named in a 409 and nothing changes), runs the core's
`node.paste` command through the same mutate path as the editor (one undo step, permissions, attribution, revision),
and then makes the current project an owner of the assets, the way an upload does."""
import base64
import binascii
import json

from fastapi import APIRouter, Request

from .assets import ASSET_NAME, ASSET_REF, SIZE_LIMITS, asset_path, check_declared, ingest_declared, own_asset, visible_assets
from .clips import MAX_CLIP_BYTES, clip_target, create_clip, fetch_clip_assets
from .config import MAX_IMAGE_BYTES
from .engine import EngineError
from .service import studio

router = APIRouter()

FORMAT = 'com.nodemode.formweb.fragment'
VERSION = 1
MAX_PASTE_BYTES = 32 * 1024 * 1024
MAX_EMBED_BYTES = 16 * 1024 * 1024  # raw asset bytes a copy may carry; the base64 form stays under the paste cap
MAX_CLIP_EMBED_BYTES = 4 * 1024 * 1024  # with clip, only this much rides inline; the rest waits behind the clip link
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


async def fragment_of(node, embed=False, clip=False):
    """The fragment of one element's subtree (read permission); shared by the route and the MCP tool.
    With embed, `embedded` maps asset ids to base64 bytes (smallest first, 16 MiB of raw bytes in all) and `notEmbedded` lists the rest.
    With embed and clip, only 4 MiB rides inline; the next assets (512 MiB in all, each within its type's upload limit) sit behind
    `clip` ({url, token, ids, expires}, 15 minutes by default) and `notEmbedded` lists what neither carries."""
    studio.access.authorize('read')
    if not isinstance(node, str) or not 1 <= len(node) <= 160:
        raise EngineError('node must be an element id.', 400)
    fragment = await studio.engine.request('fragment', {'id': node})
    if embed is True and isinstance(fragment, dict):
        visible = visible_assets(studio)
        sized = []
        left = []
        for name in _asset_names(fragment):
            try:
                path = asset_path(name)
            except EngineError:
                left.append(name)
                continue
            if name in visible:
                sized.append((path.stat().st_size, name, path))
            else:
                left.append(name)
        embedded: dict = {}
        total = 0
        clipped: dict = {}
        clip_total = 0
        for size, name, path in sorted(sized, key=lambda item: item[0]):
            if clip is True:
                if total + size <= MAX_CLIP_EMBED_BYTES and not clipped:
                    total += size
                    embedded[name] = base64.b64encode(path.read_bytes()).decode('ascii')
                elif clip_total + size <= MAX_CLIP_BYTES and size <= SIZE_LIMITS.get(name.rsplit('.', 1)[1], MAX_IMAGE_BYTES):
                    clip_total += size
                    clipped[name] = path
                else:
                    left.append(name)
                continue
            if total + size > MAX_EMBED_BYTES:
                left.append(name)
                continue
            total += size
            embedded[name] = base64.b64encode(path.read_bytes()).decode('ascii')
        fragment = {**fragment, 'embedded': embedded, 'notEmbedded': left}
        if clipped:
            fragment['clip'] = create_clip(clipped)
    return fragment


@router.post('/api/fragment')
async def make_fragment(request: Request):
    studio.access.authorize('read')
    body = await _body(request, 64 * 1024)
    return await fragment_of(body.get('node'), body.get('embed') is True, body.get('clip') is True)


@router.post('/api/paste')
async def paste_fragment(request: Request):
    studio.access.authorize('edit')
    return await paste_body(await _body(request))


async def paste_body(body: dict):
    """Check and paste one fragment as one undo step; shared by the route and the MCP tool."""
    studio.access.authorize('edit')
    fragment = body.get('fragment')
    names = _check(fragment)
    embedded = body.get('embedded')
    if embedded is None:
        embedded = fragment.get('embedded')
    if embedded is None:
        embedded = {}
    if not isinstance(embedded, dict):
        raise EngineError('embedded must map asset ids to base64 bytes.', 400)
    clip = body.get('clip')
    if clip is None:
        clip = fragment.get('clip')
    if clip is not None:
        clip_target(clip)  # a link that is not this computer's loopback clip path is refused before any request
    if 'embedded' in fragment or 'notEmbedded' in fragment or 'clip' in fragment:
        fragment = {key: value for key, value in fragment.items() if key not in ('embedded', 'notEmbedded', 'clip')}
    missing = []
    adopt: dict = {}
    remote = []
    visible = visible_assets(studio) if names else set()
    for name in names:
        try:
            asset_path(name)
            present = True
        except EngineError:
            present = False
        # An asset this identity cannot already see reads as missing, so a known hash cannot claim another project's file.
        if present and name in visible:
            continue
        carried = embedded.get(name)
        if carried is None:
            if clip is not None:
                remote.append(name)
            else:
                missing.append(name)
            continue
        try:
            data = base64.b64decode(carried, validate=True) if isinstance(carried, str) else None
        except (binascii.Error, ValueError):
            data = None
        if data is None:
            raise EngineError('Embedded bytes for ' + name + ' are not valid base64.', 400)
        check_declared(name, data)  # digest, size by type, magic bytes, mime: possession is proved before anything is stored
        adopt[name] = data
    if remote:
        fetched = await fetch_clip_assets(clip, remote)
        for name in remote:
            if name not in fetched:
                missing.append(name)
        if not missing:
            for name in remote:
                check_declared(name, fetched[name])  # same proof as embedded bytes, before anything is stored
                adopt[name] = fetched[name]
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
    for name, data in adopt.items():
        ingest_declared(name, data)
    for name in names:
        own_asset(studio, name)
    studio.access.record('node.paste', {'assets': len(names)})
    return result
