"""Download one outside file the person ticked in a site import review, under fixed guards, and keep it in memory for
that review only. Every byte goes through `connect`, the one network seam: whatever replaces it, the address check,
the redirect rules, the time limit, the size caps and the content checks above it still run. A downloaded file is
data: nothing here runs it and no route serves it back."""
import http.client
import io
import ipaddress
import secrets
import socket
import ssl
import threading
import time
from urllib.parse import urljoin, urlsplit

from .config import MAX_FONT_BYTES
from .engine import EngineError
from .site_import import CSS_URL, JS_TYPES, URL_MAX, outside_file

KINDS = ('stylesheet', 'script', 'font')
CAPS = {'stylesheet': 256 * 1024, 'script': 512 * 1024, 'font': min(2 * 1024 * 1024, MAX_FONT_BYTES)}
NOUNS = {'stylesheet': 'stylesheet', 'script': 'script', 'font': 'font file'}
ACCEPT = {'stylesheet': 'text/css', 'script': 'text/javascript, application/javascript', 'font': 'font/woff2'}
SCRIPT_TYPES = frozenset(kind for kind in JS_TYPES if kind and kind != 'module')
SECONDS = 10.0
REDIRECTS = 3
MAX_ADDRESSES = 64
TOKEN_FILES = 30
TOKEN_BYTES = 8 * 1024 * 1024
TOKENS = 20
IDLE = 20 * 60
FONTS_LISTED = 20
FONT_RULES = 5000
WAIT = 30.0
CGNAT = ipaddress.ip_network('100.64.0.0/10')
NAT64 = (ipaddress.ip_network('64:ff9b::/96'), ipaddress.ip_network('64:ff9b:1::/48'))

_tokens: dict[str, dict] = {}
_guard = threading.Lock()


def _public(text: str) -> bool:
    try:
        address = ipaddress.ip_address(text.split('%', 1)[0])
    except ValueError:
        return False
    inner = []
    if address.version == 6:
        if address.ipv4_mapped:
            inner.append(address.ipv4_mapped)
        if address.sixtofour:
            inner.append(address.sixtofour)
        if address.teredo:
            inner.extend(address.teredo)
        if any(address in network for network in NAT64):
            inner.append(ipaddress.IPv4Address(int(address) & 0xFFFFFFFF))
            if address in NAT64[1]:
                return False
    if inner and not all(_public(str(item)) for item in inner):
        return False
    if address.version == 4 and address in CGNAT:
        return False
    if address.version == 6 and address.is_site_local:
        return False
    return (address.is_global and not address.is_private and not address.is_loopback and not address.is_link_local and not address.is_multicast
            and not address.is_reserved and not address.is_unspecified)


def _resolve(host: str, port: int, seconds: float) -> list[str]:
    found: list = []

    def lookup():
        try:
            found.append(socket.getaddrinfo(host, port, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP))
        except OSError as error:
            found.append(error)

    worker = threading.Thread(target=lookup, daemon=True)
    worker.start()
    worker.join(max(0.0, seconds))
    if not found:
        raise EngineError(f'{host} did not answer in time.', 504)
    if isinstance(found[0], Exception):
        raise EngineError(f'{host} could not be found.', 502)
    return [info[4][0] for info in found[0][:MAX_ADDRESSES + 1]]


def connect(host: str, port: int, pick, seconds: float):
    """The network seam: resolve the host once, hand every address to `pick` (which refuses or returns the one to use),
    open TCP to exactly that address and TLS verified for the host name. Returns a socket-like object with sendall,
    recv_into, settimeout and close."""
    address = pick(_resolve(host, port, seconds))
    raw = socket.socket(socket.AF_INET6 if ':' in address else socket.AF_INET, socket.SOCK_STREAM)
    try:
        raw.settimeout(max(0.1, seconds))
        raw.connect((address, port))
        context = ssl.create_default_context()
        context.check_hostname = True
        context.verify_mode = ssl.CERT_REQUIRED
        return context.wrap_socket(raw, server_hostname=host)
    except ssl.SSLCertVerificationError as error:
        raw.close()
        raise EngineError(f'{host} did not show a valid certificate for its name, so nothing was downloaded.', 502) from error
    except OSError as error:
        raw.close()
        raise EngineError(f'{host} could not be reached.', 502) from error


