import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import time
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit
from uuid import uuid4

from ..engine import EngineError
from .common import key, redact, remote, required, store


VARIANT_FIELDS = 'id title sku availableForSale quantityAvailable selectedOptions {name value} price {amount currencyCode} image {url altText}'


class ShopifyCommerce:
    def __init__(self):
        self.sync_lock = asyncio.Lock()
        self.webhook_lock = asyncio.Lock()

    def configuration(self):
        shop, token = required('FORMWEB_SHOPIFY_SHOP', 'FORMWEB_SHOPIFY_PRIVATE_TOKEN')
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com', shop):
            raise EngineError('FORMWEB_SHOPIFY_SHOP must be a myshopify.com hostname.', 503)
        version = os.getenv('FORMWEB_SHOPIFY_VERSION', '2026-10')
        if not re.fullmatch(r'20[0-9]{2}-(01|04|07|10)', version):
            raise EngineError('Shopify API version is invalid.', 503)
        endpoint = os.getenv('FORMWEB_SHOPIFY_API', 'https://' + shop + '/api/' + version + '/graphql.json')
        if endpoint != 'https://' + shop + '/api/' + version + '/graphql.json' and not (os.getenv('FORMWEB_PROVIDER_ALLOW_LOOPBACK') == '1' and urlsplit(endpoint).hostname in ('127.0.0.1', 'localhost', '::1')):
            raise EngineError('Shopify API override is restricted to explicit loopback fixtures.', 503)
        return endpoint, token

    async def query(self, query, variables=None, address=None):
        endpoint, token = self.configuration()
        headers = {'Shopify-Storefront-Private-Token': token}
        if address:
            headers['Shopify-Storefront-Buyer-IP'] = address
        result = await remote('POST', endpoint, headers=headers, json={'query': query, 'variables': variables or {}})
        if not isinstance(result, dict) or result.get('errors') or not isinstance(result.get('data'), dict):
            raise EngineError('Shopify rejected the query or token permissions.', 502)
        return redact(result['data'], (token,))

    def variant(self, value):
        if not isinstance(value, dict) or not isinstance(value.get('id'), str) or not re.fullmatch(r'gid://shopify/ProductVariant/[0-9]+', value['id']):
            raise EngineError('Shopify returned an invalid variant.', 502)
        price = value.get('price')
        if not isinstance(price, dict) or not isinstance(price.get('amount'), str) or not re.fullmatch(r'[A-Z]{3}', str(price.get('currencyCode', ''))):
            raise EngineError('Shopify returned an invalid variant price.', 502)
        try:
            amount = Decimal(price.get('amount', ''))
            if not amount.is_finite() or amount < 0:
                raise InvalidOperation()
        except (InvalidOperation, TypeError):
            raise EngineError('Shopify returned an invalid variant price.', 502)
        quantity = value.get('quantityAvailable')
        if quantity is not None and (type(quantity) is not int or quantity < 0):
            raise EngineError('Shopify returned invalid inventory.', 502)
        return {**value, 'inventoryKnown': quantity is not None, 'quantityAvailable': quantity, 'availableForSale': value.get('availableForSale') is True}

    def connection(self, value, seen):
        if not isinstance(value, dict) or not isinstance(value.get('nodes'), list) or len(value['nodes']) > 100 or any(not isinstance(item, dict) for item in value['nodes']):
            raise EngineError('Shopify returned an invalid catalog connection.', 502)
        info = value.get('pageInfo')
        if not isinstance(info, dict) or type(info.get('hasNextPage')) is not bool:
            raise EngineError('Shopify returned invalid pagination.', 502)
        if info['hasNextPage']:
            cursor = info.get('endCursor')
            if not isinstance(cursor, str) or not 1 <= len(cursor) <= 1024 or cursor in seen or not value['nodes']:
                raise EngineError('Shopify pagination did not make bounded progress.', 502)
            seen.add(cursor)
        return value

    async def sync(self, site_id):
        async with self.sync_lock:
            products, cursor, seen = [], None, set()
            while True:
                query = 'query Catalog($cursor:String){products(first:100,after:$cursor){nodes{id title handle description featuredImage{url altText} variants(first:100){nodes{' + VARIANT_FIELDS + '} pageInfo{hasNextPage endCursor}}} pageInfo{hasNextPage endCursor}}}'
                response = await self.query(query, {'cursor': cursor})
                connection = self.connection(response.get('products'), seen)
                for product in connection['nodes']:
                    if not isinstance(product.get('id'), str) or not re.fullmatch(r'gid://shopify/Product/[0-9]+', product['id']) or not isinstance(product.get('title'), str):
                        raise EngineError('Shopify returned an invalid product.', 502)
                    variant_seen = set()
                    variants = self.connection(product.pop('variants', None), variant_seen)
                    collected = [self.variant(value) for value in variants['nodes']]
                    while variants['pageInfo']['hasNextPage']:
                        if len(collected) >= 2500:
                            raise EngineError('Variant synchronization exceeded its bounded capacity.', 502)
                        more = await self.query('query Variants($id:ID!,$cursor:String){node(id:$id){... on Product{variants(first:100,after:$cursor){nodes{' + VARIANT_FIELDS + '} pageInfo{hasNextPage endCursor}}}}}', {'id': product['id'], 'cursor': variants['pageInfo']['endCursor']})
                        node = more.get('node')
                        variants = self.connection(node.get('variants') if isinstance(node, dict) else None, variant_seen)
                        collected.extend(self.variant(value) for value in variants['nodes'])
                    if len(collected) > 2500:
                        raise EngineError('Variant synchronization exceeded its bounded capacity.', 502)
                    product['variants'] = collected
                    products.append(product)
                if len(products) > 2500:
                    raise EngineError('Catalog synchronization exceeded its bounded capacity.', 502)
                if not connection['pageInfo']['hasNextPage']:
                    break
                if len(products) >= 2500:
                    raise EngineError('Catalog synchronization exceeded its bounded capacity.', 502)
                cursor = connection['pageInfo']['endCursor']
            output = {'provider': 'Shopify', 'status': 'ready', 'products': products, 'synced': time.time(), 'inventoryAuthority': 'Shopify availability is rechecked before every cart creation.', 'remoteVerified': not os.getenv('FORMWEB_SHOPIFY_API')}
            return store.put('catalogs', site_id, output)

    def catalog(self, site_id):
        result = store.get('catalogs', site_id)
        if not result:
            raise EngineError('Catalog has not been synchronized. Configure Shopify and synchronize it in the editor.', 503)
        return result

    async def cart(self, site_id, payload, address):
        self.configuration()
        lines = payload.get('lines')
        if not isinstance(lines, list) or not 1 <= len(lines) <= 50:
            raise EngineError('Supply 1 to 50 cart lines.')
        quantities = {}
        for line in lines:
            if not isinstance(line, dict) or set(line) - {'variantId', 'quantity'} or not re.fullmatch(r'gid://shopify/ProductVariant/[0-9]+', str(line.get('variantId', ''))) or type(line.get('quantity')) is not int or not 1 <= line['quantity'] <= 100:
                raise EngineError('Cart lines require a Shopify variant ID and quantity from 1 to 100.')
            quantities[line['variantId']] = quantities.get(line['variantId'], 0) + line['quantity']
        fresh = await self.query('query Availability($ids:[ID!]!){nodes(ids:$ids){... on ProductVariant{' + VARIANT_FIELDS + '}}}', {'ids': list(quantities)}, address)
        available = {item['id']: self.variant(item) for item in fresh.get('nodes', []) if item}
        for variant_id, quantity in quantities.items():
            item = available.get(variant_id)
            if not item or not item['availableForSale'] or item['quantityAvailable'] is not None and quantity > item['quantityAvailable'] or quantity > 100:
                raise EngineError('A cart variant is unavailable or exceeds current inventory.', 409)
        discounts = payload.get('discountCodes', [])
        if not isinstance(discounts, list) or len(discounts) > 10 or any(not isinstance(value, str) or len(value) > 128 for value in discounts):
            raise EngineError('Discount codes must be bounded strings.')
        cart_input = {'lines': [{'merchandiseId': variant_id, 'quantity': quantity} for variant_id, quantity in quantities.items()], 'discountCodes': discounts}
        result = await self.query('mutation Checkout($input:CartInput!){cartCreate(input:$input){cart{id checkoutUrl totalQuantity cost{totalAmount{amount currencyCode}}} userErrors{field message} warnings{code message}}}', {'input': cart_input}, address)
        response = result.get('cartCreate', {})
        if response.get('userErrors') or not isinstance(response.get('cart'), dict):
            raise EngineError('Shopify rejected the cart. Check current variants and discount codes.', 409)
        cart = response['cart']
        if urlsplit(cart.get('checkoutUrl', '')).scheme != 'https' or not isinstance(cart.get('id'), str):
            raise EngineError('Shopify did not return a hosted HTTPS checkout URL.', 502)
        checkout_id = uuid4().hex
        store.put('checkouts', checkout_id, {'id': checkout_id, 'site': site_id, 'cartId': cart['id'], 'lines': lines, 'status': 'pending', 'created': time.time()})
        return {'id': checkout_id, 'provider': 'Shopify', 'status': 'pending', 'checkoutUrl': cart['checkoutUrl'], 'cart': cart, 'warnings': response.get('warnings', []), 'paymentConfirmed': False}

    async def webhook(self, body, headers):
        secret, shop = required('FORMWEB_SHOPIFY_WEBHOOK_SECRET', 'FORMWEB_SHOPIFY_SHOP')
        digest = base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()
        if not hmac.compare_digest(digest, headers.get('x-shopify-hmac-sha256', '')) or headers.get('x-shopify-shop-domain') != shop:
            raise EngineError('Shopify webhook signature or shop is invalid.', 401)
        event_id = key(headers.get('x-shopify-webhook-id'), 'webhook ID')
        topic = headers.get('x-shopify-topic')
        if topic not in ('orders/create', 'orders/paid', 'orders/cancelled', 'orders/updated'):
            raise EngineError('Shopify webhook topic is unsupported.', 400)
        try:
            payload = json.loads(body)
        except (ValueError, UnicodeDecodeError) as error:
            raise EngineError('Shopify webhook body is invalid JSON.') from error
        if not isinstance(payload, dict) or not isinstance(payload.get('id'), (str, int)):
            raise EngineError('Shopify webhook has no order ID.')
        async with self.webhook_lock:
            if store.get('webhook-events', event_id):
                return {'accepted': True, 'duplicate': True}
            order_id = str(payload['id'])
            old = store.get('orders', order_id, {})
            financial = 'paid' if topic == 'orders/paid' else 'cancelled' if topic == 'orders/cancelled' else payload.get('financial_status', 'pending')
            if financial not in ('pending', 'authorized', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'voided', 'cancelled'):
                raise EngineError('Shopify order status is unsupported.')
            ranks = {'pending': 0, 'authorized': 1, 'partially_paid': 2, 'paid': 3, 'partially_refunded': 4, 'refunded': 5, 'voided': 5, 'cancelled': 5}
            if ranks.get(old.get('status'), -1) > ranks[financial]:
                financial = old['status']
            token = str(payload.get('cart_token') or '')
            matched = []
            for checkout in store.list('checkouts', 2000):
                cart_token = checkout['cartId'].split('/Cart/', 1)[-1].split('?', 1)[0]
                if token and hmac.compare_digest(token, cart_token):
                    checkout.update({'status': financial, 'orderId': order_id, 'updated': time.time()})
                    store.put('checkouts', checkout['id'], checkout)
                    matched.append(checkout['site'])
            record = {'id': order_id, 'sites': sorted(set(matched + old.get('sites', []))), 'status': financial, 'provider': 'Shopify', 'updated': time.time(), 'topic': topic, 'total': str(payload.get('total_price', '')), 'currency': str(payload.get('currency', ''))}
            store.put('orders', order_id, record)
            store.put('webhook-events', event_id, {'id': event_id, 'order': order_id, 'received': time.time()})
            return {'accepted': True, 'duplicate': False, 'order': record}
