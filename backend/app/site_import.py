"""Import a static site from a zip archive: every HTML file becomes a page holding one code section, with its local
stylesheets, first script, pictures and fonts. The archive is untrusted. It is read in memory with zipfile under hard
caps and nothing in it is written to disk under its own name; assets go through the asset store's checks."""
import hashlib
import io
import json
import posixpath
import re
import secrets
import stat
import struct
import unicodedata
import zipfile
import zlib
from html import escape, unescape
from urllib.parse import unquote, urlsplit

from .assets import SIZE_LIMITS, check_upload_svg, ingest, own_asset, sniff_extension
from .config import MAX_IMAGE_BYTES, MAX_SITE_ARCHIVE_BYTES
from .engine import EngineError

MAX_ENTRIES = 1000
MAX_LISTING = 2 * 1024 * 1024
MAX_UNPACKED = 128 * 1024 * 1024
MAX_DEPTH = 12
MAX_RATIO = 100
MAX_PAGES = 100
MAX_COMMANDS = 4000
EXTENSION_LIMIT = 4 * 1024 * 1024
HTML_CAP = 512 * 1024
CSS_CAP = 256 * 1024
JS_CAP = 512 * 1024
FILE_CAPS = {'page': 1024 * 1024, 'style': CSS_CAP, 'script': JS_CAP}
KINDS = {'html': 'page', 'htm': 'page', 'css': 'style', 'js': 'script', 'mjs': 'script',
         'png': 'asset', 'jpg': 'asset', 'jpeg': 'asset', 'gif': 'asset', 'webp': 'asset', 'svg': 'asset', 'mp4': 'asset', 'webm': 'asset', 'woff2': 'asset'}
STORED = {'jpeg': 'jpg'}
REASONS = {
    'woff': 'Only WOFF2 fonts can be stored. Convert this font to WOFF2.',
    'ttf': 'Only WOFF2 fonts can be stored. Convert this font to WOFF2.',
    'otf': 'Only WOFF2 fonts can be stored. Convert this font to WOFF2.',
    'eot': 'Only WOFF2 fonts can be stored. Convert this font to WOFF2.',
    'ico': 'ICO icons are not stored. Set a PNG favicon in Site settings instead.',
    'map': 'Source maps are not needed in an imported site.',
}
TAG = re.compile(r'<[A-Za-z][^<>]*>')
ATTR = re.compile(r'''(\s)(src|href|poster|srcset|data-src|style)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+))''', re.I)
BLOCK = re.compile(r'<style\b[^>]*(?:>|\Z)(.*?)(?:</style\s*>|\Z)|<script\b([^>]*)(?:>|\Z)(.*?)(?:</script\s*>|\Z)|<link\b[^>]*(?:>|\Z)', re.I | re.S)
STRIP = re.compile(r'<script\b[^>]*(?:>|\Z).*?(?:</script\s*>|\Z)|<style\b[^>]*(?:>|\Z).*?(?:</style\s*>|\Z)', re.I | re.S)
LINK = re.compile(r'<link\b[^>]*(?:>|\Z)', re.I)
META = re.compile(r'<meta\b[^>]*(?:>|\Z)', re.I)
TITLE = re.compile(r'<title\b[^>]*(?:>|\Z)(.*?)(?:</title\s*>|\Z)', re.I | re.S)
PAIR = re.compile(r'''([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+)))?''')
CSS_URL = re.compile(r'''url\(\s*(?:"([^"]*)"|'([^']*)'|([^()'"\s]*))\s*\)''', re.I)
CSS_IMPORT = re.compile(r'''@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?([^;{}@]*);''', re.I)


def _show(name: str) -> str:
    return ''.join(c if c.isprintable() else '?' for c in name)[:120]


def _size(count: int) -> str:
    return f'{count / 1048576:.1f} MiB' if count >= 1048576 else f'{max(1, round(count / 1024))} KiB'


def _ext(path: str) -> str:
    name = path.rsplit('/', 1)[-1]
    return name.rsplit('.', 1)[-1].lower() if '.' in name else ''


