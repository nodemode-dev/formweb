"""AI copy (FW-070) and prompt-to-site (FW-069) through the family's language-model setting in formvis.

formvis keeps one language-model setting for the family: any OpenAI-compatible chat service, on this computer (Ollama,
LM Studio) or hosted (OpenAI, OpenRouter, DeepSeek), with its address, model and key in formvis (Preferences >
Plugins). FormWeb sends a conversation to formvis's /api/llm/chat with no tools and reads the reply; the key never
leaves formvis. Nothing the model returns is applied directly:

- copy() returns a suggestion for one text element. The editor shows it beside the current text and replaces it only
  when the person accepts (one node.update); agents get the suggestion and apply it themselves.
- plan() asks for a site outline as JSON, then validates and clamps it (pages, sections, items, text lengths). build()
  turns an outline into ordinary engine commands: new pages with headers, sections, headings, text, cards, buttons
  and contact forms, styled with the site's brand tokens when it has them. One batch, one undo step, every element
  editable like any other. Nothing existing is changed or removed.
"""
import json
import re
import secrets

from .background import FORMVIS_URL, START_HINT
from .engine import EngineError

KINDS = ('hero', 'features', 'about', 'testimonials', 'faq', 'cta', 'contact', 'text')
TONES = ('friendly', 'professional', 'confident', 'playful', 'calm')
ACTIONS = {
    'rewrite': 'Rewrite it so it reads better, keeping the meaning and roughly the same length.',
    'shorten': 'Make it about half as long, keeping the essential point.',
    'lengthen': 'Make it about twice as long with concrete, specific detail; do not invent facts, prices or names.',
    'tone': 'Rewrite it in a {tone} tone, keeping the meaning and roughly the same length.',
    'generate': 'Write new text for this element from the brief.',
}
COPY_RULE = 'Reply with the new text only: no preamble, no quotes, no markdown, no explanation.'
PLAN_RULE = ('Reply with one JSON object only, no markdown fences, in this shape: '
             '{"site":"name","pages":[{"name":"Home","slug":"/","description":"one sentence for search engines",'
             '"sections":[{"kind":"hero|features|about|testimonials|faq|cta|contact|text","heading":"...","body":"...",'
             '"items":[{"title":"...","text":"..."}],"button":{"label":"...","href":"/contact"}}]}]}. '
             'At most 4 pages and 6 sections a page; items only for features, testimonials and faq (at most 4). '
             'Keep every text short and concrete. Do not invent prices, statistics, names of real people or reviews; '
             'testimonials must be marked as placeholders to replace.')


def _chat(messages: list[dict]) -> str:
    from .imagegen import _json
    try:
        reply = _json('/api/llm/chat', {'messages': messages, 'tools': False}, timeout=200.0)
    except EngineError as error:
        message = str(error)
        if 'Set a language model first' in message:
            raise EngineError('No language model is set in formvis yet: add one in formvis Preferences > Plugins (local Ollama or LM Studio, or a hosted service with your key).', 428) from error
        raise
    return (reply.get('content') or '').strip()


def status(studio) -> dict:
    studio.access.authorize('read')
    from .imagegen import _json
    try:
        info = _json('/api/llm/status', timeout=3.0)
    except EngineError as error:
        return {'available': False, 'note': str(error)}
    if not info.get('configured'):
        return {'available': False, 'note': 'formvis is running but has no language model set: add one in formvis Preferences > Plugins (local Ollama or LM Studio, or a hosted service with your key).'}
    host = re.sub(r'^https?://', '', info.get('baseUrl', '')).split('/')[0]
    local = host.split(':')[0] in ('localhost', '127.0.0.1', '::1')
    return {'available': True, 'model': info.get('model'), 'where': 'this computer' if local else host,
            'note': f'Writing with {info.get("model")} on {"this computer" if local else host}, set in formvis.'}


def _clean(text: str) -> str:
    text = re.sub(r'^```[a-z]*\s*|\s*```$', '', text.strip())
    if len(text) > 1 and text[0] == text[-1] and text[0] in '"\'':
        text = text[1:-1]
    return text.strip()


