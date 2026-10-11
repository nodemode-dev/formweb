"""Background removal (FW-072), handed to formvis.

formvis, the form family's image editor, already removes backgrounds on this computer (U2-Net on ONNX Runtime, or
GrabCut when the model is not installed) and answers POST /api/ops/remove-background with a soft greyscale mask.
FormWeb sends it the image node's uploaded asset, gets the mask back, and keeps everything else local: the editor
lets a person erase or restore parts of the mask with a brush, then this module applies the mask (with an optional
soft edge) to the original pixels and saves the cut-out as a new transparent PNG asset. The node's src changes in
one engine command, so Undo brings the old picture back, and data-fw-original-src remembers the original so Restore
original works later too. The original asset is never changed.
"""
import base64
import io
import json
import os
import secrets
import urllib.error
import urllib.request

from .assets import ASSET_NAME, ASSET_REF, asset_path, ingest, own_asset, visible_assets
from .engine import EngineError

FORMVIS_URL = os.getenv('FORMWEB_FORMVIS_URL', 'http://127.0.0.1:8190').rstrip('/')
METHODS = ('auto', 'ml', 'lite')
MAX_MASK_BYTES = 12 * 1024 * 1024
START_HINT = 'Start formvis on this computer (in the formvis folder: ./formvis backend), or set FORMWEB_FORMVIS_URL to where it runs.'


def _call(path: str, data: bytes | None = None, headers: dict | None = None, timeout: float = 4.0):
    request = urllib.request.Request(FORMVIS_URL + path, data=data, headers=headers or {}, method='POST' if data is not None else 'GET')
    with urllib.request.urlopen(request, timeout=timeout) as response:  # loopback by default; the URL is the owner's setting
        return response.read(), dict(response.headers)


def status() -> dict:
    """Whether formvis answers, and which engines it has. Never raises: the editor shows the reason."""
    try:
        body, _ = _call('/api/capabilities', timeout=2.0)
        caps = json.loads(body)
        engines = caps.get('removeBackground') or {}
        ready = bool(engines.get('ml') or engines.get('lite'))
        return {'available': ready, 'url': FORMVIS_URL, 'version': caps.get('version'), 'engines': {'ml': bool(engines.get('ml')), 'lite': bool(engines.get('lite'))},
                'default': engines.get('default'), 'model': engines.get('model'),
                'note': f'formvis {caps.get("version")} removes backgrounds on this computer' + (' with U2-Net.' if engines.get('ml') else ' with its lightweight engine.') if ready else 'formvis is running but has no background engine installed (./formvis install in the formvis folder).'}
    except (urllib.error.URLError, OSError, ValueError) as error:
        return {'available': False, 'url': FORMVIS_URL, 'engines': {'ml': False, 'lite': False}, 'note': f'formvis is not reachable at {FORMVIS_URL}. {START_HINT}', 'reason': str(getattr(error, 'reason', error))[:200]}


def node_asset(studio, state: dict, node_id: str) -> tuple[dict, str]:
    node = state['site']['nodes'].get(node_id) if isinstance(node_id, str) else None
    if not node or node.get('tag') != 'img':
        raise EngineError('Choose an image element (an img with an uploaded picture).', 404)
    attrs = node.get('attrs') or {}
    source = attrs.get('data-fw-original-src') or attrs.get('src', '')
    match = ASSET_REF.search(source)
    if not match:
        raise EngineError('This image is not an uploaded picture. Upload it first (Content > Upload image), then remove its background.', 422)
    asset = match.group(1)
    if asset not in visible_assets(studio):
        raise EngineError('Asset not found for this identity.', 404)
    return node, asset


def mask(studio, asset: str, method: str = 'auto') -> tuple[bytes, str]:
    """Ask formvis for the subject mask of an uploaded picture. Returns (mask PNG, engine used)."""
    studio.access.authorize('edit')
    if method not in METHODS:
        raise EngineError('Method must be auto, ml (U2-Net) or lite (GrabCut).')
    if not isinstance(asset, str) or not ASSET_NAME.fullmatch(asset) or asset not in visible_assets(studio):
        raise EngineError('Asset not found for this identity.', 404)
    data = asset_path(asset).read_bytes()
    boundary = 'formweb' + secrets.token_hex(12)
    mime = {'png': 'image/png', 'jpg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp'}[asset.rsplit('.', 1)[1]]
    body = b''.join([
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{asset}"\r\nContent-Type: {mime}\r\n\r\n'.encode(), data,
        f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="method"\r\n\r\n{method}\r\n--{boundary}--\r\n'.encode(),
    ])
    try:
        result, headers = _call('/api/ops/remove-background', body, {'Content-Type': f'multipart/form-data; boundary={boundary}'}, timeout=180.0)
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', 'replace')
        try:
            detail = json.loads(detail).get('detail', detail)
        except ValueError:
            pass
        raise EngineError(f'formvis could not remove the background: {detail}', 501 if error.code == 501 else 422) from error
    except (urllib.error.URLError, OSError) as error:
        raise EngineError(f'formvis is not reachable at {FORMVIS_URL}. {START_HINT}', 503) from error
    used = {key.lower(): value for key, value in headers.items()}.get('x-method', method)
    studio.access.record('background.mask', {'asset': asset, 'method': used})
    return result, used