def read_archive(data: bytes) -> dict:
    """Entries kept by kind with their bytes, the skipped ones with a reason, and how many system files were ignored."""
    if not data:
        raise EngineError('Choose a .zip file that holds the site.')
    if len(data) > MAX_SITE_ARCHIVE_BYTES:
        raise EngineError(f'The archive is larger than {_size(MAX_SITE_ARCHIVE_BYTES)}, the most a site import takes.', 413)
    end = data.rfind(b'PK\x05\x06', max(0, len(data) - 65558))
    if end < 0 or len(data) < end + 22:
        raise EngineError('This file is not a zip archive FormWeb can read.', 400)
    count, listing = struct.unpack('<HI', data[end + 10:end + 16])
    if count > MAX_ENTRIES:
        raise EngineError(f'The archive holds {count:,} entries; a site import takes at most {MAX_ENTRIES:,}. Nothing was imported.', 413)
    if listing > MAX_LISTING:
        raise EngineError('The archive\'s list of files is far longer than a website needs, so it was not opened.', 413)
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        infos = archive.infolist()
    except (zipfile.BadZipFile, zipfile.LargeZipFile, ValueError, OSError, EOFError):
        raise EngineError('This file is not a zip archive FormWeb can read.', 400)
    if len(infos) > MAX_ENTRIES:
        raise EngineError(f'The archive holds {len(infos):,} entries; a site import takes at most {MAX_ENTRIES:,}. Nothing was imported.', 413)
    kept, ignored, seen = [], 0, set()
    for info in infos:
        raw = info.filename
        name = raw.replace('\\', '/')
        parts = [part for part in name.split('/') if part not in ('', '.')]
        if (info.external_attr >> 16) & 0o170000 == stat.S_IFLNK:
            raise EngineError(f'The archive holds a link ({_show(raw)}). Links are not allowed in a site import, so nothing was imported.', 400)
        if '\x00' in name or name.startswith('/') or re.match(r'^[A-Za-z]:', name) or '..' in parts:
            raise EngineError(f'The archive names a file outside its own folder ({_show(raw)}), so nothing was imported.', 400)
        if info.flag_bits & 0x1:
            raise EngineError('The archive is password protected. Make the zip again without a password.', 400)
        if info.is_dir() or not parts:
            continue
        if len(parts) > MAX_DEPTH:
            raise EngineError(f'The archive has folders more than {MAX_DEPTH} levels deep ({_show(raw)}). Nothing was imported.', 400)
        if parts[0] == '__MACOSX' or 'node_modules' in parts or any(part.startswith('.') for part in parts):
            ignored += 1
            continue
        key = '/'.join(parts)
        folded = unicodedata.normalize('NFC', key).casefold()
        if folded in seen:
            raise EngineError(f'The archive holds {_show(key)} twice. Nothing was imported.', 400)
        seen.add(folded)
        if info.file_size > 1024 * 1024 and info.file_size > MAX_RATIO * max(info.compress_size, 1):
            raise EngineError(f'{_show(key)} expands far more than a website file would, so the archive was not opened.', 400)
        kept.append((parts, info))
    if kept and all(len(parts) > 1 for parts, _ in kept) and len({parts[0] for parts, _ in kept}) == 1:
        kept = [(parts[1:], info) for parts, info in kept]
    if sum(info.file_size for _, info in kept) > MAX_UNPACKED:
        raise EngineError(f'The archive unpacks to more than {_size(MAX_UNPACKED)}, the most a site import takes.', 413)
    files: dict[str, tuple[str, bytes]] = {}
    skipped: list[dict] = []
    total = 0
    for parts, info in sorted(kept, key=lambda item: '/'.join(item[0]).lower()):
        path = '/'.join(parts)
        extension = _ext(path)
        kind = KINDS.get(extension)
        if kind is None:
            skipped.append({'file': path, 'reason': REASONS.get(extension, 'This type of file is not part of a static site import.')})
            continue
        cap = SIZE_LIMITS.get(STORED.get(extension, extension), MAX_IMAGE_BYTES) if kind == 'asset' else FILE_CAPS[kind]
        if info.file_size > cap:
            skipped.append({'file': path, 'reason': f'Larger than the {_size(cap)} a file of this type may be.'})
            continue
        try:
            with archive.open(info) as stream:
                body = stream.read(cap + 1)
        except (zipfile.BadZipFile, zlib.error, EOFError, NotImplementedError, RuntimeError, OSError, ValueError):
            raise EngineError(f'The archive is damaged at {_show(path)}. Nothing was imported.', 400)
        if len(body) > cap:
            skipped.append({'file': path, 'reason': f'Larger than the {_size(cap)} a file of this type may be.'})
            continue
        total += len(body)
        if total > MAX_UNPACKED:
            raise EngineError(f'The archive unpacks to more than {_size(MAX_UNPACKED)}, the most a site import takes.', 413)
        if kind == 'asset':
            wanted = STORED.get(extension, extension)
            try:
                try:
                    found = sniff_extension(body, 'application/octet-stream')
                except EngineError:
                    found = ''
                if found != wanted:
                    raise EngineError(f'Its content does not match its .{extension} name.')
                if found == 'svg':
                    check_upload_svg(body)
                if len(body) < 20:
                    raise EngineError('The file is empty or cut short.')
            except EngineError as error:
                skipped.append({'file': path, 'reason': str(error)})
                continue
        files[path] = (kind, body)
    return {'files': files, 'skipped': skipped, 'ignored': ignored}


