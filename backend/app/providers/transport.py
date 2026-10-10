import asyncio
import http.client
import ipaddress
import json
import os
import socket
from urllib.parse import urlsplit

import httpx2

from ..delivery import PinnedConnection
from ..engine import EngineError


async def pinned_json(method, url, maximum=4 * 1024 * 1024, **kwargs):
    parsed = urlsplit(url)
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    try:
        addresses = await asyncio.wait_for(asyncio.get_running_loop().getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM), 3)
    except (OSError, asyncio.TimeoutError) as error:
        raise EngineError('Provider host could not be resolved.', 502) from error
    ips = sorted({item[4][0] for item in addresses})
    fixture = os.getenv('FORMWEB_PROVIDER_ALLOW_LOOPBACK') == '1' and parsed.hostname in ('127.0.0.1', 'localhost', '::1')
    if not ips or any(not (ipaddress.ip_address(address).is_global or fixture and ipaddress.ip_address(address).is_loopback) for address in ips):
        raise EngineError('Provider destination address is not permitted.', 403)
    try:
        request = httpx2.Request(method, url, **kwargs)
        content = request.read()
    except (ValueError, TypeError) as error:
        raise EngineError('Provider request configuration is invalid.', 503) from error
    target = request.url.raw_path.decode('ascii')
    headers = {name.decode('ascii'): value.decode('latin-1') for name, value in request.headers.raw if name.lower() != b'host'}
    host = '[' + parsed.hostname + ']' if ':' in parsed.hostname else parsed.hostname
    headers['Host'] = host + (':' + str(port) if port not in (80, 443) else '')
    def send():
        connection = PinnedConnection(parsed.hostname, port, ips[0], parsed.scheme == 'https')
        connection.timeout = 30
        try:
            connection.request(method, target, body=content, headers=headers)
            result = connection.getresponse()
            output = result.read(maximum + 1)
            if len(output) > maximum:
                raise EngineError('Provider response exceeds the configured limit.', 502)
            if not 200 <= result.status < 300:
                raise EngineError('Provider returned HTTP ' + str(result.status) + '.', 502)
            try:
                return json.loads(output)
            except (ValueError, UnicodeDecodeError) as error:
                raise EngineError('Provider returned invalid JSON.', 502) from error
        finally:
            connection.close()
    try:
        return await asyncio.to_thread(send)
    except (OSError, http.client.HTTPException) as error:
        raise EngineError('Provider transport failed or timed out.', 502) from error
