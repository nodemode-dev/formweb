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
VERSION = '0.18.7'
PORT = int(os.getenv('FORMWEB_PORT', '8240'))
CORE_NAME = 'formweb-core.exe' if os.name == 'nt' else 'formweb-core'
CORE_BIN = Path(os.getenv('FORMWEB_CORE_BIN', str(BUNDLE / 'bin' / CORE_NAME if FROZEN else ROOT / 'native/target/release' / CORE_NAME)))
DATA_DIR = Path(os.getenv('FORMWEB_DATA_DIR', str(ROOT / 'Data' if FROZEN else ROOT / 'backend/data'))).resolve()
FRONTEND_DIST = Path(os.getenv('FORMWEB_FRONTEND_DIST', str(BUNDLE / 'frontend_dist' if FROZEN else ROOT / 'frontend/dist'))).resolve()
AUTH_TOKEN = os.getenv('FORMWEB_AUTH_TOKEN', '')
ORIGINS = tuple(x.strip() for x in os.getenv('FORMWEB_ORIGINS', f'http://localhost:5240,http://127.0.0.1:5240,http://localhost:5241,http://127.0.0.1:5241,http://localhost:{PORT},http://127.0.0.1:{PORT}').split(',') if x.strip())
PUBLIC_BASE = f'http://127.0.0.1:{PORT}'
MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
MAX_FORM_BYTES = 65536
MAX_FORM_UPLOAD_BYTES = 4 * 1024 * 1024
MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024