def _text(body: bytes) -> str:
    try:
        return body.decode('utf-8-sig')
    except UnicodeDecodeError:
        return body.decode('cp1252', errors='replace')


def _attrs(tag: str) -> dict:
    inner = re.sub(r'^<[A-Za-z][-A-Za-z0-9]*', '', tag).rstrip('>').rstrip('/')
    return {m.group(1).lower(): unescape(next((g for g in m.group(2, 3, 4) if g is not None), '')) for m in PAIR.finditer(inner)}


def _route(path: str) -> str:
    stem = path.rsplit('.', 1)[0]
    if stem == 'index' or stem.endswith('/index'):
        stem = stem[:-5]
    parts = [re.sub(r'-+', '-', re.sub(r'[^a-z0-9_-]+', '-', part.lower())).strip('-') for part in stem.split('/')]
    return ('/' + '/'.join(part for part in parts if part))[:200].rstrip('/-') or '/'


class Site:
    """Resolves the references of one archive: local pages to routes, local files to stored asset URLs."""

    def __init__(self, files: dict):
        self.files = files
        self.routes: dict[str, str] = {}
        self.used: set = set()
        self.room = CSS_CAP
        self.overflow = False
        self.assets ={path: '/api/assets/' + hashlib.sha256(body).hexdigest() + '.' + STORED.get(_ext(path), _ext(path))
                       for path, (kind, body) in files.items() if kind == 'asset'}

    def locate(self, reference: str, base: str) -> tuple[str, str] | None:
        """The archive path a local reference names, and its fragment; None for external, data and fragment-only references."""
        value = reference.strip()
        if not value or value.startswith(('#', '//')):
            return None
        parts = urlsplit(value)
        if parts.scheme or parts.netloc or not parts.path:
            return None
        path = unquote(parts.path)
        joined = posixpath.normpath(path.lstrip('/') if path.startswith('/') else posixpath.join(base, path))
        if joined in ('.', ''):
            joined = ''
        return joined, parts.fragment

    def page_target(self, path: str) -> str | None:
        for candidate in (path, posixpath.join(path, 'index.html'), posixpath.join(path, 'index.htm'), path + '.html', path + '.htm'):
            if candidate.lstrip('/') in self.routes:
                return self.routes[candidate.lstrip('/')]
        return None

    def rewrite(self, reference: str, base: str, missing: set) -> str | None:
        found = self.locate(reference, base)
        if found is None:
            return None
        path, fragment = found
        if path.startswith('..'):
            missing.add(reference.strip())
            return None
        if path in self.assets:
            return self.assets[path] + ('#' + fragment if fragment else '')
        route = self.page_target(path)
        if route is not None:
            return route + ('#' + fragment if fragment else '')
        if path not in self.files:
            missing.add(reference.strip())
        return None

    def take(self, path: str) -> bool:
        """Whether a stylesheet is inlined here: each one once per page, and no more than a code section's styles hold."""
        if path in self.used:
            return False
        self.used.add(path)
        self.room -= len(self.files[path][1])
        if self.room < 0:
            self.overflow = True
        return not self.overflow

    def css(self, text: str, base: str, missing: set, depth: int = 0, seen: frozenset = frozenset()) -> str:
        def imported(match):
            found = self.locate(match.group(1), base)
            if found is None or found[0] not in self.files or self.files[found[0]][0] != 'style' or depth >= 4 or found[0] in seen:
                if found is not None and found[0] not in self.files:
                    missing.add(match.group(1))
                return match.group(0)
            if not self.take(found[0]):
                return ''
            body = self.css(_text(self.files[found[0]][1]), posixpath.dirname(found[0]), missing, depth + 1, seen | {found[0]})
            media = match.group(2).strip()
            return f'@media {media} {{\n{body}\n}}' if media else body

        def url(match):
            original = next(g for g in match.group(1, 2, 3) if g is not None)
            if original.strip().lower().startswith('data:'):
                return match.group(0)
            new = self.rewrite(original, base, missing)
            return f'url("{new}")' if new else match.group(0)

        return CSS_URL.sub(url, CSS_IMPORT.sub(imported, text))

    def markup(self, text: str, base: str, missing: set) -> str:
        def attribute(match):
            name = match.group(2).lower()
            quoted = next(g for g in match.group(4, 5, 6) if g is not None)
            value = unescape(quoted)
            if name == 'style':
                new = self.css(value, base, missing)
            elif name == 'srcset':
                items = []
                for item in value.split(','):
                    bits = item.strip().split(None, 1)
                    if not bits:
                        continue
                    target = self.rewrite(bits[0], base, missing)
                    items.append(' '.join([target or bits[0], *bits[1:]]))
                new = ', '.join(items)
            else:
                new = self.rewrite(value, base, missing)
            if new is None or new == value:
                return match.group(0)
            return f'{match.group(1)}{match.group(2)}{match.group(3)}"{escape(new, quote=True)}"'

        return TAG.sub(lambda tag: ATTR.sub(attribute, tag.group(0)), text)


