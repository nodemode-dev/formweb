import hmac
import os
import secrets
import time
from contextvars import ContextVar

HEADER = 'x-formweb-window-key'
STDOUT_ENV = 'FORMWEB_WINDOW_KEY_STDOUT'
LINE = 'formweb-window-key: '
REFUSED = 'Only the FormWeb window can do this.'
TICKET_LIFE = 30.0
READS = ('GET', 'HEAD', 'OPTIONS')
BOOTSTRAP = '/api/window/key'
OPEN = ('/mcp', BOOTSTRAP)
WINDOW_ONLY = ('/api/agents', '/api/approvals/settings', '/api/terminal', '/api/chat', '/api/window/ticket')
SECRET_READS = ('/api/approvals', '/api/terminal/sessions')
KEY = secrets.token_urlsafe(32)
STATE = {'claimed': False, 'secondClaim': False}
TICKETS: dict[str, float] = {}
window = ContextVar('formweb_window', default=False)


def stdout_mode() -> bool:
    return os.environ.get(STDOUT_ENV) == '1'


def valid(value) -> bool:
    return isinstance(value, str) and bool(value) and hmac.compare_digest(value.encode('utf-8'), KEY.encode('utf-8'))


def window_only(path: str) -> bool:
    return any(path == item or path.startswith(item + '/') for item in WINDOW_ONLY)


def needs_key(method: str, path: str, root: bool) -> bool:
    if method in READS:
        return path in SECRET_READS and root
    if path in OPEN:
        return False
    return root or window_only(path)


def claim() -> str | None:
    if STATE['claimed']:
        STATE['secondClaim'] = True
        return None
    STATE['claimed'] = True
    return KEY


def ticket() -> str:
    now = time.monotonic()
    for old in [item for item, at in TICKETS.items() if now - at > TICKET_LIFE]:
        TICKETS.pop(old, None)
    value = secrets.token_urlsafe(24)
    TICKETS[value] = now
    return value


def spend(value) -> bool:
    if not isinstance(value, str) or not value:
        return False
    at = TICKETS.pop(value, None)
    return at is not None and time.monotonic() - at <= TICKET_LIFE
