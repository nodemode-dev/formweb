import hashlib
import hmac
import json
import secrets

SERVICE = 'FormWeb'
ACCOUNT = 'settings-seal'
FIELD = 'seal'
SEALED = ('agentDestructive', 'publishReview')
_CACHE: dict = {'tried': False, 'available': False, 'key': None}


def reset() -> None:
    _CACHE.update(tried=False, available=False, key=None)


def _load(create: bool) -> bytes | None:
    if _CACHE['tried'] and (_CACHE['key'] is not None or not _CACHE['available'] or not create):
        return _CACHE['key']
    _CACHE['tried'] = True
    try:
        import keyring

        stored = keyring.get_password(SERVICE, ACCOUNT)
        if not stored and create:
            keyring.set_password(SERVICE, ACCOUNT, secrets.token_hex(32))
            stored = keyring.get_password(SERVICE, ACCOUNT)
        key = bytes.fromhex(stored) if stored else None
    except Exception:
        _CACHE.update(available=False, key=None)
        return None
    _CACHE.update(available=True, key=key)
    return key


def digest(project: str, values: dict, key: bytes) -> str:
    body = json.dumps({'projectId': project, **{name: bool(values.get(name, False)) for name in SEALED}}, sort_keys=True, separators=(',', ':'))
    return hmac.new(key, body.encode('utf-8'), hashlib.sha256).hexdigest()


def effective(project: str, stored: dict) -> dict:
    values = {name: bool(stored.get(name, False)) for name in SEALED}
    key = _load(False)
    if not _CACHE['available']:
        return {**values, 'seal': 'unavailable', 'sealBroken': False}
    mark = stored.get(FIELD)
    if key is not None and isinstance(mark, str) and hmac.compare_digest(mark, digest(project, values, key)):
        return {**values, 'seal': 'ok', 'sealBroken': False}
    if not stored or values['agentDestructive']:
        return {**values, 'seal': 'unsealed', 'sealBroken': False}
    return {**values, 'agentDestructive': True, 'seal': 'broken', 'sealBroken': True}


def sign(project: str, values: dict) -> dict:
    record = {name: bool(values.get(name, False)) for name in SEALED}
    key = _load(True)
    return record if key is None else {**record, FIELD: digest(project, record, key)}
