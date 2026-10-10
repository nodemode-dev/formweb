import os

from ..engine import EngineError
from ..service import studio
from .commerce import ShopifyCommerce
from .common import status, store
from .data import DataProviders
from .deployment import CloudflarePages
from .insights import ConsentedInsights
from .visitor import VisitorMembership


class ProviderService:
    def __init__(self):
        self.data = DataProviders()
        self.deployment = CloudflarePages()
        self.commerce = ShopifyCommerce()
        self.visitor = VisitorMembership()
        self.insights = ConsentedInsights()

    async def dispatch_tool(self, name, args):
        read = {'provider_status', 'list_translation_reviews', 'list_provider_deployments', 'get_provider_deployment', 'get_domain_status', 'get_commerce_catalog', 'get_commerce_orders', 'list_visitor_members', 'get_insights'}
        publish = {'deploy_remote', 'attach_domain'}
        manage = {'manage_visitor_member', 'sync_commerce_catalog'}
        studio.access.authorize('read' if name in read else 'publish' if name in publish else 'manage' if name in manage else 'edit')
        state = await studio.state()
        site = state['site']
        if name == 'provider_status':
            return {'translation': {'provider': 'LibreTranslate', **status('FORMWEB_TRANSLATE_URL')}, 'deployment': {'provider': 'Cloudflare Pages', **status('FORMWEB_CLOUDFLARE_TOKEN', 'FORMWEB_CLOUDFLARE_ACCOUNT', 'FORMWEB_CLOUDFLARE_PROJECT')}, 'commerce': {'provider': 'Shopify', **status('FORMWEB_SHOPIFY_SHOP', 'FORMWEB_SHOPIFY_PRIVATE_TOKEN'), 'webhook': status('FORMWEB_SHOPIFY_WEBHOOK_SECRET')}, 'fetch': {'sources': self.data.sources(), 'requiredEnvironment': ['FORMWEB_FETCH_SOURCES', 'FORMWEB_FETCH_HOSTS']}, 'membership': {'provider': 'FormWeb visitor store', 'status': 'local', 'signupEnabled': os.getenv('FORMWEB_MEMBER_SIGNUP', '1') == '1'}, 'analytics': {'status': 'local', 'consentRequired': True}}
        if name == 'request_translation':
            output = await self.data.translate(studio, args)
        elif name == 'list_translation_reviews':
            return {'reviews': [item for item in store.list('translations') if item['site'] == site['id']]}
        elif name == 'review_translation':
            output = await self.data.review(studio, args['id'], args)
        elif name == 'deploy_remote':
            output = await self.deployment.deploy(studio, args.get('locale'))
        elif name == 'list_provider_deployments':
            return {'deployments': [item for item in store.list('deployments') if item['site'] == site['id']]}
        elif name == 'get_provider_deployment':
            owned = store.get('deployments', args['id'])
            if not owned or owned['site'] != site['id']:
                raise EngineError('Deployment was not found for this site.', 404)
            return await self.deployment.deployment(args['id'])
        elif name in ('attach_domain', 'get_domain_status'):
            output = await self.deployment.domains(args.get('name') if name == 'attach_domain' else None)
        elif name == 'fetch_external_data':
            output = await self.data.fetch(args['source'], args.get('params'))
        elif name == 'sync_commerce_catalog':
            output = await self.commerce.sync(site['id'])
        elif name == 'get_commerce_catalog':
            return self.commerce.catalog(site['id'])
        elif name == 'get_commerce_orders':
            return {'orders': [item for item in store.list('orders') if site['id'] in item.get('sites', [])], 'checkouts': [{name: value for name, value in item.items() if name != 'cartId'} for item in store.list('checkouts') if item['site'] == site['id']]}
        elif name == 'list_visitor_members':
            return {'members': self.visitor.members(site['id'])}
        elif name == 'manage_visitor_member':
            output = self.visitor.manage(site['id'], args['email'], args)
        elif name == 'get_insights':
            return self.insights.metrics(site)
        else:
            raise EngineError('Unknown provider operation.', 404)
        studio.access.record(name, {'siteId': site['id']})
        return output


providers = ProviderService()


async def dispatch_tool(name, args):
    return await providers.dispatch_tool(name, args)
