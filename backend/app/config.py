import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / 'backend' / '.env')
VERSION = '0.4.1'
PORT = int(os.getenv('FORMWEB_PORT', '8240'))
CORE_BIN = Path(os.getenv('FORMWEB_CORE_BIN', str(ROOT / 'native/target/release' / ('formweb-core.exe' if os.name == 'nt' else 'formweb-core'))))
DATA_DIR = Path(os.getenv('FORMWEB_DATA_DIR', str(ROOT / 'backend/data'))).resolve()
FRONTEND_DIST = Path(os.getenv('FORMWEB_FRONTEND_DIST', str(ROOT / 'frontend/dist'))).resolve()
AUTH_TOKEN = os.getenv('FORMWEB_AUTH_TOKEN', '')
ORIGINS = tuple(x.strip() for x in os.getenv('FORMWEB_ORIGINS', f'http://localhost:5240,http://127.0.0.1:5240,http://localhost:5241,http://127.0.0.1:5241,http://localhost:{PORT},http://127.0.0.1:{PORT}').split(',') if x.strip())
PUBLIC_BASE = f'http://127.0.0.1:{PORT}'
MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
MAX_FORM_BYTES = 65536
MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024
