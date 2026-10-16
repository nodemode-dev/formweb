import json

from fastapi import APIRouter, Request

from .assets import import_vector_svg
from .engine import EngineError

router = APIRouter()

SVG_LIMIT = 1024 * 1024


async def read_svg(request: Request) -> bytes:
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > SVG_LIMIT + 4096:
            raise EngineError('SVG is too large.', 413)
    if 'json' in request.headers.get('content-type', ''):
        try:
            body = json.loads(content or b'{}')
        except (ValueError, UnicodeDecodeError) as error:
            raise EngineError('Request body requires valid JSON.') from error
        text = body.get('svg') if isinstance(body, dict) else None
        if not isinstance(text, str) or not text.strip():
            raise EngineError('Body must be an object with an svg string.')
        return text.encode('utf-8')
    if not content:
        raise EngineError('Send the SVG as the request body or as {"svg": "..."}.')
    return bytes(content)


@router.post('/api/vector/import-svg')
async def import_svg(request: Request):
    data = await read_svg(request)
    if len(data) > SVG_LIMIT:
        raise EngineError('SVG is too large.', 413)
    try:
        cleaned = import_vector_svg(data)
    except UnicodeDecodeError as error:
        raise EngineError('SVG must be UTF-8 text.', 415) from error
    return {'svg': cleaned, 'bytes': len(cleaned.encode('utf-8'))}