class _Raw(io.RawIOBase):
    """Reads from the seam's stream, never past the deadline: each read waits at most the time that is left."""

    def __init__(self, stream, deadline: float):
        self.stream, self.deadline = stream, deadline

    def readable(self):
        return True

    def readinto(self, buffer):
        left = self.deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError
        self.stream.settimeout(left)
        return self.stream.recv_into(buffer)


class _Socket:
    def __init__(self, stream, deadline: float):
        self.stream, self.deadline = stream, deadline

    def makefile(self, mode, *args, **kwargs):
        return io.BufferedReader(_Raw(self.stream, self.deadline), 8192)


def _check(url: str) -> dict:
    if not isinstance(url, str) or not url or len(url) > URL_MAX:
        raise EngineError(f'The address must be text of at most {URL_MAX:,} characters.')
    item = outside_file('x', url)
    parts = urlsplit(url) if item else None
    if item is None or parts.scheme.lower() != 'https':
        raise EngineError('Only https addresses on another host are downloaded.')
    if '@' in parts.netloc:
        raise EngineError('An address with a user name or password is not downloaded.')
    if ':' in item['host'] or (parts.port is not None and parts.port != 443):
        raise EngineError('Only the default https port is used.')
    if item['url'] != url:
        raise EngineError('The address is not in the form the review lists it.')
    return {'host': item['host'], 'url': item['url'].split('#', 1)[0]}


def _pick(addresses: list[str], host: str, picked: list) -> str:
    if not addresses:
        raise EngineError(f'{host} could not be found.', 502)
    if len(addresses) > MAX_ADDRESSES:
        raise EngineError(f'{host} answers with more than {MAX_ADDRESSES} addresses; it is not downloaded from.', 502)
    if not all(isinstance(a, str) and _public(a) for a in addresses):
        raise EngineError(f'{host} points at an address on this computer or a private network, so nothing was downloaded from it.', 403)
    picked.append(addresses[0])
    return addresses[0]


def _media(value: str | None) -> str:
    return (value or '').split(';', 1)[0].strip().lower()[:100]


