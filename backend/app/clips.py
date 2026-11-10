"""Clip links (TURN_H_SPEC Phase 24, W3).

A copy made with `clip: true` keeps the assets that are too big to ride in the clipboard behind a short-lived link on this
backend. `GET /api/clips/<token>/<asset id>` answers one listed asset while the clip lives (15 minutes by default, FORMWEB_CLIP_SECONDS sets 10 to 3600 seconds; kept in memory as
paths into the asset store, so no bytes are copied). The token is 32 random bytes in hex and is the only credential; every
other case answers the same 404. The paste side fetches only through `fetch_clip_assets`, which accepts a loopback origin
with a numeric port and the exact path `/api/clips/<token>`, follows no redirects and caps every read."""
import asyncio
import http.client
import re
import secrets
import time
from urllib.parse import urlsplit

from fastapi import APIRouter
from starlette.responses import FileResponse

from .assets import ASSET_NAME, MIME_TYPES, SIZE_LIMITS
from .config import CLIP_SECONDS, MAX_IMAGE_BYTES, PORT
from .engine import EngineError

router = APIRouter()

MAX_LIVE_CLIPS = 16
MAX_CLIP_BYTES = 512 * 1024 * 1024
FETCH_TIMEOUT = 10
FETCH_DEADLINE = 300
TOKEN = re.compile(r'[0-9a-f]{64}')
LOOPBACK_HOSTS = ('127.0.0.1', '::1', 'localhost')

_clips: dict = {}


def _purge(now: float | None = None) -> None:
    now = time.time() if now is None else now
    for token in [token for token, clip in _clips.items() if clip['expires'] <= now]:
        del _clips[token]


def create_clip(items: dict) -> dict:
    """Open a clip over {asset id: path}; returns {url, token, ids, expires} (expires is whole seconds since the epoch, UTC)."""
    _purge()
    while len(_clips) >= MAX_LIVE_CLIPS:
        del _clips[min(_clips, key=lambda token: _clips[token]['expires'])]
    token = secrets.token_bytes(32).hex()
    expires = int(time.time()) + CLIP_SECONDS
    _clips[token] = {'expires': expires, 'items': dict(items)}
    return {'url': f'http://127.0.0.1:{PORT}/api/clips/{token}', 'token': token, 'ids': list(items), 'expires': expires}


def _lookup(token: str, name: str):
    _purge()
    if not TOKEN.fullmatch(token) or not ASSET_NAME.fullmatch(name):
        return None
    found = None
    for live, clip in _clips.items():  # every live token is compared, so timing does not tell how much of a guess was right
        if secrets.compare_digest(live.encode(), token.encode()):
            found = clip
    return found['items'].get(name) if found else None


@router.get('/api/clips/{token}/{asset_id}')
async def clip_asset(token: str, asset_id: str):
    path = _lookup(token, asset_id)
    if path is None or not path.is_file():
        raise EngineError('Not found.', 404)
    headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}
    if path.suffix == '.svg':
        headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    return FileResponse(path, media_type=MIME_TYPES[path.suffix[1:]], headers=headers)


def clip_target(clip) -> tuple[str, int, str]:
    """(host, port, token) of a clip object when it may be fetched; EngineError 400 otherwise, before any request is made."""
    refusal = EngineError('The clip link is not a FormWeb clip on this computer. Nothing was pasted.', 400)
    if not isinstance(clip, dict) or not isinstance(clip.get('url'), str) or not isinstance(clip.get('token'), str):
        raise refusal
    url = clip['url']
    if len(url) > 300 or any(ord(char) < 33 or ord(char) > 126 for char in url):
        raise refusal
    try:
        parts = urlsplit(url)
        host = parts.hostname
        port = parts.port
    except ValueError:
        raise refusal
    if parts.scheme != 'http' or host not in LOOPBACK_HOSTS or port is None or not 1 <= port <= 65535:
        raise refusal
    if '@' in parts.netloc or parts.query or parts.fragment or '?' in url or '#' in url:
        raise refusal
    match = re.fullmatch(r'/api/clips/([0-9a-f]{64})', parts.path)
    if not match or match.group(1) != clip['token']:
        raise refusal
    return host, port, match.group(1)


def _fetch_one(host: str, port: int, token: str, name: str, limit: int, deadline: float):
    """The bytes of one clip asset, or None for any answer but a plain 200 within the limit. Never follows a redirect."""
    connection = http.client.HTTPConnection(host, port, timeout=FETCH_TIMEOUT)
    try:
        connection.request('GET', f'/api/clips/{token}/{name}', headers={'Accept': 'application/octet-stream', 'Connection': 'close'})
        response = connection.getresponse()
        if response.status != 200:
            return None
        declared = response.getheader('Content-Length', '')
        if declared and (not declared.isdecimal() or int(declared) > limit):
            return None
        data = bytearray()
        while True:
            if time.time() > deadline:
                return None
            chunk = response.read(min(1024 * 1024, limit + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > limit:
                return None
        return bytes(data)
    except (OSError, http.client.HTTPException, ValueError):
        return None
    finally:
        connection.close()


def _fetch_all(host: str, port: int, token: str, names: list, total_limit: int) -> dict:
    deadline = time.time() + FETCH_DEADLINE
    fetched: dict = {}
    spent = 0
    for name in names:
        limit = min(SIZE_LIMITS.get(name.rsplit('.', 1)[1], MAX_IMAGE_BYTES), total_limit - spent)
        if limit <= 0:
            continue
        data = _fetch_one(host, port, token, name, limit, deadline)
        if data is not None:
            fetched[name] = data
            spent += len(data)
    return fetched


async def fetch_clip_assets(clip, names: list) -> dict:
    """Fetch the named assets through a validated clip; {name: bytes} holds what arrived, the rest are missing.
    Only names the clip lists are asked for, and no request is made unless the clip link passes `clip_target`."""
    host, port, token = clip_target(clip)
    listed = clip.get('ids')
    wanted = [name for name in names if isinstance(listed, list) and name in listed and ASSET_NAME.fullmatch(name)]
    if not wanted:
        return {}
    return await asyncio.to_thread(_fetch_all, host, port, token, wanted, MAX_CLIP_BYTES)