def _between(document: str, tag: str) -> str | None:
    opened = re.search(rf'<{tag}\b[^>]*(?:>|\Z)', document, re.I)
    if not opened:
        return None
    closed = document.lower().rfind(f'</{tag}>')
    return document[opened.end():closed] if closed > opened.end() else None


def _page(site: Site, path: str, body: bytes, kit_script) -> dict:
    document = _text(body)
    base = posixpath.dirname(path)
    missing: set = set()
    warnings: list[str] = []
    outside_scripts, outside_styles = set(), set()
    site.used, site.room, site.overflow = set(), CSS_CAP, False
    title = TITLE.search(document)
    title = re.sub(r'\s+', ' ', unescape(title.group(1))).strip()[:200] if title else ''
    description = ''
    for tag in META.finditer(document):
        found = _attrs(tag.group(0))
        if found.get('name', '').lower() == 'description':
            description = re.sub(r'\s+', ' ', found.get('content', '')).strip()[:500]
            break
    styles, scripts, inlined = [], [], set()
    body = _between(document, 'body') or document
    body_at = document.find(body) if body is not document else 0
    for block in BLOCK.finditer(document):
        whole = block.group(0)
        if whole[:6].lower() == '<style':
            styles.append(site.css(block.group(1), base, missing))
        elif whole[:7].lower() == '<script':
            attrs = _attrs('<script' + block.group(2) + '>')
            module = attrs.get('type', '').strip().lower() == 'module'
            source = attrs.get('src')
            if attrs.get('type', '').strip().lower() not in ('', 'module', 'text/javascript', 'application/javascript'):
                continue
            if source is not None:
                found = site.locate(source, base)
                if found is None:
                    outside_scripts.add(source[:120])
                elif found[0] in site.files and site.files[found[0]][0] == 'script':
                    content = _text(site.files[found[0]][1])
                    if content.strip():
                        scripts.append((content, module, found[0]))
                else:
                    missing.add(source)
            elif block.group(3).strip():
                scripts.append((block.group(3), module, 'inline script'))
        else:
            attrs = _attrs(whole)
            if 'stylesheet' not in attrs.get('rel', '').lower().split():
                continue
            href = attrs.get('href', '')
            found = site.locate(href, base)
            if found is None:
                if href.strip() and block.start() < body_at:
                    outside_styles.add(href[:120])
            elif found[0] in site.files and site.files[found[0]][0] == 'style':
                inlined.add(whole)
                if not site.take(found[0]):
                    continue
                css =site.css(_text(site.files[found[0]][1]), posixpath.dirname(found[0]), missing, 0, frozenset({found[0]}))
                media = attrs.get('media', '').strip()
                styles.append(f'@media {media} {{\n{css}\n}}' if media and media.lower() != 'all' else css)
            else:
                missing.add(href)
    script, module = '', False
    if scripts:
        if len(scripts) > 1:
            warnings.append(f'Only the first script comes along ({scripts[0][2]}); {len(scripts) - 1} more {"was" if len(scripts) == 2 else "were"} left out.')
        try:
            script, _ = kit_script(scripts[0][0])
            module = any(item[1] for item in scripts)
        except EngineError as error:
            warnings.append(f'The script was left out: {error}')
    for found, noun, where in ((outside_scripts, 'external script', ''), (outside_styles, 'external stylesheet', ' in the page head, which an import leaves out')):
        if found:
            shown = sorted(found)
            warnings.append(f'{len(shown)} {noun}{"s" if len(shown) != 1 else ""}{where} {"is" if len(shown) == 1 else "are"} not brought along: {", ".join(shown[:5])}{"..." if len(shown) > 5 else ""}.')
    markup = STRIP.sub('', body)
    markup = LINK.sub(lambda tag: '' if tag.group(0) in inlined else tag.group(0), markup)
    markup = site.markup(markup, base, missing).strip()
    css = '\n'.join(part.strip() for part in styles if part.strip())
    if missing:
        shown = sorted(missing)
        warnings.append(f'{len(shown)} reference{"s" if len(shown) != 1 else ""} point{"" if len(shown) != 1 else "s"} at files that were skipped or are not in the archive: {", ".join(item[:80] for item in shown[:5])}{"..." if len(shown) > 5 else ""}.')
    name = (title or posixpath.basename(path).rsplit('.', 1)[0] or 'Imported page')[:120]
    return {'file': path, 'name': name, 'title': title, 'description': description, 'html': markup, 'css': css, 'js': script.strip(), 'module': module and bool(script.strip()), 'warnings': warnings, 'overflow': site.overflow}


