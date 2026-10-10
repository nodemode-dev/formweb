import asyncio
import json
from urllib.parse import urlsplit

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse

from ..engine import EngineError
from ..service import studio
from .common import key, rate_limit, store
from .service import dispatch_tool, providers

from .tokens import bind

router = APIRouter()


async def body(request, allowed, required=()):
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > 65536:
            raise EngineError('Provider request body exceeds 64 KiB.', 413)
    try:
        payload = json.loads(content or b'{}')
    except (ValueError, UnicodeDecodeError) as error:
        raise EngineError('Provider request requires valid JSON.') from error
    if not isinstance(payload, dict) or set(payload) - set(allowed) or set(required) - set(payload):
        raise EngineError('Provider request contains unsupported or missing fields.')
    return payload


async def runtime_site(request):
    site_id = request.query_params.get('site')
    slug, version = request.query_params.get('slug'), request.query_params.get('version')
    if request.scope.get('formweb.preview'):
        site = studio.releases.preview_site(request.scope['formweb.previewToken'])
        if site_id and site_id != site['id']:
            raise EngineError('Preview site does not match the active document.', 404)
        return site
    if not site_id:
        raise EngineError('Runtime requests require a published site identifier.', 400)
    key(site_id, 'site')
    if slug is not None or version is not None:
        if not slug or not version:
            raise EngineError('Published runtime requires both slug and version.')
        site = studio.store.publication_site(site_id, slug, version)
    else:
        site = studio.store.published_site(site_id)
    if not site:
        raise EngineError('Published runtime site was not found.', 404)
    return site


def address(request):
    return request.client.host if request.client else 'local'


def response(value):
    return JSONResponse(value, headers={'Cache-Control': 'private, no-store'})


@router.get('/api/providers/status')
async def provider_status():
    return await dispatch_tool('provider_status', {})


@router.get('/api/providers/translations')
async def translations():
    return await dispatch_tool('list_translation_reviews', {})


@router.post('/api/providers/translations')
async def translate(request: Request):
    return await dispatch_tool('request_translation', await body(request, ('target', 'source', 'entries'), ('target', 'entries')))


@router.post('/api/providers/translations/{queue_id}/review')
async def review(queue_id: str, request: Request):
    return await dispatch_tool('review_translation', {'id': queue_id, **await body(request, ('accept', 'expectedRevision'), ('accept',))})


@router.post('/api/providers/deploy')
async def deploy(request: Request):
    return await dispatch_tool('deploy_remote', await body(request, ('locale',)))


@router.get('/api/providers/deployments')
async def deployments():
    return await dispatch_tool('list_provider_deployments', {})


@router.get('/api/providers/deployments/{deployment_id}')
async def deployment(deployment_id: str):
    return await dispatch_tool('get_provider_deployment', {'id': deployment_id})


@router.get('/api/providers/domains')
async def domains():
    return await dispatch_tool('get_domain_status', {})


@router.post('/api/providers/domains')
async def domain(request: Request):
    return await dispatch_tool('attach_domain', await body(request, ('name',), ('name',)))


@router.post('/api/providers/fetch/{source}')
async def fetch(source: str, request: Request):
    return await dispatch_tool('fetch_external_data', {'source': source, **await body(request, ('params',))})


@router.get('/api/providers/fetch/{source}/status')
async def fetch_status(source: str):
    studio.access.authorize('read')
    return providers.data.fetch_states.get(key(source), {'source': source, 'status': 'idle'})


@router.post('/api/providers/commerce/sync')
async def sync_commerce():
    return await dispatch_tool('sync_commerce_catalog', {})


@router.get('/api/providers/commerce/catalog')
async def catalog():
    return await dispatch_tool('get_commerce_catalog', {})


@router.get('/api/providers/commerce/orders')
async def orders():
    return await dispatch_tool('get_commerce_orders', {})


@router.post('/api/providers/commerce/webhook')
async def webhook(request: Request):
    output = bytearray()
    async for chunk in request.stream():
        output.extend(chunk)
        if len(output) > 1024 * 1024:
            raise EngineError('Order webhook exceeds 1 MiB.', 413)
    return await providers.commerce.webhook(bytes(output), request.headers)


