import hashlib
import hmac
import time

from .common import store


def token(request, name, cookie):
    preview = request.scope.get('formweb.previewToken') if request.scope.get('formweb.preview') else None
    value = request.headers.get('X-FormWeb-' + name, '') if preview else request.cookies.get(cookie, '')
    if not value or len(value) > 256:
        return ''
    digest = hashlib.sha256(value.encode()).hexdigest()
    binding = store.get('preview-' + name.lower(), digest)
    if preview:
        expected = hashlib.sha256(preview.encode()).hexdigest()
        if not binding or binding.get('expires', 0) <= time.time() or not hmac.compare_digest(binding.get('preview', ''), expected):
            return ''
    elif binding:
        return ''
    return value


def bind(request, name, value):
    preview = request.scope.get('formweb.previewToken') if request.scope.get('formweb.preview') else None
    if not preview:
        return False
    digest = hashlib.sha256(value.encode()).hexdigest()
    store.put('preview-' + name.lower(), digest, {'preview': hashlib.sha256(preview.encode()).hexdigest(), 'expires': time.time() + 3600})
    return True