def _emptiable(site: dict, root: str) -> bool:
    """A page's content can be swapped for an import when nothing outside its tree points into it: no component
    source and no code, motion or variables entry naming one of its elements; its own code sections go with it."""
    nodes = site.get('nodes') or {}
    inside, stack = set(), list(nodes.get(root, {}).get('children') or [])
    while stack:
        current = stack.pop()
        if current in inside or current not in nodes:
            continue
        inside.add(current)
        stack += nodes[current].get('children') or []
    if not inside:
        return True
    if any(component.get('root') in inside for component in (site.get('components') or {}).values()):
        return False
    extensions = dict(site.get('extensions') or {})
    code = dict(extensions.get('code') or {})
    code['sections'] = {key: value for key, value in (code.get('sections') or {}).items() if key not in inside}
    extensions['code'] = code
    named = set(re.findall(r'"([A-Za-z0-9_-]{1,96})"', json.dumps(extensions)))
    return not (inside & named)


def plan(archive: dict, site: dict, kit_script) -> dict:
    """What an import would do to this site, in both modes, without changing anything."""
    files = archive['files']
    skipped = list(archive['skipped'])
    resolver = Site(files)
    pages = sorted((path for path, (kind, _) in files.items() if kind == 'page'), key=lambda p: (p.count('/'), not re.search(r'(^|/)index\.html?$', p), p.lower()))
    if len(pages) > MAX_PAGES:
        skipped += [{'file': path, 'reason': f'A site import brings at most {MAX_PAGES} pages.'} for path in pages[MAX_PAGES:]]
        pages = pages[:MAX_PAGES]
    used: set = set()
    for path in pages:
        route, k = _route(path), 2
        base = route
        while route.strip('/') in used:
            route, k = f'{base.rstrip("/") or "/home"}-{k}', k + 1
        used.add(route.strip('/'))
        resolver.routes[path] = route
    existing = {page['slug'].strip('/'): page for page in site.get('pages') or []}
    taken = set(existing)
    planned, budget = [], EXTENSION_LIMIT - len(json.dumps(site.get('extensions') or {}, ensure_ascii=False, separators=(',', ':')).encode()) - 65536
    allow = (((site.get('extensions') or {}).get('code') or {}).get('allowSections')) is True
    for path in pages:
        page = _page(resolver, path, files[path][1], kit_script)
        if page['overflow'] or len(page['html'].encode()) > HTML_CAP or len(page['css'].encode()) > CSS_CAP or len(page['js'].encode()) > JS_CAP:
            skipped.append({'file': path, 'reason': 'The page is larger than a code section holds (512 KiB markup, 256 KiB styles, 512 KiB script).'})
            continue
        cost = len(json.dumps({'enabled': True, 'html': page['html'], 'css': page['css'], 'js': page['js'], 'module': page['module']}, ensure_ascii=False, separators=(',', ':')).encode()) + 64
        if cost > budget:
            skipped.append({'file': path, 'reason': 'The site has no room left for this page\'s code (a site keeps at most 4 MiB of code sections and other extension data).'})
            continue
        budget -= cost
        route = resolver.routes[path]
        match = existing.get(route.strip('/'))
        page['route'] = route
        page['replaces'] = {'id': match['id'], 'name': match['name'], 'safe': _emptiable(site, match['root'])} if match else None
        page['bytes'] = len(files[path][1])
        planned.append(page)
    for page in planned:
        slug, k = page['route'], 2
        base = slug.strip('/') or 'home'
        if slug.strip('/') in taken:
            slug = '/' + base
        while slug.strip('/') in taken:
            slug, k = f'/{base}-{k}', k + 1
        taken.add(slug.strip('/'))
        page['newRoute'] = slug
    assets = [path for path, (kind, _) in files.items() if kind == 'asset']
    support = sum(1 for kind, _ in files.values() if kind in ('style', 'script'))
    return {'pages': planned, 'assets': assets, 'assetBytes': sum(len(files[path][1]) for path in assets), 'support': support,
            'skipped': skipped, 'ignored': archive['ignored'], 'allow': allow}