async def copy(studio, node_id: str, action: str, tone: str | None = None, brief: str | None = None) -> dict:
    """A suggestion for one element's text. Nothing changes until it is accepted."""
    studio.access.authorize('edit')
    if action not in ACTIONS:
        raise EngineError(f'Action must be one of {", ".join(ACTIONS)}.')
    if action == 'tone' and tone not in TONES:
        raise EngineError(f'Tone must be one of {", ".join(TONES)}.')
    state = await studio.state()
    node = state['site']['nodes'].get(node_id) if isinstance(node_id, str) else None
    if not node:
        raise EngineError('Unknown element. Read formweb://site/tree for element IDs.', 404)
    current = node.get('text') or ''
    if action != 'generate' and not current.strip():
        raise EngineError('This element has no text yet; use generate with a brief.', 422)
    if action == 'generate' and not (brief or '').strip():
        raise EngineError('Describe what the text should say (brief).', 422)
    page = next((p for p in state['site']['pages'] if node_id in _descendants(state['site']['nodes'], p['root'])), None)
    role = {'h1': 'main page heading', 'h2': 'section heading', 'h3': 'small heading', 'p': 'paragraph', 'a': 'link or button label', 'button': 'button label', 'li': 'list item'}.get(node.get('tag', ''), 'text')
    limit = {'main page heading': 80, 'section heading': 80, 'small heading': 60, 'link or button label': 30, 'button label': 30}.get(role, 600)
    instruction = ACTIONS[action].format(tone=tone or '')
    system = (f'You write website copy for "{state["site"].get("name", "a website")}"'
              f'{", page " + page["name"] if page else ""}. The text is a {role}; keep it under {limit} characters. {COPY_RULE}')
    user = f'Brief: {brief.strip()[:1500]}' if action == 'generate' else f'{instruction}\n\nText:\n{current[:4000]}'
    if action == 'generate' and current.strip():
        user += f'\n\nCurrent text, for reference:\n{current[:2000]}'
    suggestion = _clean(_chat([{'role': 'system', 'content': system}, {'role': 'user', 'content': user if action == 'generate' else user}]))[:limit * 2]
    if not suggestion:
        raise EngineError('The model returned no text. Try again, or another model.', 502)
    studio.access.record('ai.copy', {'node': node_id, 'action': action})
    return {'node': node_id, 'action': action, 'tone': tone, 'original': current, 'suggestion': suggestion,
            'apply': {'command': 'node.update', 'params': {'id': node_id, 'patch': {'text': suggestion}}},
            'note': 'Review it first: accept applies it as one undo step. Check facts, names and prices yourself.'}


def _descendants(nodes: dict, root: str) -> set:
    found, stack = set(), [root]
    while stack:
        nid = stack.pop()
        if nid in found or nid not in nodes:
            continue
        found.add(nid)
        stack.extend(nodes[nid].get('children', []))
    return found


def _text(value, limit: int) -> str:
    return re.sub(r'\s+', ' ', str(value or '')).strip()[:limit]


def _slug(raw: str, taken: set) -> str:
    base = '/' + re.sub(r'[^a-z0-9]+', '-', str(raw or '').lower()).strip('-')[:40]
    base = '/' if base == '/' else base.rstrip('-')
    if base == '/' and base in taken:  # the site already has a home page: the generated one becomes /home
        base = '/home'
    slug, n = base, 2
    while slug in taken:
        slug, n = f'{base.rstrip("/") or "/home"}-{n}', n + 1
    taken.add(slug)
    return slug


