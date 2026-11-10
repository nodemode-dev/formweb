"""Section library v2 (DEV_PLAN AD7): first-party page components, section templates, design-system presets and starter
sites, kept as data under `library/` and turned into ordinary engine commands here. Nothing in this module talks to the
engine or the network: callers pass the current site in and send the returned commands as one batch, so an insert is one
undo step and works the same from the Library panel, the HTTP routes and the CLI.

Template strings use four placeholders, expanded in this order:
- `$parent` (the whole string) is the node the section is inserted under.
- `@@key@@` is a node id: `key-<suffix>`, with one random suffix per insert, so a template can be inserted many times.
- `%%name%%` is a variable scoped to the insert: `name_<suffix>`, in names, formulas, actions, scripts, props and
  `var(--fw-v-%%name%%)` styles alike, so two copies of a section keep their own state.
- `{{field}}` is a re-cast field value; when the whole string is one placeholder the raw value is used (numbers, objects).
"""
import json
import os
import re
import secrets
from pathlib import Path

from .config import BUNDLE, FROZEN, ROOT
from .engine import EngineError

# The desktop build carries library/ inside its bundle; FORMWEB_LIBRARY_DIR points the tool and routes at a copy.
LIBRARY = Path(os.getenv('FORMWEB_LIBRARY_DIR') or (BUNDLE / 'library' if FROZEN else ROOT / 'library')).resolve()
KEY = re.compile(r'^[A-Za-z0-9_-]{1,40}$')
IDENT = re.compile(r'^[A-Za-z0-9_-]{1,96}$')
NODE_REF = re.compile(r'@@([A-Za-z0-9_-]{1,40})@@')
FIELD_REF = re.compile(r'\{\{([A-Za-z0-9_]{1,40})\}\}')
# %%name%% is a variable scoped to one insert: name_<suffix>, so two copies of a section keep their own state (0.19.3).
VAR_REF = re.compile(r'%%([A-Za-z_][A-Za-z0-9_]{0,40})%%')
WHOLE_FIELD = re.compile(r'^\{\{([A-Za-z0-9_]{1,40})\}\}$')
HEX = re.compile(r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$')
CATEGORIES = ('product-site', 'scroll-story', 'portfolio-hero', 'prompt-hero', 'support', 'not-found', 'chrome')
FIELD_TYPES = ('text', 'longtext', 'color', 'url', 'asset', 'number')
NODE_KEYS = {'key', 'tag', 'name', 'text', 'attrs', 'styles', 'breakpoints', 'children'}


def _read(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise EngineError(f'Library file {path.relative_to(LIBRARY)} is unreadable: {error}', 500) from error


def _entry(kind: str, ident: str) -> Path:
    if not IDENT.fullmatch(ident or ''):
        raise EngineError(f'Invalid library {kind} id.', 400)
    folder = {'section': LIBRARY / 'sections' / f'{ident}.json', 'preset': LIBRARY / 'presets' / f'{ident}.json',
              'starter': LIBRARY / 'starters' / f'{ident}.json', 'component': LIBRARY / 'components' / ident / 'manifest.json'}[kind]
    if not folder.is_file():
        raise EngineError(f'Library {kind} {ident} not found.', 404)
    return folder


def section(ident: str) -> dict:
    return _read(_entry('section', ident))


def preset(ident: str) -> dict:
    return _read(_entry('preset', ident))


def starter(ident: str) -> dict:
    return _read(_entry('starter', ident))


def component(ident: str) -> dict:
    return _read(_entry('component', ident))


def component_source(ident: str) -> tuple[str, str]:
    folder = LIBRARY / 'components' / ident
    for name, language in (('component.js', 'javascript'), ('component.ts', 'typescript')):
        if (folder / name).is_file():
            return (folder / name).read_text(encoding='utf-8'), language
    raise EngineError(f'Library component {ident} has no source file.', 500)


def built_component(ident: str) -> dict | None:
    path = LIBRARY / 'build' / 'components' / f'{ident}.json'
    return _read(path) if path.is_file() else None


def index() -> dict:
    """Summaries for the Library panel, sorted by category order and then name."""
    sections = []
    for path in sorted((LIBRARY / 'sections').glob('*.json')):
        data = _read(path)
        thumb = LIBRARY / 'sections' / 'thumbs' / f'{data["id"]}.webp'
        sections.append({key: data.get(key) for key in ('id', 'name', 'category', 'tags', 'product', 'description', 'components', 'preset', 'fields')} | {'thumb': thumb.is_file()})
    order = {name: i for i, name in enumerate(CATEGORIES)}
    sections.sort(key=lambda s: (order.get(s['category'], 99), s['name'] or ''))
    components = [{key: data.get(key) for key in ('id', 'code', 'name', 'description', 'props', 'labels', 'sections')} for data in (_read(p) for p in sorted((LIBRARY / 'components').glob('*/manifest.json')))]
    # products: the preset's product tints, so an agent re-casting a section for a named app can pick its colour.
    presets = [{key: data.get(key) for key in ('id', 'name', 'description', 'products')} for data in (_read(p) for p in sorted((LIBRARY / 'presets').glob('*.json')))]
    starters = [{key: data.get(key) for key in ('id', 'name', 'description', 'pages', 'preset')} for data in (_read(p) for p in sorted((LIBRARY / 'starters').glob('*.json')))]
    return {'categories': list(CATEGORIES), 'sections': sections, 'components': components, 'presets': presets, 'starters': starters}


def field_values(template: dict, overrides: dict | None) -> dict:
    fields = template.get('fields') or {}
    values = {name: spec.get('default') for name, spec in fields.items()}
    for name, value in (overrides or {}).items():
        spec = fields.get(name)
        if spec is None:
            raise EngineError(f'Unknown field {name} for section {template.get("id")}.', 400)
        kind = spec.get('type', 'text')
        if kind in ('text', 'longtext', 'url', 'asset') and not isinstance(value, str):
            raise EngineError(f'Field {name} must be text.', 400)
        if kind == 'text' and len(value) > 400 or kind == 'longtext' and len(value) > 4000:
            raise EngineError(f'Field {name} is too long.', 400)
        if kind == 'color' and not (isinstance(value, str) and HEX.fullmatch(value)):
            raise EngineError(f'Field {name} must be a hex colour such as #36d3f5.', 400)
        if kind == 'url' and not (value.startswith(('https://', '/', '#', 'mailto:')) or value == ''):
            raise EngineError(f'Field {name} must be an https, relative, anchor or mailto link.', 400)
        if kind == 'asset' and not (value.startswith('/api/assets/') or value.startswith('https://')):
            raise EngineError(f'Field {name} must be an uploaded asset or an https address.', 400)
        if kind == 'number' and (isinstance(value, bool) or not isinstance(value, (int, float))):
            raise EngineError(f'Field {name} must be a number.', 400)
        values[name] = value
    return values


def _substitute(value, parent: str, suffix: str, values: dict):
    if isinstance(value, str):
        if value == '$parent':
            return parent
        whole = WHOLE_FIELD.fullmatch(value)
        if whole and whole.group(1) in values:
            raw = values[whole.group(1)]
            return raw if not isinstance(raw, str) else NODE_REF.sub(lambda m: f'{m.group(1)}-{suffix}', raw)
        value = NODE_REF.sub(lambda m: f'{m.group(1)}-{suffix}', value)
        value = VAR_REF.sub(lambda m: f'{m.group(1)}_{suffix}', value)
        return FIELD_REF.sub(lambda m: str(values[m.group(1)]) if m.group(1) in values else m.group(0), value)
    if isinstance(value, list):
        return [_substitute(item, parent, suffix, values) for item in value]
    if isinstance(value, dict):
        return {_substitute(key, parent, suffix, values) if '@@' in key else key: _substitute(item, parent, suffix, values) for key, item in value.items()}
    return value


def expand(template: dict, parent: str, overrides: dict | None = None, suffix: str | None = None) -> tuple[list[dict], str, dict]:
    """node.add commands for the template's tree (parents first), then its own commands. Returns them, the root id and
    the template's `behaviors` (node id to {states, actions, conditions}); callers merge those with `behaviors_command`
    after every template in the batch, because `extension.set` replaces a whole group."""
    suffix = suffix or secrets.token_hex(3)
    values = field_values(template, overrides)
    commands: list[dict] = []

    def walk(spec: dict, under: str) -> str:
        key = spec.get('key')
        if not isinstance(key, str) or not KEY.fullmatch(key):
            raise EngineError(f'Section {template.get("id")} has a node without a valid key.', 500)
        node = {'id': f'{key}-{suffix}', 'tag': spec['tag'], 'name': spec.get('name') or key, 'text': spec.get('text', ''),
                'children': [], 'attrs': dict(spec.get('attrs') or {}), 'styles': dict(spec.get('styles') or {}),
                'breakpoints': {name: dict(styles) for name, styles in (spec.get('breakpoints') or {}).items()}}
        commands.append({'command': 'node.add', 'params': {'parent': under, 'node': _substitute(node, parent, suffix, values)}})
        for child in spec.get('children') or []:
            walk(child, node['id'])
        return node['id']

    root = walk(template['tree'], parent)
    commands.extend(_substitute(template.get('commands') or [], parent, suffix, values))
    behaviors = {_substitute(key, parent, suffix, values): _substitute(data, parent, suffix, values) for key, data in (template.get('behaviors') or {}).items()}
    return commands, root, behaviors


def behaviors_command(site: dict, *entries: dict) -> dict | None:
    """One extension.set that adds per-node behaviors (hover, focus and press states, actions) to the site's group."""
    merged = {}
    for entry in entries:
        merged.update(entry or {})
    if not merged:
        return None
    group = json.loads(json.dumps((site.get('extensions') or {}).get('behaviors') or {}))
    nodes = group.setdefault('nodes', {})
    for node, data in merged.items():
        nodes[node] = {**nodes.get(node, {}), **data}
    group.setdefault('timelines', {})
    group.setdefault('overlays', {})
    return {'command': 'extension.set', 'params': {'group': 'behaviors', 'value': group}}


def preset_commands(site: dict, data: dict, font_sources: dict, mode: str = 'missing') -> list[dict]:
    """Commands that bring the site's tokens, theme values, fonts and text presets in line with a preset.
    mode "missing" only adds what the site lacks (inserting a section never overwrites a designer's choices);
    mode "all" replaces every value the preset defines (the explicit Apply preset action)."""
    tokens = site.get('tokens') or {}
    design = (site.get('extensions') or {}).get('design') or {}
    commands = [{'command': 'token.set', 'params': {'name': name, 'value': value}}
                for name, value in data.get('tokens', {}).items() if (name not in tokens if mode == 'missing' else tokens.get(name) != value)]
    themes = json.loads(json.dumps(design.get('themes') or {}))
    wanted = data.get('themes') or {}
    if mode == 'all' or not themes:
        merged = {**themes, **{k: v for k, v in wanted.items() if k != 'values'}, 'values': {mode_name: {**themes.get('values', {}).get(mode_name, {}), **vals} for mode_name, vals in wanted.get('values', {}).items()}}
    else:
        merged = {**themes, 'values': {**themes.get('values', {})}}
        for mode_name, vals in wanted.get('values', {}).items():
            merged['values'][mode_name] = {**{k: v for k, v in vals.items() if k not in tokens}, **merged['values'].get(mode_name, {})}
    if merged != themes and wanted:
        commands.append({'command': 'design.set', 'params': {'key': 'themes', 'value': merged}})
    fonts = dict(design.get('fonts') or {})
    for key, face in (data.get('fonts') or {}).items():
        if key in fonts and mode == 'missing' or key not in font_sources:
            continue
        fonts[key] = {'family': face['family'], 'src': font_sources[key], 'weight': face['weight'], 'style': face['style'], 'display': face['display']}
    if fonts != (design.get('fonts') or {}):
        commands.append({'command': 'design.set', 'params': {'key': 'fonts', 'value': fonts}})
    existing = design.get('textPresets') or {}
    for name, preset_data in (data.get('textPresets') or {}).items():
        if mode == 'all' or name not in existing:
            commands.append({'command': 'textpreset.set', 'params': {'name': name, 'styles': preset_data['styles']}})
    return commands


def page_commands(site: dict, data: dict, root: str, mode: str = 'missing') -> list[dict]:
    """Root styles from the preset's `page` map, skipping properties a designer already set when mode is "missing"."""
    current = ((site.get('nodes') or {}).get(root) or {}).get('styles') or {}
    styles = {k: v for k, v in (data.get('page') or {}).items() if mode == 'all' or k not in current}
    return [{'command': 'node.update', 'params': {'id': root, 'patch': {'styles': styles}}}] if styles else []


def component_group(site: dict, records: dict) -> dict | None:
    """The `code` extension group with the given built component records merged in, or None when nothing changes."""
    group = json.loads(json.dumps((site.get('extensions') or {}).get('code') or {}))
    components = group.setdefault('components', {})
    changed = False
    for ident, record in records.items():
        if components.get(ident, {}).get('sourceDigest') != record.get('sourceDigest') or components.get(ident, {}).get('poster') != record.get('poster'):
            components[ident] = record
            changed = True
    return group if changed else None


def properties_command(site: dict, *templates: dict) -> dict | None:
    """One design.set that adds the templates' registered custom properties (`@property`, top-level `properties`) to
    the site's own, because design.set replaces the whole map. A property the site already registers is kept."""
    current = ((site.get('extensions') or {}).get('design') or {}).get('properties') or {}
    merged = dict(current)
    for template in templates:
        for name, spec in (template.get('properties') or {}).items():
            merged.setdefault(name, spec)
    return {'command': 'design.set', 'params': {'key': 'properties', 'value': merged}} if merged != current else None


def shared_variables(site: dict, template: dict) -> list[str]:
    """Variable names a template sets that the site already has: two copies of such a section share that state."""
    group = (site.get('extensions') or {}).get('variables') or {}
    names = []
    for command in template.get('commands') or []:
        params = command.get('params') or {} if isinstance(command, dict) else {}
        if command.get('command') == 'variables.set' and params.get('kind') in ('values', 'tables', 'formulas') and params.get('name') in (group.get(params.get('kind')) or {}):
            names.append(params['name'])
    return names


ASSET_NAME = re.compile(r'/api/assets/([0-9a-f]{64}\.(?:png|jpg|gif|webp|svg|mp4|webm|woff2))')


def media_files() -> dict[str, Path]:
    """Bundled media, content-addressed: library/media/** and library/components/<id>/media/**, keyed by the
    `<sha256>.<ext>` name the asset store gives the same bytes, so templates can point at `/api/assets/<name>`."""
    import hashlib
    found: dict[str, Path] = {}
    for folder in [LIBRARY / 'media', *sorted((LIBRARY / 'components').glob('*/media'))]:
        for path in sorted(p for p in folder.rglob('*') if p.is_file()) if folder.is_dir() else []:
            ext = path.suffix.lower().lstrip('.').replace('jpeg', 'jpg')
            found[hashlib.sha256(path.read_bytes()).hexdigest() + '.' + ext] = path
    return found


def referenced_media(*documents) -> set[str]:
    """Every `/api/assets/<sha256>.<ext>` a template, manifest or starter mentions."""
    return {m.group(1) for doc in documents for m in ASSET_NAME.finditer(json.dumps(doc))}


def missing_components(site: dict, ids: list[str]) -> list[str]:
    present = (((site.get('extensions') or {}).get('code') or {}).get('components') or {})
    return [ident for ident in ids if ident not in present]