def review(result: dict) -> dict:
    pages = [{'file': p['file'], 'name': p['name'], 'title': p['title'], 'description': p['description'], 'route': p['route'], 'newRoute': p['newRoute'],
              'replaces': p['replaces'], 'bytes': p['bytes'], 'warnings': p['warnings']} for p in result['pages']]
    matched = [p['replaces'] for p in pages if p['replaces']]
    blocked = [m['name'] for m in matched if not m['safe']]
    reason = ''
    if not matched:
        reason = 'No imported route matches a page this site already has.'
    elif blocked:
        reason = f'Replacing is not offered: {", ".join(blocked[:3])}{"..." if len(blocked) > 3 else ""} holds content that a component, code, motion or variables entry points at.'
    return {'pages': pages, 'assets': {'count': len(result['assets']), 'bytes': result['assetBytes']}, 'supportFiles': result['support'],
            'skipped': result['skipped'], 'ignored': result['ignored'], 'canReplace': bool(matched) and not blocked, 'replaceNote': reason,
            'notes': ['Each page arrives as one code section: its HTML, CSS and first script, editable as code. Code sections run in Preview and in exports, not on the canvas.']}


def summary(pages: int, assets: int, skipped: int) -> str:
    made = f'Imported {pages} page{"" if pages == 1 else "s"} and {assets} asset{"" if assets == 1 else "s"}.'
    if skipped:
        made += f' {skipped} file{" was" if skipped == 1 else "s were"} skipped.'
    return made


