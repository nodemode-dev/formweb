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
- Small local models often cannot write a whole outline as JSON. When the reply is unusable, plan() drafts in guided
  mode: FormWeb chooses the structure and asks the model one short question per text (v0.5.7).
- reference() reads a PDF's text or an image's colours, which plan() uses as facts and build() as the accent; revising
  sends the current outline back with the person's instruction (v0.5.7).
"""
import asyncio
import base64
import io
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


async def _chat(messages: list[dict]) -> str:
    """One model turn, off the event loop so the editor and other requests keep working while the model writes."""
    from .imagegen import _json
    try:
        reply = await asyncio.to_thread(_json, '/api/llm/chat', {'messages': messages, 'tools': False}, timeout=200.0)
    except EngineError as error:
        message = str(error)
        if 'Set a language model first' in message:
            raise EngineError('No language model is set in formvis yet: add one in formvis Preferences > Plugins (local Ollama or LM Studio, or a hosted service with your key).', 428) from error
        raise
    return (reply.get('content') or '').strip()


async def status(studio) -> dict:
    studio.access.authorize('read')  # on the event loop: the access store is not shared across threads
    from .imagegen import _json
    try:
        info = await asyncio.to_thread(_json, '/api/llm/status', timeout=3.0)
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
    # An imperative request ("Write a ... for ...") is what small local models follow; a bare "Brief:" gets echoed.
    user = f'Write a {role} for this website: {brief.strip()[:1500]}' if action == 'generate' else f'{instruction}\n\nText:\n{current[:4000]}'
    if action == 'generate' and current.strip():
        user += f'\n\nCurrent text, for reference:\n{current[:2000]}'
    reply = _clean(await _chat([{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]))
    if current.strip() and reply.startswith(current.strip()) and len(reply) > len(current.strip()) + 20:
        reply = reply[len(current.strip()):]  # "the original, then Rewrite: the new text": keep the new text
    reply = _clean(re.sub(r'^(?:[^\n]*:[ \t]*\n)+', '', reply.strip()))  # leading "Rewrite:" or "Here it is:" lines
    # Headings and labels are one line: small models often add a second paragraph of commentary, which is dropped.
    # Paragraphs are capped near what was asked (about three times the current length at most), ending on a sentence.
    cap = limit * 2 if action == 'generate' else min(limit * 2, max(160, len(current) * 3))
    suggestion = _line(reply, limit) if limit <= 80 else _trim(reply, cap)
    if not suggestion:
        raise EngineError('The model returned no text. Try again, or another model.', 502)
    echoed = (_same(suggestion, current) or (action == 'generate' and _same(suggestion, brief or ''))
              or _same(suggestion[:30], instruction[:30]))  # the model repeated the request instead of answering it
    studio.access.record('ai.copy', {'node': node_id, 'action': action})
    return {'node': node_id, 'action': action, 'tone': tone, 'original': current, 'suggestion': suggestion, 'unchanged': echoed,
            'apply': {'command': 'node.update', 'params': {'id': node_id, 'patch': {'text': suggestion}}},
            'note': ('The model gave back the same words, which small models often do. Try again, another action, or a larger model in formvis.' if echoed
                     else 'Review it first: accept applies it as one undo step. Check facts, names and prices yourself.')}


def _trim(text: str, cap: int) -> str:
    if len(text) <= cap:
        return text
    cut = text[:cap]
    end = max(cut.rfind('. '), cut.rfind('! '), cut.rfind('? '), cut.rfind('.\n'))
    return cut[:end + 1] if end > cap // 3 else cut.rsplit(' ', 1)[0]


def _same(a: str, b: str) -> bool:
    squash = lambda s: re.sub(r'[\W_]+', '', s.lower())
    return bool(squash(a)) and squash(a) == squash(b)


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
    palette = _hexes(raw.get('palette'))
    return {'site': _text(raw.get('site'), 80), 'pages': pages, 'palette': palette}


def _parse(content: str) -> dict:
    text = _clean(content)
    start, end = text.find('{'), text.rfind('}')
    if start < 0 or end <= start:
        raise EngineError('The model did not reply with an outline (no JSON found). Try again, or a model that follows instructions more closely.', 502)
    try:
        return json.loads(text[start:end + 1])
    except ValueError as error:
        raise EngineError('The model\'s outline was cut short or malformed. Ask for fewer pages, or try again.', 502) from error


REFERENCE_LIMIT = 15 * 1024 * 1024
FACTS_LIMIT = 6000


def reference(name: str, data: bytes) -> dict:
    """What a reference file contributes: a PDF's text (facts for the outline) or an image's main colours (the accent).
    The file itself is not kept."""
    name = _text(name, 120) or 'reference'
    if not data or len(data) > REFERENCE_LIMIT:
        raise EngineError('A reference must be a PDF or an image of at most 15 MB.', 413 if data else 422)
    if data[:5] == b'%PDF-':
        from pypdf import PdfReader
        try:
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                raise EngineError('This PDF is password-protected; save an unprotected copy and add that.', 422)
            text = re.sub(r'\s+', ' ', ' '.join((page.extract_text() or '') for page in reader.pages[:20])).strip()
        except EngineError:
            raise
        except Exception as error:  # pypdf raises many types for damaged files
            raise EngineError('This PDF could not be read.', 422) from error
        if len(text) < 20:
            raise EngineError('This PDF has no readable text (it may be a scan). Type the key facts into the description instead.', 422)
        return {'kind': 'pdf', 'name': name, 'pages': len(reader.pages), 'text': text[:FACTS_LIMIT], 'truncated': len(text) > FACTS_LIMIT}
    from PIL import Image, UnidentifiedImageError
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.width * image.height > 40_000_000:  # a small file can declare a huge canvas; refuse before decoding
                raise EngineError('This image is too large to read (over 40 megapixels); use a smaller copy.', 413)
            image.thumbnail((96, 96))
            small = image.convert('RGB')
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise EngineError('A reference must be a PDF or an image (PNG, JPEG, WebP or GIF).', 422) from error
    counts = small.quantize(colors=8, method=Image.Quantize.MEDIANCUT).convert('RGB').getcolors(96 * 96) or []
    kept = []
    for _, rgb in sorted(counts, reverse=True):  # most used first; near-duplicates (antialiased edges) dropped
        if all(sum((a - b) ** 2 for a, b in zip(rgb, other)) > 32 ** 2 for other in kept):
            kept.append(rgb)
    return {'kind': 'image', 'name': name, 'colors': ['#%02x%02x%02x' % rgb for rgb in kept[:6]]}


async def reference_from(studio, asset: str | None, name: str | None, data: str | None) -> dict:
    """The agent path: an image already in the project (asset id) or a file sent as base64. Access checks stay on the
    event loop (the access store is not shared across threads); only reading the file runs in a worker."""
    studio.access.authorize('edit')
    if any(v is not None and not isinstance(v, str) for v in (asset, name, data)):
        raise EngineError('asset, name and data must be strings.', 422)
    if data and len(data) > REFERENCE_LIMIT * 4 // 3 + 4:
        raise EngineError('A reference must be a PDF or an image of at most 15 MB.', 413)
    if asset:
        from .assets import ASSET_NAME, asset_path, visible_assets
        asset = asset.rsplit('/', 1)[-1]
        if not ASSET_NAME.fullmatch(asset) or asset not in visible_assets(studio):
            raise EngineError('Unknown asset. Pass an asset id from the project, or name and data (base64).', 404)
        return await asyncio.to_thread(reference, name or asset, asset_path(asset).read_bytes())
    if not data:
        raise EngineError('Pass asset (an image in the project) or name and data (a PDF or image as base64).', 422)
    try:
        raw = base64.b64decode(data, validate=True)
    except ValueError as error:
        raise EngineError('data must be base64.', 422) from error
    return await asyncio.to_thread(reference, name or 'reference', raw)


def _hexes(value) -> list[str]:
    """Up to six #rrggbb colours from untrusted input; anything else (a number, a string, odd items) gives none."""
    return [c.lower() for c in value[:6] if isinstance(c, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', c)] if isinstance(value, list) else []


def _references(references) -> tuple[str, list[str], list[str]]:
    """Facts text, palette and names from reference() results passed back by the editor or an agent; anything else is
    ignored."""
    facts, palette, names = [], [], []
    for item in (references or [])[:6] if isinstance(references, list) else []:
        if not isinstance(item, dict):
            continue
        if isinstance(item.get('text'), str) and item['text'].strip():
            facts.append(_text(item['text'], FACTS_LIMIT))  # no file name: small models take "bakery-facts.pdf" for the site's name
        palette += _hexes(item.get('colors'))
        names.append(_text(item.get('name'), 120) or 'reference')
    return '\n'.join(facts)[:FACTS_LIMIT], list(dict.fromkeys(palette))[:6], names


def _line(reply: str, limit: int, quoted: bool = False) -> str:
    """The first real line of a small model's reply, without markdown, list markers, quotes or labels. With quoted, a
    phrase in quotes wins ('The website is called "Sourdough Serene"' gives the name)."""
    for raw in reply.replace('<<', '').replace('>>', '').splitlines():
        # markdown at the edges only: "C# lessons" and "#1 bakery" stay
        line = re.sub(r'^(?:#{1,6}\s+|>\s*)+', '', re.sub(r'\*\*|__|`', '', raw).strip()).strip('*_ ')
        line = re.sub(r'^(\d+[.)]|[-+•])\s*', '', line).strip()
        line = re.sub(r'^(headline|title|name|answer|sentence|tagline|heading|the website|website)\s*:\s*', '', line, flags=re.I).strip()
        inner = re.search(r'"([^"]{2,60})"', line) if quoted else None
        line = (inner.group(1) if inner else line).strip('"\'').strip()
        if re.search(r'\[[^\]]*\]', line) or line.endswith(':'):  # "[Your Name]" is a template; "Here is a version:" a preamble
            continue
        if len(line) >= 2:
            return line if len(line) <= limit else line[:limit].rsplit(' ', 1)[0].rstrip(' ,;:-')
    return ''


def _echo(answer: str, context: str) -> bool:
    """Small models often hand the description back instead of answering."""
    squash = lambda s: re.sub(r'[\W_]+', ' ', s.lower()).strip()
    a, c = squash(answer), squash(context)
    return bool(a) and (a[:40] == c[:40] or (len(a) >= 30 and a in c))


async def _ask(question: str, context: str, limit: int, fallback: str = '', quoted: bool = False) -> str:
    # The description first and the task last is the shape small models answer instead of echoing.
    answer = _line(await _chat([{'role': 'system', 'content': f'You write short, plain website copy. {COPY_RULE}'},
                                {'role': 'user', 'content': f'About the website: {context}\n\nTask: {question}'}]), limit, quoted)
    return fallback[:limit] if not answer or _echo(answer, context) else answer


def _names(listed: str) -> list[str]:
    """Item names from a list reply, or from one sentence that lists them ('... including bread and pastries')."""
    lines = [_line(raw, 300) for raw in listed.splitlines() if not raw.strip().endswith(':')]  # "Including:" heads a list
    lines = [line for line in lines if line]
    if len(lines) == 1:
        tail = re.split(r'\b(?:including|such as|like|offers?|sells?|provides?)\b', lines[0], maxsplit=1, flags=re.I)[-1]
        # commas separate items; "and" only before the last one, so "bread and butter pudding, cakes" stays whole
        lines = [part.strip(' .') for part in re.split(r',\s*(?:and\s+)?|\s+and\s+(?=[^,]*$)', tail) if 2 <= len(part.strip(' .')) <= 60]
    names = []
    for line in [_line(line, 60) for line in lines]:
        line = line[:1].upper() + line[1:]
        if line and line.lower() not in {n.lower() for n in names}:
            names.append(line)
    return names


GUIDED = {1: [('Home', '/', ('hero', 'features', 'about', 'contact'))],
          2: [('Home', '/', ('hero', 'features', 'about', 'cta')), ('Contact', '/contact', ('contact',))],
          3: [('Home', '/', ('hero', 'features', 'cta')), ('About', '/about', ('about',)), ('Contact', '/contact', ('contact',))],
          4: [('Home', '/', ('hero', 'features', 'cta')), ('About', '/about', ('about',)), ('Questions', '/questions', ('faq',)), ('Contact', '/contact', ('contact',))]}


async def _guided(context: str, pages: int) -> dict:
    """An outline FormWeb lays out itself, with each text written by the model in answer to one short question. Small
    local models answer these reliably where a whole JSON outline fails."""
    async def items(question: str, about: str) -> list[dict]:
        listed = await _chat([{'role': 'system', 'content': 'You write short, plain website copy.'},
                              {'role': 'user', 'content': f'About the website: {context}\n\nTask: {question}'}])
        found = []
        for name in [n for n in _names(listed) if not _echo(n, context)][:3]:
            found.append({'title': name, 'text': await _ask(f'Write one sentence for this website {about} "{name}".', context, 240)})
        return found
    lead = re.split(r'(?<=[.!?])\s', context.strip(), maxsplit=1)[0][:200]
    site = await _ask('What is a short name for this website? Reply with the name only, two to four words.', context, 40, quoted=True)
    contact = next((slug for name, slug, _ in GUIDED[pages] if name == 'Contact'), '#contact')
    outline_pages = []
    for name, slug, kinds in GUIDED[pages]:
        sections = []
        for kind in kinds:
            if kind == 'hero':
                sections.append({'kind': 'hero', 'heading': await _ask('Write a short headline, under eight words, for the home page of this website.', context, 80, site or 'Welcome'),
                                 'body': await _ask('Write one sentence that tells visitors what this website offers.', context, 300, lead),
                                 'button': {'label': 'Get in touch', 'href': contact}})
            elif kind == 'features':
                sections.append({'kind': 'features', 'heading': 'What we offer', 'body': '',
                                 'items': await items('List three things this website offers, one per line, each two to five words.', 'about')})
            elif kind == 'about':
                sections.append({'kind': 'about', 'heading': 'About', 'body': await _ask('Write two sentences for the About section of this website.', context, 600, lead)})
            elif kind == 'cta':
                sections.append({'kind': 'cta', 'heading': await _ask('Write a short invitation, under eight words, asking visitors to get in touch.', context, 80, 'Get in touch'),
                                 'body': '', 'button': {'label': 'Contact us', 'href': contact}})
            elif kind == 'faq':
                sections.append({'kind': 'faq', 'heading': 'Questions', 'body': '',
                                 'items': await items('Write three questions a visitor might ask this website, one per line.', 'that answers this visitor question:')})
            elif kind == 'contact':
                sections.append({'kind': 'contact', 'heading': 'Get in touch',
                                 'body': await _ask('Write one sentence inviting visitors to send a message.', context, 300, 'Send a message and we will get back to you.')})
        outline_pages.append({'name': name, 'slug': slug, 'description': next((s['body'] for s in sections if s.get('body')), '')[:160], 'sections': sections})
    return validate({'site': site, 'pages': outline_pages})


async def plan(studio, prompt: str, pages: int = 3, references=None, previous=None, instruction: str | None = None) -> dict:
    """An outline to review. With previous and instruction, the model revises that outline instead (a chat edit)."""
    studio.access.authorize('edit')
    prompt = (prompt or '').strip()
    if not 10 <= len(prompt) <= 4000:
        raise EngineError('Describe the site in 10 to 4,000 characters: what it is for, who it is for, and what pages it needs.')
    pages = max(1, min(int(pages), 4))
    facts, palette, names = _references(references)
    context = prompt + (f'\n\nFacts from the reference documents (use these; do not invent others):\n{facts}' if facts else '')
    if previous is not None:
        current = validate(previous, source='caller')
        instruction = (instruction or '').strip()
        if not 3 <= len(instruction) <= 1000:
            raise EngineError('Say what to change in the outline, in 3 to 1,000 characters.', 422)
        shown = {'site': current['site'], 'pages': [{k: v for k, v in p.items() if k != 'slug'} for p in current['pages']]}
        content = await _chat([{'role': 'system', 'content': f'You revise website outlines. {PLAN_RULE}'},
                               {'role': 'user', 'content': f'The website: {context}\n\nCurrent outline:\n{json.dumps(shown, ensure_ascii=False)}\n\n'
                                                           f'Change it as follows: {instruction}\n\nReply with the whole changed outline.'}])
        try:
            outline = validate(_parse(content), 4)
        except EngineError as error:
            raise EngineError('The model could not revise the outline, so it is unchanged. Try a simpler instruction or a larger model in formvis, or build it and edit the pages directly.', 502) from error
        # Colours follow the references as they are now (a removed image takes its colours with it); a caller that
        # passes no references at all keeps the outline's own.
        mode, palette = 'revised', palette if references is not None else current['palette']
    else:
        content = await _chat([{'role': 'system', 'content': f'You plan small websites. {PLAN_RULE}'},
                               {'role': 'user', 'content': f'Plan a site with up to {pages} page{"s" if pages > 1 else ""}.\n\n{context}'}])
        try:
            outline, mode = validate(_parse(content), pages), 'outline'
        except EngineError as error:
            if error.status != 502:
                raise
            outline, mode = await _guided(context, pages), 'guided'
    outline['palette'] = palette
    taken = {p['slug'] for p in (await studio.state())['site']['pages']}
    moved = {}
    for page in outline['pages']:  # the outline shows the addresses the build will really use
        old, page['slug'] = page['slug'], _slug(page['slug'] or page['name'], taken)
        if old and old != page['slug']:
            moved[old] = page['slug']
    _relink(outline, moved, {p['slug'] for p in (await studio.state())['site']['pages']})
    studio.access.record('ai.plan', {'pages': len(outline['pages']), 'mode': mode, 'references': len(names)})
    notes = {'outline': 'Review the outline, then build it: it adds new editable pages in one undo step and changes nothing that exists.',
             'guided': 'The model could not write a whole outline, so FormWeb laid out the pages and asked it for each text. Review it, then build, and check names, prices and facts before publishing: small models invent them. A larger model in formvis writes fuller outlines.',
             'revised': 'The outline was revised. Review it, then build, or ask for another change.'}
    return {'plan': outline, 'mode': mode, 'references': names,
            'summary': [{'page': p['name'], 'sections': [f'{s["kind"]}: {s["heading"]}' for s in p['sections']]} for p in outline['pages']],
            'note': notes[mode]}


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


def _readable(candidates) -> tuple | None:
    """Among (css value, hex) pairs readable on the section background (WCAG contrast 3 or more), the most saturated,
    so a button looks like an accent rather than paper."""
    base = _luminance(SECTION)
    best = None
    for css, value in candidates:
        lum = _luminance(value)
        if lum is None:
            continue
        contrast = (max(lum, base) + 0.05) / (min(lum, base) + 0.05)
        digits = value.strip().lstrip('#')
        rgb = [int((digits if len(digits) == 6 else ''.join(c * 2 for c in digits))[i:i + 2], 16) for i in (0, 2, 4)]
        saturation = (max(rgb) - min(rgb)) / max(max(rgb), 1)
        if contrast >= 3 and (best is None or (saturation, contrast) > best[1]):
            best = (css, (saturation, contrast), lum)
    return best


def _styles(site: dict, palette: list[str] | None = None) -> dict:
    """Accent: the site's brand and library colours first, then a reference image's colours, else orange."""
    typed = (((site.get('extensions') or {}).get('design') or {}).get('tokens') or {})
    best = _readable((f'var(--{name})', item.get('value', '')) for name, item in typed.items() if item.get('type') == 'color' and name.startswith(('brand-', 'lib-')))
    best = best or _readable((c, c) for c in (palette or []))
    accent, lum = (best[0], best[2]) if best else ('#f97316', _luminance('#f97316'))
    font = next((f'var(--{name})' for name, item in typed.items() if name.startswith(('brand-font-', 'lib-')) and item.get('type') == 'text'), None)
    return {'accent': accent, 'on_accent': '#111111' if lum > 0.18 else '#ffffff', 'font': font}


def _relink(outline: dict, moved: dict, existing: set | None = None) -> None:
    """Buttons that pointed at a page whose address had to change (the site already used it) follow it. With existing,
    a button to a page that neither the outline nor the site has (the model planned more pages than were asked for)
    goes to the outline's contact page, else nowhere (#)."""
    known = {p['slug'] for p in outline['pages']} | (existing or set())
    contact = next((p['slug'] for p in outline['pages'] if any(s['kind'] == 'contact' for s in p['sections'])), '#')
    for page in outline['pages']:
        for section in page['sections']:
            button = section.get('button')
            if not button:
                continue
            path, mark, fragment = button['href'].partition('#')
            if path in moved:  # "/contact#form" follows the page too
                button['href'] = moved[path] + mark + fragment
            if existing is not None and button['href'].startswith('/') and button['href'].split('#')[0] not in known:
                button['href'] = contact


def build_commands(site: dict, outline: dict) -> tuple[list[dict], list[dict]]:
    look = _styles(site, outline.get('palette'))
    tag = secrets.token_hex(3)
    counter = iter(range(1, 100000))
    def nid(kind: str) -> str:
        return f'gen-{tag}-{kind}-{next(counter)}'
    commands, made = [], []
    taken = {p['slug'] for p in site['pages']}
    slugs = [_slug(p['slug'] or p['name'], taken) for p in outline['pages']]
    existing = set(taken) - set(slugs)  # _slug added the new addresses to taken
    _relink(outline, {p['slug']: s for p, s in zip(outline['pages'], slugs) if p['slug'] and p['slug'] != s})
    for page, slug in zip(outline['pages'], slugs):
        page['slug'] = slug
    _relink(outline, {}, existing)
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