def _get(url: str, kind: str) -> tuple[bytes, str, str]:
    """The body of one file and its media type, following at most REDIRECTS https redirects, all within SECONDS."""
    deadline = time.monotonic() + SECONDS
    current = _check(url)
    for hop in range(REDIRECTS + 1):
        parts = urlsplit(current['url'])
        picked: list = []
        stream = connect(current['host'], 443, lambda found, host=current['host'], into=picked: _pick(found, host, into), deadline - time.monotonic())
        try:
            if not picked:
                raise EngineError(f'{current["host"]} was reached without its address being checked, so nothing was downloaded.', 502)
            target = (parts.path or '/') + ('?' + parts.query if parts.query else '')
            request = (f'GET {target} HTTP/1.1\r\nHost: {current["host"]}\r\nUser-Agent: FormWeb\r\nAccept: {ACCEPT[kind]}\r\n'
                       'Accept-Encoding: identity\r\nConnection: close\r\n\r\n')
            if any(c in target for c in '\r\n ') or not request.isascii() or len(request) > URL_MAX + 400:
                raise EngineError('The address holds characters that cannot be sent.')
            stream.settimeout(max(0.1, deadline - time.monotonic()))
            stream.sendall(request.encode('ascii', 'strict'))
            response = http.client.HTTPResponse(_Socket(stream, deadline), method='GET')
            try:
                response.begin()
            except (http.client.HTTPException, ValueError) as error:
                raise EngineError(f'{current["host"]} answered with something that is not a web response.', 502) from error
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location') or ''
                if hop == REDIRECTS:
                    raise EngineError(f'The {NOUNS[kind]} redirects more than {REDIRECTS} times, so nothing was downloaded.', 502)
                if len(location) > URL_MAX or not location.strip():
                    raise EngineError(f'{current["host"]} redirects to an address that cannot be read.', 502)
                following = urljoin(current['url'], location.strip())
                if urlsplit(following).scheme.lower() != 'https':
                    raise EngineError(f'{current["host"]} redirects to an address that is not https, so nothing was downloaded.', 502)
                current = _check(following)
                continue
            if response.status != 200:
                raise EngineError(f'{current["host"]} answered {response.status} for the {NOUNS[kind]}.', 502)
            if _media(response.getheader('Content-Encoding')) not in ('', 'identity'):
                raise EngineError(f'{current["host"]} sent the {NOUNS[kind]} compressed although it was asked not to.', 502)
            media = _media(response.getheader('Content-Type'))
            body = bytearray()
            while True:
                chunk = response.read1(65536)
                if not chunk:
                    if response.length:
                        raise EngineError(f'The download of the {NOUNS[kind]} broke off before its end.', 502)
                    break
                body.extend(chunk)
                if len(body) > CAPS[kind]:
                    raise EngineError(f'The {NOUNS[kind]} is larger than {CAPS[kind] // 1024:,} KiB, the most that is downloaded for one.', 413)
            return bytes(body), media, current['host']
        except (TimeoutError, socket.timeout) as error:
            raise EngineError(f'The {NOUNS[kind]} took longer than {SECONDS:.0f} seconds to download, so it was left out.', 504) from error
        except (http.client.HTTPException, ssl.SSLError, OSError) as error:
            raise EngineError(f'The download of the {NOUNS[kind]} broke off.', 502) from error
        finally:
            try:
                stream.close()
            except Exception:
                pass
    raise EngineError(f'The {NOUNS[kind]} redirects more than {REDIRECTS} times, so nothing was downloaded.', 502)


def resolve(base: str, reference: str) -> str | None:
    """The absolute https address a reference in a downloaded stylesheet names, as the review would list it."""
    value = reference.strip()
    if not value or len(value) > URL_MAX or value[:5].lower() == 'data:':
        return None
    item = outside_file('font', urljoin(base, value))
    return item['url'] if item and item['url'].startswith('https://') else None


def font_faces(text: str):
    """Each @font-face rule of a stylesheet as (start, end) offsets, at most FONT_RULES, read without a regular expression."""
    lower, at, found = text.lower(), 0, []
    while len(found) < FONT_RULES:
        start = lower.find('@font-face', at)
        if start < 0:
            break
        opened = text.find('{', start)
        closed = text.find('}', opened) if opened >= 0 else -1
        if closed < 0:
            break
        found.append((start, closed + 1))
        at = closed + 1
    return found


def font_urls(text: str, base: str) -> list[str]:
    urls: list[str] = []
    for start, end in font_faces(text):
        for match in CSS_URL.finditer(text, start, end):
            url = resolve(base, next(g for g in match.group(1, 2, 3) if g is not None))
            if url and url not in urls:
                urls.append(url)
    return urls


def _sweep(now: float) -> None:
    for token in [t for t, entry in _tokens.items() if now - entry['last'] > IDLE]:
        del _tokens[token]


def _entry(token, create: bool) -> tuple[str, dict]:
    now = time.monotonic()
    with _guard:
        _sweep(now)
        if token is not None:
            if not isinstance(token, str) or token not in _tokens:
                raise EngineError('The files from the web chosen in this review were forgotten (more than 20 minutes passed or FormWeb restarted). Tick them again.', 410)
            entry = _tokens[token]
        elif create:
            while len(_tokens) >= TOKENS:
                del _tokens[min(_tokens, key=lambda t: _tokens[t]['last'])]
            token = secrets.token_urlsafe(24)
            entry = _tokens[token] = {'files': {}, 'last': now, 'lock': threading.Lock()}
        else:
            raise EngineError('Send the review token.')
        entry['last'] = now
        return token, entry