def cutout(original: bytes, mask_png: bytes, feather: float = 0.0) -> bytes:
    """The original pixels with the mask as alpha (soft edge optional), as a PNG."""
    from PIL import Image, ImageFilter

    with Image.open(io.BytesIO(original)) as image:
        image.load()
        rgba = image.convert('RGBA')
    with Image.open(io.BytesIO(mask_png)) as alpha_image:
        alpha_image.load()
        alpha = alpha_image.convert('L')
    if alpha.size != rgba.size:
        alpha = alpha.resize(rgba.size, Image.Resampling.BILINEAR)
    if feather > 0:
        alpha = alpha.filter(ImageFilter.GaussianBlur(radius=min(float(feather), 40.0)))
    # Keep any transparency the picture already had: the cut-out can only remove pixels, never invent them.
    from PIL import ImageChops
    rgba.putalpha(ImageChops.multiply(rgba.getchannel('A'), alpha))
    out = io.BytesIO()
    rgba.save(out, format='PNG', optimize=True)
    return out.getvalue()


async def apply(studio, node_id: str, mask_b64: str | None = None, method: str = 'auto', feather: float = 0.0) -> dict:
    """Replace an image node's picture with its cut-out (one undo step). Without a mask, formvis makes one first."""
    studio.access.authorize('edit')
    if not isinstance(feather, (int, float)) or not 0 <= feather <= 40:
        raise EngineError('Soft edge must be between 0 and 40 pixels.')
    state = await studio.state()
    node, asset = node_asset(studio, state, node_id)
    if mask_b64:
        if not isinstance(mask_b64, str) or len(mask_b64) > MAX_MASK_BYTES * 4 // 3 + 8:
            raise EngineError('The mask is too large.', 413)
        try:
            mask_png = base64.b64decode(mask_b64.split(',', 1)[-1], validate=True)
        except ValueError as error:
            raise EngineError('The mask must be a base64 PNG.') from error
        if not mask_png.startswith(b'\x89PNG\r\n\x1a\n'):
            raise EngineError('The mask must be a PNG.')
        used = 'edited'
    else:
        mask_png, used = mask(studio, asset, method)
    try:
        png = cutout(asset_path(asset).read_bytes(), mask_png, feather)
    except (OSError, ValueError) as error:
        raise EngineError('The picture or its mask could not be read.') from error
    name = (node.get('name') or 'image') + ' cut-out.png'
    stored = ingest(png, 'image/png', name)
    own_asset(studio, stored['id'])
    attrs = {'src': stored['url']}
    if not (node.get('attrs') or {}).get('data-fw-original-src'):
        attrs['data-fw-original-src'] = (node.get('attrs') or {}).get('src', '')
    result = await studio.mutate('exec', {'command': 'node.update', 'params': {'id': node_id, 'patch': {'attrs': attrs}}})
    studio.access.record('background.apply', {'node': node_id, 'asset': stored['id'], 'method': used})
    return {'node': node_id, 'asset': stored, 'method': used, 'state': result,
            'message': f'Background removed ({"your edited mask" if used == "edited" else "U2-Net" if used == "ml" else "GrabCut"}); saved as a new transparent PNG. Undo or Restore original brings the old picture back.'}


async def restore(studio, node_id: str) -> dict:
    studio.access.authorize('edit')
    state = await studio.state()
    node = state['site']['nodes'].get(node_id) if isinstance(node_id, str) else None
    original = ((node or {}).get('attrs') or {}).get('data-fw-original-src')
    if not original:
        raise EngineError('This image has no removed background to restore.', 404)
    result = await studio.mutate('exec', {'command': 'node.update', 'params': {'id': node_id, 'patch': {'attrs': {'src': original, 'data-fw-original-src': None}}}})
    return {'node': node_id, 'state': result, 'message': 'Original picture restored.'}
