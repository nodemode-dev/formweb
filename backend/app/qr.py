import io
import re

from .engine import EngineError

URL = re.compile(r'^https?://[^\s<>"]+$')
COLOR = re.compile(r'#[0-9a-fA-F]{6}')


def qr_image(url: str, kind: str = 'svg', dark: str = '#000000', light: str = '#ffffff', scale: int = 8) -> tuple[bytes, str, str]:
    """Return (bytes, media type, download filename) for a QR code that encodes url."""
    import segno
    if len(url) > 2048 or not URL.match(url):
        raise EngineError('QR codes encode an http or https URL up to 2048 characters.', 422)
    if kind not in ('svg', 'png') or not all(COLOR.fullmatch(c) for c in (dark, light)) or not 1 <= scale <= 32:
        raise EngineError('Use format svg or png, colors as #rrggbb and a scale from 1 to 32.', 422)
    buffer = io.BytesIO()
    segno.make(url, error='m', micro=False).save(buffer, kind=kind, scale=scale, dark=dark, light=light, border=4)
    name = re.sub(r'[^a-z0-9]+', '-', url.lower().split('://', 1)[-1]).strip('-')[:60] or 'site'
    return buffer.getvalue(), 'image/svg+xml' if kind == 'svg' else 'image/png', f'qr-{name}.{kind}'