def commands(result: dict, site: dict, mode: str, archive: dict, kit_script) -> tuple[list[dict], list[str]]:
    """One batch: new pages (or matching pages emptied, in replace mode) each holding one code section host."""
    if not result['pages']:
        raise EngineError('The archive has no HTML page that can be imported.', 400)
    if mode == 'replace' and not review(result)['canReplace']:
        raise EngineError(review(result)['replaceNote'] or 'Replacing matching routes is not possible for this archive.', 409)
    resolver_routes = {p['file']: (p['route'] if mode == 'replace' and p['replaces'] else p['newRoute']) for p in result['pages']}
    resolver = Site(archive['files'])
    resolver.routes = resolver_routes
    ids = {page['id'] for page in site.get('pages') or []} | set((site.get('nodes') or {}).keys()) | set((site.get('components') or {}).keys()) | set((site.get('collections') or {}).keys())
    made, removals, opened = [], [], []
    if not result['allow']:
        made.append({'command': 'code.sections.allow', 'params': {'enabled': True}})
    for planned in result['pages']:
        page = _page(resolver, planned['file'], archive['files'][planned['file']][1], kit_script)
        host = 'imported-' + secrets.token_hex(4)
        while host in ids:
            host = 'imported-' + secrets.token_hex(4)
        ids.add(host)
        seo = {key: page[key] for key in ('title', 'description') if page[key]}
        if mode == 'replace' and planned['replaces']:
            page_id = planned['replaces']['id']
            root = next(p['root'] for p in site['pages'] if p['id'] == page_id)
            removals += [{'command': 'node.remove', 'params': {'id': child}} for child in site['nodes'][root].get('children') or []]
            if seo:
                made.append({'command': 'page.update', 'params': {'id': page_id, 'patch': {'seo': seo}}})
        else:
            stem = re.sub(r'[^A-Za-z0-9_-]', '-', planned['newRoute'].strip('/') or 'home')[:60]
            page_id, k = f'page-{stem}', 2
            while page_id in ids or f'{page_id}-root' in ids:
                page_id, k = f'page-{stem}-{k}', k + 1
            root = f'{page_id}-root'
            ids |= {page_id, root}
            made.append({'command': 'page.add', 'params': {'name': page['name'], 'slug': planned['newRoute'], 'id': page_id, 'root': root}})
            if seo:
                made.append({'command': 'page.update', 'params': {'id': page_id, 'patch': {'seo': seo}}})
        made.append({'command': 'node.add', 'params': {'parent': root, 'node': {'id': host, 'tag': 'section', 'name': page['name'], 'text': '', 'children': [], 'attrs': {}, 'styles': {'position': 'relative'}, 'breakpoints': {}}}})
        made.append({'command': 'code.section.set', 'params': {'node': host, 'value': {'enabled': True, 'html': page['html'], 'css': page['css'], 'js': page['js'], 'module': page['module']}}})
        opened.append(page_id)
    batch = made + removals
    if len(batch) > MAX_COMMANDS:
        raise EngineError('Replacing these pages takes more changes than one import can hold. Import fewer pages or add them as new pages.', 413)
    return batch, opened


def store_assets(result: dict, archive: dict, studio) -> int:
    for path in result['assets']:
        stored = ingest(archive['files'][path][1], 'application/octet-stream', posixpath.basename(path))
        own_asset(studio, stored['id'])
    return len(result['assets'])