def validate(raw, max_pages: int = 4, source: str = 'model') -> dict:
    """Clamp an outline (the model's, or one an agent or person edited) to what build() accepts. Anything unexpected is
    dropped, never executed."""
    unusable = ('The model did not return a usable site outline. Try again, simplify the request, or use a stronger model.' if source == 'model'
                else 'This outline is not usable: it needs pages, each with at least one section (the shape plan returns).')
    if not isinstance(raw, dict) or not isinstance(raw.get('pages'), list) or not raw['pages']:
        raise EngineError(unusable, 502 if source == 'model' else 422)
    pages = []
    for page in raw['pages'][:max(1, min(max_pages, 4))]:
        if not isinstance(page, dict):
            continue
        sections = []
        for section in (page.get('sections') or [])[:6]:
            if not isinstance(section, dict):
                continue
            kind = section.get('kind') if section.get('kind') in KINDS else 'text'
            items = [{'title': _text(i.get('title'), 80), 'text': _text(i.get('text'), 300)} for i in (section.get('items') or [])[:4] if isinstance(i, dict) and (i.get('title') or i.get('text'))] if kind in ('features', 'testimonials', 'faq') else []
            button = section.get('button') if isinstance(section.get('button'), dict) and section['button'].get('label') else None
            href = _text((button or {}).get('href'), 200)
            if button and not (href.startswith('/') or href.startswith('#') or re.match(r'^https?://', href)):
                href = '#'
            sections.append({'kind': kind, 'heading': _text(section.get('heading'), 120), 'body': str(section.get('body') or '').strip()[:1200],
                             'items': items, 'button': {'label': _text(button['label'], 40), 'href': href} if button else None})
        if sections:
            pages.append({'name': _text(page.get('name'), 60) or 'Page', 'slug': _text(page.get('slug'), 60), 'description': _text(page.get('description'), 160), 'sections': sections})
    if not pages:
        raise EngineError(unusable, 502 if source == 'model' else 422)
    return {'site': _text(raw.get('site'), 80), 'pages': pages}


def _parse(content: str) -> dict:
    text = _clean(content)
    start, end = text.find('{'), text.rfind('}')
    if start < 0 or end <= start:
        raise EngineError('The model did not reply with an outline (no JSON found). Try again, or a model that follows instructions more closely.', 502)
    try:
        return json.loads(text[start:end + 1])
    except ValueError as error:
        raise EngineError('The model\'s outline was cut short or malformed. Ask for fewer pages, or try again.', 502) from error


async def plan(studio, prompt: str, pages: int = 3) -> dict:
    studio.access.authorize('edit')
    prompt = (prompt or '').strip()
    if not 10 <= len(prompt) <= 4000:
        raise EngineError('Describe the site in 10 to 4,000 characters: what it is for, who it is for, and what pages it needs.')
    pages = max(1, min(int(pages), 4))
    content = _chat([{'role': 'system', 'content': f'You plan small websites. {PLAN_RULE}'},
                     {'role': 'user', 'content': f'Plan a site with up to {pages} page{"s" if pages > 1 else ""}.\n\n{prompt}'}])
    outline = validate(_parse(content), pages)
    taken = {p['slug'] for p in (await studio.state())['site']['pages']}
    for page in outline['pages']:  # the outline shows the addresses the build will really use
        page['slug'] = _slug(page['slug'] or page['name'], taken)
    studio.access.record('ai.plan', {'pages': len(outline['pages'])})
    return {'plan': outline, 'summary': [{'page': p['name'], 'sections': [f'{s["kind"]}: {s["heading"]}' for s in p['sections']]} for p in outline['pages']],
            'note': 'Review the outline, then build it: it adds new editable pages in one undo step and changes nothing that exists.'}


def _luminance(hex_value: str) -> float | None:
    match = re.fullmatch(r'#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})', (hex_value or '').strip())
    if not match:
        return None
    digits = match.group(1) if len(match.group(1)) == 6 else ''.join(c * 2 for c in match.group(1))
    def channel(v):
        v = int(v, 16) / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(digits[i:i + 2]) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


SECTION = '#1d2026'


def _styles(site: dict) -> dict:
    """Accent: among brand and library colours readable on the section background (WCAG contrast 3 or more), the most
    saturated, so a button looks like an accent rather than paper; else orange."""
    typed = (((site.get('extensions') or {}).get('design') or {}).get('tokens') or {})
    base = _luminance(SECTION)
    best = None
    for name, item in typed.items():
        value = item.get('value', '')
        lum = _luminance(value) if item.get('type') == 'color' and name.startswith(('brand-', 'lib-')) else None
        if lum is not None:
            contrast = (max(lum, base) + 0.05) / (min(lum, base) + 0.05)
            digits = value.strip().lstrip('#')
            rgb = [int((digits if len(digits) == 6 else ''.join(c * 2 for c in digits))[i:i + 2], 16) for i in (0, 2, 4)]
            saturation = (max(rgb) - min(rgb)) / max(max(rgb), 1)
            if contrast >= 3 and (best is None or (saturation, contrast) > best[1]):
                best = (name, (saturation, contrast), lum)
    accent, lum = (f'var(--{best[0]})', best[2]) if best else ('#f97316', _luminance('#f97316'))
    font = next((f'var(--{name})' for name, item in typed.items() if name.startswith(('brand-font-', 'lib-')) and item.get('type') == 'text'), None)
    return {'accent': accent, 'on_accent': '#111111' if lum > 0.18 else '#ffffff', 'font': font}