@router.get('/api/providers/members')
async def members():
    return await dispatch_tool('list_visitor_members', {})


@router.post('/api/providers/members/{email}')
async def member(email: str, request: Request):
    return await dispatch_tool('manage_visitor_member', {'email': email, **await body(request, ('groups', 'disabled'), ('groups',))})


@router.get('/api/providers/insights')
async def insights():
    return await dispatch_tool('get_insights', {})


@router.get('/api/runtime/data/{source}')
async def runtime_data(source: str, request: Request):
    site = await runtime_site(request)
    rate_limit.check('fetch:' + address(request), 30)
    widgets = site.get('extensions', {}).get('integrations', {}).get('widgets', {})
    if not any(item.get('type') == 'fetch' and item.get('source') == source for item in widgets.values()):
        raise EngineError('Data source is not bound to this published site.', 403)
    params = {name: value for name, value in request.query_params.items() if name not in ('site', 'slug', 'version', 'previewToken')}
    return response(await providers.data.fetch(source, params, public=True))


@router.get('/api/runtime/commerce/catalog')
async def runtime_catalog(request: Request):
    site = await runtime_site(request)
    return response(providers.commerce.catalog(site['id']))


@router.post('/api/runtime/commerce/cart')
async def runtime_cart(request: Request):
    site = await runtime_site(request)
    rate_limit.check('cart:' + address(request), 12)
    return response(await providers.commerce.cart(site['id'], await body(request, ('lines', 'discountCodes'), ('lines',)), address(request)))


@router.post('/api/runtime/member/register')
async def register(request: Request):
    site = await runtime_site(request)
    payload = await body(request, ('email', 'password'), ('email', 'password'))
    output = await asyncio.to_thread(providers.visitor.register, site['id'], payload, address(request))
    if request.scope.get('formweb.preview'):
        token, current = await asyncio.to_thread(providers.visitor.login, site['id'], payload, address(request))
        bind(request, 'Visitor', token)
        output.update({**current, 'visitorToken': token})
    return response(output)


@router.post('/api/runtime/member/login')
async def login(request: Request):
    site = await runtime_site(request)
    payload = await body(request, ('email', 'password'), ('email', 'password'))
    token, output = await asyncio.to_thread(providers.visitor.login, site['id'], payload, address(request))
    if bind(request, 'Visitor', token):
        return response({**output, 'visitorToken': token})
    result = response(output)
    result.set_cookie('formweb_visitor', token, httponly=True, secure=request.url.scheme == 'https', samesite='strict', path='/', max_age=43200)
    return result


@router.post('/api/runtime/member/logout')
async def logout(request: Request):
    await runtime_site(request)
    result = response(providers.visitor.logout(request))
    result.delete_cookie('formweb_visitor', path='/', httponly=True, samesite='strict')
    return result


@router.get('/api/runtime/member/session')
async def session(request: Request):
    site = await runtime_site(request)
    return response(providers.visitor.session(request, site['id']))


@router.post('/api/runtime/consent')
async def consent(request: Request):
    site = await runtime_site(request)
    payload = await body(request, ('analytics',), ('analytics',))
    token, output = providers.insights.consent(request, site['id'], payload['analytics'])
    if token and bind(request, 'Consent', token):
        return response({**output, 'consentToken': token})
    result = response(output)
    if token:
        result.set_cookie('formweb_consent', token, httponly=True, secure=request.url.scheme == 'https', samesite='strict', path='/', max_age=90 * 86400)
    else:
        result.delete_cookie('formweb_consent', path='/', httponly=True, samesite='strict')
    return result


@router.get('/api/runtime/experiment/{name}')
async def experiment(name: str, request: Request):
    site = await runtime_site(request)
    return response(providers.insights.assign(request, site, name))


@router.post('/api/runtime/event')
async def event(request: Request):
    site = await runtime_site(request)
    payload = await body(request, ('name', 'path', 'experiment', 'variant', 'value'), ('name',))
    return response(providers.insights.event(request, site, payload, address(request)))