def _named(entry: dict) -> set:
    return {url for record in entry['files'].values() if record['kind'] == 'stylesheet' for url in record['fonts']}


def _answer(token: str, record: dict) -> dict:
    fonts = record['fonts'] if record['kind'] == 'stylesheet' else []
    return {'token': token, 'url': record['url'], 'kind': record['kind'], 'host': record['host'], 'bytes': len(record['body']), 'type': record['type'],
            'fonts': [{'url': url, 'host': urlsplit(url).hostname or ''} for url in fonts[:FONTS_LISTED]], 'fontsMore': max(0, len(fonts) - FONTS_LISTED)}


def fetch(url, kind, token) -> dict:
    if kind not in KINDS:
        raise EngineError('kind must be stylesheet, script or font.')
    checked = _check(url)
    token, entry = _entry(token, True)
    if not entry['lock'].acquire(timeout=WAIT):
        raise EngineError('Another file of this review is still downloading. Try again in a moment.', 429)
    try:
        if checked['url'] in entry['files']:
            record = entry['files'][checked['url']]
            if record['kind'] != kind:
                raise EngineError(f'That address was already downloaded as a {NOUNS[record["kind"]]}.')
            return _answer(token, record)
        if kind == 'font' and checked['url'] not in _named(entry):
            raise EngineError('A font file is downloaded only when a stylesheet downloaded in this review names it.')
        if len(entry['files']) >= TOKEN_FILES:
            raise EngineError(f'One review downloads at most {TOKEN_FILES} files.', 413)
        body, media, host = _get(checked['url'], kind)
        text = None
        if kind == 'font':
            if not body.startswith(b'wOF2'):
                raise EngineError('The font file is not WOFF2, the only font format a site stores.', 415)
        else:
            if kind == 'stylesheet' and media != 'text/css':
                raise EngineError(f'{host} serves the stylesheet as {media or "no type"}, not text/css, so it was left out.', 415)
            if kind == 'script' and media not in SCRIPT_TYPES:
                raise EngineError(f'{host} serves the script as {media or "no type"}, not JavaScript, so it was left out.', 415)
            try:
                text = body.decode('utf-8-sig')
            except UnicodeDecodeError as error:
                raise EngineError(f'The {NOUNS[kind]} is not UTF-8 text, so it was left out.', 415) from error
        if sum(len(r['body']) for r in entry['files'].values()) + len(body) > TOKEN_BYTES:
            raise EngineError(f'One review downloads at most {TOKEN_BYTES // 1048576} MiB in all.', 413)
        record = {'url': checked['url'], 'kind': kind, 'host': checked['host'], 'type': media, 'body': body, 'text': text,
                  'fonts': font_urls(text, checked['url']) if kind == 'stylesheet' else []}
        entry['files'][checked['url']] = record
        entry['last'] = time.monotonic()
        return _answer(token, record)
    finally:
        entry['lock'].release()


def drop(token, url) -> dict:
    with _guard:
        entry = _tokens.get(token) if isinstance(token, str) else None
        if entry is None:
            return {'ok': True}
        if url is None:
            del _tokens[token]
            return {'ok': True}
        if not isinstance(url, str) or len(url) > URL_MAX:
            raise EngineError('url must be text or null.')
        record = entry['files'].pop(url, None)
        if record and record['kind'] == 'stylesheet':
            still = _named(entry)
            for font in record['fonts']:
                if font not in still and entry['files'].get(font, {}).get('kind') == 'font':
                    del entry['files'][font]
        entry['last'] = time.monotonic()
    return {'ok': True}


def kept(token) -> dict | None:
    """The files kept under a token (url to record), or None when the token is unknown or forgotten."""
    with _guard:
        _sweep(time.monotonic())
        entry = _tokens.get(token) if isinstance(token, str) else None
        if entry is None:
            return None
        entry['last'] = time.monotonic()
        return dict(entry['files'])
