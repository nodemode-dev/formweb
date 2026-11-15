"""Send the open site to FormPublisher (TURN_D_SPEC Phase 10, D3).

`POST /api/handoff/formpublisher` exports the open site exactly like `GET /api/export`, then posts the zip to
FormPublisher's `POST /api/receive/formweb`. When FormPublisher does not answer, the zip is written atomically into its
inbox folder, which it imports the next time it runs. Returns `{delivered: "live"|"inbox", site?, revision?, path?, warnings}` (warnings: the export's own)."""
import asyncio
import json
import os
import re
import socket
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter

from .config import VERSION
from .engine import EngineError
from .service import studio

router = APIRouter()

DEFAULT_URL = 'http://127.0.0.1:8280'
TIMEOUT_SECONDS = 8
HEALTH_TIMEOUT_SECONDS = 1.5


def publisher_home() -> Path:
    env = os.getenv('FORMPUBLISHER_HOME', '').strip()
    return Path(env).expanduser() if env else Path.home() / 'FormPublisher'


def _engine_file_url() -> str | None:
    """The loopback URL named by FormPublisher's engine.json, only when that port answers as FormPublisher."""
    try:
        info = json.loads((publisher_home() / 'engine.json').read_text(encoding='utf-8'))
        port = info.get('port') if isinstance(info, dict) else None
        if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
            return None
        url = f'http://127.0.0.1:{port}'
        with urllib.request.urlopen(url + '/api/health', timeout=HEALTH_TIMEOUT_SECONDS) as response:
            health = json.loads(response.read(65536).decode('utf-8') or '{}')
    except (OSError, ValueError, urllib.error.URLError, socket.timeout):
        return None
    if isinstance(health, dict) and str(health.get('app') or '').lower() == 'formpublisher':
        return url
    return None


def publisher_url() -> str:
    explicit = os.getenv('FORMWEB_FORMPUBLISHER_URL', '').strip()
    if explicit:
        return explicit.rstrip('/')
    return _engine_file_url() or DEFAULT_URL


def inbox_folder() -> Path:
    return publisher_home() / 'inbox'


def _post(url: str, data: bytes, headers: dict[str, str]) -> dict | None:
    """The receipt on success, None when nothing answered, an EngineError when FormPublisher answered with a refusal."""
    request = urllib.request.Request(url + '/api/receive/formweb', data=data, method='POST', headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode('utf-8') or '{}')
            return body if isinstance(body, dict) else {}
    except urllib.error.HTTPError as error:
        detail = ''
        code = ''
        try:
            parsed = json.loads(error.read().decode('utf-8', 'replace'))
            detail = str(parsed.get('detail') or parsed.get('error') or parsed.get('message') or '') if isinstance(parsed, dict) else ''
            found = parsed.get('code') if isinstance(parsed, dict) else None
            code = found if isinstance(found, str) and re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,63}', found) else ''
        except ValueError:
            pass
        if code:  # FormPublisher's error code ends the text so the editor can show it and act on it
            raise EngineError(f'FormPublisher refused this site [{code}]: {detail or error.reason}', 502)
        raise EngineError(f'FormPublisher refused the site ({error.code}): {detail or error.reason}', 502)
    except (urllib.error.URLError, socket.timeout, ConnectionError, TimeoutError, OSError):
        return None


def _to_inbox(data: bytes, name: str, project: str) -> Path:
    folder = inbox_folder()
    folder.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:60] or 'site'
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target = folder / f'{slug}-{stamp}.zip'
    counter = 2
    while target.exists():
        target = folder / f'{slug}-{stamp}-{counter}.zip'
        counter += 1
    temp = folder / f'.{target.name}.part'
    # The metadata lands first, so FormPublisher files the zip as a revision of the same site a live send would use.
    meta = folder / f'{target.name}.json'
    try:
        meta.write_text(json.dumps({'siteName': name, 'project': project, 'version': VERSION}), encoding='utf-8')
        temp.write_bytes(data)
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)
    return target


@router.post('/api/handoff/formpublisher')
async def send_to_formpublisher(locale: str | None = None):
    state = await studio.state()
    name = str(state['site'].get('name') or 'Site')
    project = studio.access.project_key()
    data, manifest = await studio.export_zip(locale)
    warnings = [str(w) for w in (manifest.get('warnings') or [])] if isinstance(manifest, dict) else []
    headers = {
        'Content-Type': 'application/zip',
        'X-FormWeb-Version': VERSION,
        'X-FormWeb-Site-Name': quote(name, safe=''),
        'X-FormWeb-Project': quote(str(project), safe=''),
    }
    local_forms = [str(page) for page in (manifest.get('localForms') or [])][:20] if isinstance(manifest, dict) else []
    receipt = await asyncio.to_thread(_post, publisher_url(), data, headers)
    if receipt is not None:
        return {'delivered': 'live', 'site': receipt.get('site'), 'revision': receipt.get('revision'), 'warnings': warnings, 'localForms': local_forms}
    path = await asyncio.to_thread(_to_inbox, data, name, str(project))
    return {'delivered': 'inbox', 'path': str(path), 'warnings': warnings, 'localForms': local_forms}
