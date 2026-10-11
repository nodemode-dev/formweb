"""Brand check (FW-067): find off-brand colors, fonts and logos on a page and propose one-command fixes.

The brand kit is document data (see frontend/src/features/brand-kit.ts): typed color tokens named brand-[name], typed
text tokens named brand-font-[name], and settings brandLogo and brandLogoDark. A style value is on-brand when it uses
var(--brand-...) or is neutral (inherit, transparent, currentColor, none, initial, unset). Anything else in a color
or font property is reported with the nearest brand value as its fix. Fixes are ordinary engine commands, so the
editor applies them as one undo step and an agent can pass them straight to apply_commands.
"""
import re
from typing import Any

COLOR_PROPS = ('color', 'background', 'background-color', 'border-color', 'outline-color', 'fill', 'stroke')
FONT_PROPS = ('font-family',)
NEUTRAL = {'', 'inherit', 'transparent', 'currentcolor', 'none', 'initial', 'unset', 'revert'}
HEX = re.compile(r'#([0-9a-fA-F]{3,8})\b')
RGB = re.compile(r'rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})')
NAMED = {'black': (0, 0, 0), 'white': (255, 255, 255), 'red': (255, 0, 0), 'green': (0, 128, 0), 'blue': (0, 0, 255), 'gray': (128, 128, 128), 'grey': (128, 128, 128), 'orange': (255, 165, 0)}


def kit(site: dict[str, Any]) -> dict[str, Any]:
    typed = ((site.get('extensions') or {}).get('design') or {}).get('tokens') or {}
    settings = site.get('settings') or {}
    colors = {name: item['value'] for name, item in typed.items() if name.startswith('brand-') and not name.startswith('brand-font-') and item.get('type') == 'color'}
    fonts = {name: item['value'] for name, item in typed.items() if name.startswith('brand-font-') and item.get('type') == 'text'}
    logos = [url for url in (settings.get('brandLogo'), settings.get('brandLogoDark')) if url]
    return {'colors': colors, 'fonts': fonts, 'logos': logos, 'restricted': settings.get('brandRestrict') == 'true'}


def rgb(value: str):
    value = value.strip().lower()
    match = HEX.search(value)
    if match:
        digits = match.group(1)
        if len(digits) in (3, 4):
            digits = ''.join(c * 2 for c in digits[:3])
        return tuple(int(digits[i:i + 2], 16) for i in (0, 2, 4))
    match = RGB.search(value)
    if match:
        return tuple(min(255, int(n)) for n in match.groups())
    return NAMED.get(value)


def nearest_color(value: str, colors: dict[str, str]):
    target = rgb(value)
    best = None
    for name, brand_value in colors.items():
        candidate = rgb(brand_value)
        if target is None or candidate is None:
            continue
        distance = sum((a - b) ** 2 for a, b in zip(target, candidate))
        if best is None or distance < best[1]:
            best = (name, distance)
    if best:
        return best[0]
    return next(iter(colors), None)


def nearest_font(value: str, fonts: dict[str, str]):
    first = value.split(',')[0].strip().strip('"\'').lower()
    for name, stack in fonts.items():
        if first and first == stack.split(',')[0].strip().strip('"\'').lower():
            return name
    serif = 'serif' in value.lower() and 'sans' not in value.lower()
    for name, stack in fonts.items():
        if serif == ('serif' in stack.lower() and 'sans' not in stack.lower()):
            return name
    return next(iter(fonts), None)


def on_brand(value: str) -> bool:
    text = (value or '').strip().lower()
    return text in NEUTRAL or text.startswith('var(--brand-') or 'var(--brand-' in text and not HEX.search(text) and not RGB.search(text)


def descendants(nodes: dict[str, Any], root: str) -> list[str]:
    order, stack, seen = [], [root], set()
    while stack:
        node_id = stack.pop()
        if node_id in seen or node_id not in nodes:
            continue
        seen.add(node_id)
        order.append(node_id)
        stack.extend(reversed(nodes[node_id].get('children', [])))
    return order


def check(state: dict[str, Any], page_id: str | None = None) -> dict[str, Any]:
    site = state['site']
    brand = kit(site)
    pages = [page for page in site['pages'] if page_id in (None, page['id'], page['slug'])]
    if page_id and not pages:
        raise ValueError('Unknown page. Pass a page ID or slug from formweb://site/tree.')
    issues = []
    for page in pages:
        for node_id in descendants(site['nodes'], page['root']):
            node = site['nodes'][node_id]
            scopes = [('desktop', node.get('styles') or {})] + [(bp, styles or {}) for bp, styles in (node.get('breakpoints') or {}).items()]
            for scope, styles in scopes:
                for prop, value in styles.items():
                    if value is None or on_brand(str(value)):
                        continue
                    if prop in COLOR_PROPS and not any(part in str(value).lower() for part in ('gradient', 'url(')):
                        # A non-brand token is compared by the color it holds (var(--paper) -> its #hex).
                        token = re.fullmatch(r'\s*var\(--([\w-]+)\)\s*', str(value))
                        resolved = (site.get('tokens') or {}).get(token.group(1), str(value)) if token else str(value)
                        suggestion = nearest_color(resolved, brand['colors'])
                        kind = 'color'
                    elif prop in FONT_PROPS:
                        suggestion = nearest_font(str(value), brand['fonts'])
                        kind = 'font'
                    else:
                        continue
                    if not suggestion:
                        # The kit defines nothing of this kind yet, so there is no brand to be off; stay quiet.
                        continue
                    replacement = f'var(--{suggestion})'
                    patch = {'styles': {prop: replacement}} if scope == 'desktop' else {'breakpoints': {scope: {prop: replacement}}}
                    issues.append({
                        'id': f'{node_id}:{scope}:{prop}', 'page': page['id'], 'node': node_id, 'name': node.get('name', node_id),
                        'kind': kind, 'property': prop, 'breakpoint': scope, 'value': value, 'suggestion': replacement,
                        'fix': {'command': 'node.update', 'params': {'id': node_id, 'patch': patch}},
                    })
            src = (node.get('attrs') or {}).get('src', '')
            label = f"{node.get('name', '')} {(node.get('attrs') or {}).get('alt', '')}".lower()
            if node.get('tag') == 'img' and 'logo' in label and brand['logos'] and src not in brand['logos']:
                issues.append({
                    'id': f'{node_id}:logo', 'page': page['id'], 'node': node_id, 'name': node.get('name', node_id), 'kind': 'logo',
                    'property': 'src', 'breakpoint': 'desktop', 'value': src, 'suggestion': brand['logos'][0],
                    'fix': {'command': 'node.update', 'params': {'id': node_id, 'patch': {'attrs': {'src': brand['logos'][0]}}}},
                })
    empty = not brand['colors'] and not brand['fonts'] and not brand['logos']
    return {
        'revision': state.get('revision'), 'pages': [page['id'] for page in pages], 'brand': brand, 'issues': issues,
        'summary': {kind: sum(1 for issue in issues if issue['kind'] == kind) for kind in ('color', 'font', 'logo')},
        'note': 'The brand kit is empty; add colors, fonts or a logo in Window > Brand kit first.' if empty else
                'Apply an issue\'s fix (or all fixes) with apply_commands; each fix replaces the value with the nearest brand token.',
    }