def build_commands(site: dict, outline: dict) -> tuple[list[dict], list[dict]]:
    look = _styles(site)
    tag = secrets.token_hex(3)
    counter = iter(range(1, 100000))
    def nid(kind: str) -> str:
        return f'gen-{tag}-{kind}-{next(counter)}'
    commands, made = [], []
    taken = {p['slug'] for p in site['pages']}
    slugs = [_slug(p['slug'] or p['name'], taken) for p in outline['pages']]
    links = list(zip([p['name'] for p in outline['pages']], slugs))
    def node(parent, tag_, name, text='', styles=None, attrs=None, kind='n', breakpoints=None):
        key = nid(kind)
        body = {'id': key, 'tag': tag_, 'name': name[:80], 'text': text, 'styles': styles or {}, 'attrs': attrs or {}}
        if breakpoints:
            body['breakpoints'] = breakpoints
        commands.append({'command': 'node.add', 'params': {'parent': parent, 'node': body}})
        return key
    heading_font = {'font-family': look['font']} if look['font'] else {}
    for page, slug in zip(outline['pages'], slugs):
        page_id, root = nid('page'), nid('root')
        commands.append({'command': 'page.add', 'params': {'name': page['name'], 'slug': slug, 'id': page_id, 'root': root}})
        if page['description']:
            commands.append({'command': 'page.update', 'params': {'id': page_id, 'patch': {'seo': {'title': f'{page["name"]} | {outline["site"] or site.get("name", "")}'.strip(' |'), 'description': page['description']}}}})
        if len(links) > 1:
            header = node(root, 'header', 'Header', '', {'display': 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'gap': '24px', 'padding': '0 0 32px'}, kind='header')
            node(header, 'a', 'Site name', outline['site'] or site.get('name', 'Home'), {'font-weight': '700', 'font-size': '18px', 'color': 'inherit', 'text-decoration': 'none', **heading_font}, {'href': slugs[0]})
            nav = node(header, 'nav', 'Navigation', '', {'display': 'flex', 'gap': '20px', 'flex-wrap': 'wrap'}, {'aria-label': 'Main'}, kind='nav')
            for label, href in links:
                node(nav, 'a', f'{label} link', label, {'color': 'inherit', 'text-decoration': 'none', 'opacity': '0.8'}, {'href': href})
        has_h1 = False  # every generated page gets exactly one h1: the hero's, or else the first section heading
        for section in page['sections']:
            kind = section['kind']
            centred = kind in ('cta', 'hero')
            main_heading = not has_h1 and bool(section['heading']) and (kind == 'hero' or not any(s['kind'] == 'hero' and s['heading'] for s in page['sections']))
            has_h1 = has_h1 or main_heading
            box = node(root, 'section', f'{kind.capitalize()} section', '', {'display': 'flex', 'flex-direction': 'column', 'gap': '20px', 'padding': '72px 48px' if kind == 'hero' else '56px 48px',
                       'align-items': 'center' if centred else 'stretch', 'text-align': 'center' if centred else 'left', 'border-radius': '16px', 'margin-bottom': '24px',
                       'background': '#1d2026' if kind != 'cta' else 'color-mix(in srgb, ' + look['accent'] + ' 18%, #1d2026)'},
                       kind='section', breakpoints={'mobile': {'padding': '40px 20px'}})
            if section['heading']:
                node(box, 'h1' if main_heading else 'h2', 'Heading', section['heading'], {'margin': '0', 'font-size': '48px' if kind == 'hero' else '32px', 'line-height': '1.15', **heading_font},
                     breakpoints={'mobile': {'font-size': '32px' if kind == 'hero' else '26px'}})
            for paragraph in [p.strip() for p in section['body'].split('\n\n') if p.strip()][:4]:
                node(box, 'p', 'Text', paragraph[:600], {'margin': '0', 'font-size': '18px', 'line-height': '1.6', 'color': '#b7becb', 'max-width': '720px'})
            if section['items']:
                grid = node(box, 'div', 'Items', '', {'display': 'grid', 'grid-template-columns': f'repeat({min(3, len(section["items"]))}, minmax(0, 1fr))', 'gap': '20px'},
                            kind='grid', breakpoints={'mobile': {'grid-template-columns': '1fr'}})
                for item in section['items']:
                    card = node(grid, 'blockquote' if kind == 'testimonials' else 'article', 'Item', '', {'margin': '0', 'padding': '24px', 'background': '#252933', 'border-radius': '12px', 'display': 'flex', 'flex-direction': 'column', 'gap': '8px'}, kind='card')
                    if kind == 'testimonials':
                        node(card, 'p', 'Quote', item['text'] or item['title'], {'margin': '0', 'font-size': '16px', 'line-height': '1.6'})
                        node(card, 'p', 'Attribution', item['title'] or 'Placeholder: replace with a real customer', {'margin': '0', 'font-size': '14px', 'color': '#8a93a3'})
                    else:
                        if item['title']:
                            node(card, 'h3', 'Item title', item['title'], {'margin': '0', 'font-size': '20px', **heading_font})
                        if item['text']:
                            node(card, 'p', 'Item text', item['text'], {'margin': '0', 'font-size': '16px', 'line-height': '1.6', 'color': '#b7becb'})
            if kind == 'contact':
                form = node(box, 'form', 'Contact form', '', {'display': 'flex', 'flex-direction': 'column', 'gap': '12px', 'max-width': '480px'}, {'name': 'contact'}, kind='form')
                node(form, 'label', 'Email label', 'Email address', {'font-size': '14px'})
                node(form, 'input', 'Email input', '', {'padding': '14px', 'background': '#14161b', 'border': '1px solid #444a55', 'color': '#fff', 'border-radius': '6px'}, {'type': 'email', 'name': 'email', 'required': '', 'aria-label': 'Email address', 'placeholder': 'you@example.com'})
                node(form, 'label', 'Message label', 'Message', {'font-size': '14px'})
                node(form, 'textarea', 'Message input', '', {'padding': '14px', 'min-height': '120px', 'background': '#14161b', 'border': '1px solid #444a55', 'color': '#fff', 'border-radius': '6px'}, {'name': 'message', 'aria-label': 'Message'})
                node(form, 'button', 'Send button', 'Send message', {'padding': '14px', 'background': look['accent'], 'border': '0', 'border-radius': '6px', 'color': look['on_accent'], 'font-weight': '600'}, {'type': 'submit'})
            if section['button'] and kind != 'contact':
                node(box, 'a', 'Button', section['button']['label'], {'display': 'inline-flex', 'align-self': 'center' if centred else 'flex-start', 'padding': '14px 24px', 'background': look['accent'], 'color': look['on_accent'], 'border-radius': '8px', 'text-decoration': 'none', 'font-weight': '600'}, {'href': section['button']['href']})
        made.append({'page': page_id, 'name': page['name'], 'slug': slug, 'root': root})
    return commands, made


async def build(studio, outline: dict) -> dict:
    studio.access.authorize('edit')
    outline = validate(outline, source='caller')
    state = await studio.state()
    commands, made = build_commands(state['site'], outline)
    if len(commands) > 500:  # the engine's batch ceiling: keep the whole site one undo step by refusing, not splitting
        raise EngineError(f'This outline needs {len(commands)} commands; the limit for one undo step is 500. Remove a page or some sections and build again.', 413)
    result = await studio.mutate('batch', {'commands': commands})
    studio.access.record('ai.build', {'pages': [m['page'] for m in made]})
    return {'pages': made, 'state': result, 'message': f'Added {len(made)} page{"s" if len(made) != 1 else ""} as one undo step: {", ".join(m["name"] for m in made)}. Every element is editable; replace placeholders before publishing.'}
