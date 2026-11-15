import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

FROZEN = bool(getattr(sys, 'frozen', False))
BUNDLE = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[2]))
ROOT = Path(os.getenv('FORMWEB_HOME', str(Path.home() / 'FormWeb'))) if FROZEN else Path(__file__).resolve().parents[2]
if FROZEN:
    ROOT.mkdir(parents=True, exist_ok=True)
load_dotenv(ROOT / 'backend' / '.env')
VERSION = '0.21.0'
PORT = int(os.getenv('FORMWEB_PORT', '8240'))
CORE_NAME = 'formweb-core.exe' if os.name == 'nt' else 'formweb-core'
CORE_BIN = Path(os.getenv('FORMWEB_CORE_BIN', str(BUNDLE / 'bin' / CORE_NAME if FROZEN else ROOT / 'native/target/release' / CORE_NAME)))
DATA_DIR = Path(os.getenv('FORMWEB_DATA_DIR', str(ROOT / 'Data' if FROZEN else ROOT / 'backend/data'))).resolve()
FRONTEND_DIST = Path(os.getenv('FORMWEB_FRONTEND_DIST', str(BUNDLE / 'frontend_dist' if FROZEN else ROOT / 'frontend/dist'))).resolve()
AUTH_TOKEN = os.getenv('FORMWEB_AUTH_TOKEN', '')
ORIGINS = tuple(x.strip() for x in os.getenv('FORMWEB_ORIGINS', f'http://localhost:5240,http://127.0.0.1:5240,http://localhost:5241,http://127.0.0.1:5241,http://localhost:{PORT},http://127.0.0.1:{PORT}').split(',') if x.strip())
PUBLIC_BASE = f'http://127.0.0.1:{PORT}'
CLIP_SECONDS_DEFAULT = 15 * 60


def _clip_seconds() -> int:
    """FORMWEB_CLIP_SECONDS: a whole number from 10 to 3600; anything else falls back to 900 with one log line."""
    raw = os.getenv('FORMWEB_CLIP_SECONDS')
    if raw is None or not raw.strip():
        return CLIP_SECONDS_DEFAULT
    text = raw.strip()
    if text.isascii() and text.isdecimal() and 10 <= int(text) <= 3600:
        return int(text)
    logging.getLogger('uvicorn.error').warning('FORMWEB_CLIP_SECONDS=%r is not a whole number from 10 to 3600; clips live %d seconds.', raw, CLIP_SECONDS_DEFAULT)
    return CLIP_SECONDS_DEFAULT


CLIP_SECONDS = _clip_seconds()
MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
MAX_FORM_BYTES = 65536
MAX_FORM_UPLOAD_BYTES = 4 * 1024 * 1024
MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024
MAX_PROJECT_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_VIDEO_BYTES = 64 * 1024 * 1024
MAX_FONT_BYTES = 4 * 1024 * 1024
MAX_SVG_BYTES = 2 * 1024 * 1024
