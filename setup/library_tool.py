"""./formweb library check | build [--check] [--root DIR] [--json]

check  validates every component manifest and source, section template, preset and starter under library/.
build  compiles every page component with setup/build_component.mjs into library/build/components/<id>.json, the
       records the Library routes install without needing Node. --check rebuilds in memory and fails on any drift.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))

FORBIDDEN = ('import ', 'import(', 'import\n', 'require(', 'export *', " from '")
PROP_TYPES = ('string', 'number', 'boolean', 'json', 'color', 'asset')
SOURCE_CAP = 256 * 1024
FIELD_TYPES = ('text', 'longtext', 'color', 'url', 'asset', 'number')


def problems_in(library, lib: Path) -> list[str]:
    out: list[str] = []

    def bad(where: str, message: str) -> None:
        out.append(f'{where}: {message}')

    def read(path: Path):
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError) as error:
            bad(str(path.relative_to(lib)), f'unreadable JSON ({error})')
            return None

    components: dict[str, dict] = {}
    for folder in sorted(p for p in (lib / 'components').glob('*') if p.is_dir()):
        where = f'components/{folder.name}'
        data = read(folder / 'manifest.json') if (folder / 'manifest.json').is_file() else None
        if data is None:
            if not (folder / 'manifest.json').is_file():
                bad(where, 'manifest.json is missing')
            continue
        if data.get('format') != 'formweb-component' or data.get('version') != 1:
            bad(where, 'format must be formweb-component version 1')
        if data.get('id') != folder.name or not library.IDENT.fullmatch(folder.name):
            bad(where, 'id must match the folder name and be an identifier')
        for key in ('code', 'name', 'description', 'source'):
            if not isinstance(data.get(key), str) or not data.get(key):
                bad(where, f'{key} is required')
        props = data.get('props')
        if not isinstance(props, dict):
            bad(where, 'props must be an object')
            props = {}
        for name, prop in props.items():
            if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,95}', name):
                bad(where, f'prop {name} is not a valid name')
            if not isinstance(prop, dict) or set(prop) - {'type', 'required', 'default'}:
                bad(where, f'prop {name} may only carry type, required and default')
                continue
            if prop.get('type') not in PROP_TYPES:
                bad(where, f'prop {name} has an unknown type')
        for name in (data.get('labels') or {}):
            if name not in props:
                bad(where, f'label for unknown prop {name}')
        sources = [p for p in (folder / 'component.js', folder / 'component.ts') if p.is_file()]
        if len(sources) != 1:
            bad(where, 'needs exactly one component.js or component.ts')
        else:
            source = sources[0].read_text(encoding='utf-8')
            if len(source.encode('utf-8')) > SOURCE_CAP:
                bad(where, 'source is over 256 KiB')
            for needle in FORBIDDEN:
                if needle in source:
                    line = source[:source.index(needle)].count('\n') + 1
                    bad(where, f'source contains {needle!r} at line {line}; components cannot bring in dependencies')
            if not re.search(r'export\s+function\s+mount\s*\(', source):
                bad(where, 'source must export function mount(root, props, ctx)')
        poster = folder / (data.get('poster') or 'poster.webp')
        if not poster.is_file():
            bad(where, f'poster {poster.name} is missing')
        components[folder.name] = data

    media = library.media_files()
    sections: dict[str, dict] = {}
    for path in sorted((lib / 'sections').glob('*.json')):
        where = f'sections/{path.name}'
        data = read(path)
        if data is None:
            continue
        sections[path.stem] = data
        if data.get('format') != 'formweb-section' or data.get('version') != 1:
            bad(where, 'format must be formweb-section version 1')
        if data.get('id') != path.stem:
            bad(where, 'id must match the file name')
        if data.get('category') not in library.CATEGORIES:
            bad(where, f'category must be one of {", ".join(library.CATEGORIES)}')
        for key in ('name', 'description', 'source', 'product'):
            if not isinstance(data.get(key), str) or not data.get(key):
                bad(where, f'{key} is required')
        if data.get('preset') and not (lib / 'presets' / f'{data["preset"]}.json').is_file():
            bad(where, f'preset {data["preset"]} does not exist')
        if not (lib / 'sections' / 'thumbs' / f'{path.stem}.webp').is_file():
            bad(where, 'thumbnail sections/thumbs/<id>.webp is missing')
        fields = data.get('fields') or {}
        for name, spec in fields.items():
            if not re.fullmatch(r'[A-Za-z0-9_]{1,40}', name):
                bad(where, f'field {name} is not a valid name')
            if not isinstance(spec, dict) or spec.get('type', 'text') not in FIELD_TYPES or not spec.get('label'):
                bad(where, f'field {name} needs a label and a known type')
                continue
            try:
                library.field_values({'id': path.stem, 'fields': {name: spec}}, {name: spec.get('default')})
            except Exception as error:  # EngineError carries the message a designer would see
                bad(where, f'field {name} default: {error}')
        keys: set[str] = set()

        def walk(node, depth=0):
            if not isinstance(node, dict) or set(node) - library.NODE_KEYS:
                bad(where, f'tree node {node.get("key") if isinstance(node, dict) else node!r} has unknown keys')
                return
            key = node.get('key')
            if not isinstance(key, str) or not library.KEY.fullmatch(key):
                bad(where, f'tree node key {key!r} is not valid')
            elif key in keys:
                bad(where, f'tree node key {key} is used twice')
            else:
                keys.add(key)
            if not isinstance(node.get('tag'), str):
                bad(where, f'tree node {key} needs a tag')
            for child in node.get('children') or []:
                walk(child, depth + 1)

        if not isinstance(data.get('tree'), dict):
            bad(where, 'tree is required')
        else:
            walk(data['tree'])
        text = json.dumps({k: data.get(k) for k in ('tree', 'commands', 'behaviors')})
        for ref in sorted(set(library.NODE_REF.findall(text)) - keys):
            bad(where, f'@@{ref}@@ names no node key')
        for ref in sorted(set(library.FIELD_REF.findall(text)) - set(fields)):
            bad(where, '{{' + ref + '}} names no field')
        used = set()
        for command in data.get('commands') or []:
            name = command.get('command') if isinstance(command, dict) else None
            if name == 'extension.set':
                bad(where, 'extension.set replaces a whole group; use behaviors or a group command')
            if name == 'design.set':
                bad(where, 'design.set replaces a whole design map; use the top-level properties map or the preset')
            if name == 'code.instance.set':
                value = (command.get('params') or {}).get('value') or {}
                cid = value.get('component')
                used.add(cid)
                if cid not in components:
                    bad(where, f'code.instance.set names unknown component {cid}')
                    continue
                declared = components[cid].get('props') or {}
                for prop in (value.get('props') or {}):
                    if prop not in declared:
                        bad(where, f'component {cid} has no prop {prop}')
                for prop, spec in declared.items():
                    if isinstance(spec, dict) and spec.get('required') and prop not in (value.get('props') or {}) and 'default' not in spec:
                        bad(where, f'component {cid} needs prop {prop}')
        for cid in data.get('components') or []:
            if cid not in components:
                bad(where, f'components lists unknown component {cid}')
        for name, spec in (data.get('properties') or {}).items():
            if not isinstance(spec, dict) or set(spec) - {'syntax', 'inherits', 'initial'}:
                bad(where, f'registered property {name} may only carry syntax, inherits and initial')
        bundled = media if media is not None else {}
        for ref in sorted(library.referenced_media(data, *(components.get(c, {}) for c in data.get('components') or []))):
            if ref not in bundled:
                bad(where, f'/api/assets/{ref} is not bundled in library/media or a component media folder')
        for cid in used - set(data.get('components') or []):
            bad(where, f'component {cid} is used but not listed in components')
        try:
            library.expand(data, 'root', suffix='abc123')
        except Exception as error:
            bad(where, f'does not expand: {error}')

    for path in sorted((lib / 'presets').glob('*.json')):
        data = read(path)
        if data is None:
            continue
        where = f'presets/{path.name}'
        if data.get('format') != 'formweb-preset' or data.get('id') != path.stem:
            bad(where, 'format must be formweb-preset and id must match the file name')
        for key, face in (data.get('fonts') or {}).items():
            if not (lib / 'presets' / face.get('file', '')).is_file():
                bad(where, f'font {key} file is missing')
        for name, preset in (data.get('textPresets') or {}).items():
            if not isinstance(preset, dict) or not isinstance(preset.get('styles'), dict):
                bad(where, f'text preset {name} needs styles')

    for path in sorted((lib / 'starters').glob('*.json')):
        data = read(path)
        if data is None:
            continue
        where = f'starters/{path.name}'
        if data.get('format') != 'formweb-starter' or data.get('id') != path.stem:
            bad(where, 'format must be formweb-starter and id must match the file name')
        slugs = set()
        for page in data.get('pages') or []:
            if page.get('slug') in slugs:
                bad(where, f'slug {page.get("slug")} is used twice')
            slugs.add(page.get('slug'))
            for sid in page.get('sections') or []:
                if sid not in sections:
                    bad(where, f'page {page.get("name")} names unknown section {sid}')
    return out


def node_binary() -> str | None:
    return os.getenv('FORMWEB_NODE_BIN') or shutil.which('node')


def compile_one(library, lib: Path, cid: str) -> dict:
    manifest = json.loads((lib / 'components' / cid / 'manifest.json').read_text(encoding='utf-8'))
    source, language = library.component_source(cid)
    props = manifest.get('props') or {}
    forwarded = {name: {**spec, 'type': 'string'} if spec.get('type') in ('color', 'asset') else spec for name, spec in props.items()}
    request = json.dumps({'enabled': True, 'language': language, 'mode': 'page', 'source': source, 'props': forwarded}, ensure_ascii=False)
    node = node_binary()
    if not node or not (ROOT / 'frontend/node_modules/typescript/bin/tsc').is_file():
        raise SystemExit('library build needs Node and the pinned frontend compiler; run ./formweb install')
    done = subprocess.run([node, str(ROOT / 'setup/build_component.mjs')], input=request.encode('utf-8'), capture_output=True, cwd=str(ROOT), timeout=120)
    result = json.loads(done.stdout or b'{}')
    if not result.get('ok'):
        raise ValueError(str(result.get('diagnostics') or done.stderr.decode(errors='replace'))[:4000])
    component = result['component']
    return {'enabled': True, 'language': language, 'mode': 'page', 'source': component['source'], 'sourceDigest': component['sourceDigest'],
            'builtDigest': component['builtDigest'], 'javascript': component['javascript'], 'props': props}


def dumps(record: dict) -> str:
    return json.dumps(record, ensure_ascii=False, indent=1, sort_keys=True) + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(prog='./formweb library', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=('check', 'build'))
    parser.add_argument('--check', action='store_true', help='build: compare with the files on disk and change nothing')
    parser.add_argument('--root', help='library folder (default: library/ in this repo, or FORMWEB_LIBRARY_DIR)')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    if args.root:
        os.environ['FORMWEB_LIBRARY_DIR'] = str(Path(args.root).resolve())
    from app import library
    lib = library.LIBRARY
    if args.action == 'check':
        found = problems_in(library, lib)
        counts = {name: len(list((lib / name).glob('*/manifest.json' if name == 'components' else '*.json'))) for name in ('components', 'sections', 'presets', 'starters')}
        if args.json:
            print(json.dumps({'ok': not found, 'counts': counts, 'problems': found}, indent=1))
        else:
            for line in found:
                print(line)
            print(f'library check: {counts["components"]} components, {counts["sections"]} sections, {counts["presets"]} presets, {counts["starters"]} starters, {len(found)} problems')
        return 1 if found else 0
    out_dir = lib / 'build' / 'components'
    ids = sorted(p.parent.name for p in (lib / 'components').glob('*/manifest.json'))
    drift, failed, written = [], [], []
    for cid in ids:
        try:
            text = dumps(compile_one(library, lib, cid))
        except ValueError as error:
            failed.append(f'{cid}: {error}')
            continue
        target = out_dir / f'{cid}.json'
        current = target.read_text(encoding='utf-8') if target.is_file() else None
        if current != text:
            if args.check:
                drift.append(cid)
            else:
                out_dir.mkdir(parents=True, exist_ok=True)
                target.write_text(text, encoding='utf-8')
                written.append(cid)
    stale = sorted(p.stem for p in out_dir.glob('*.json') if p.stem not in ids) if out_dir.is_dir() else []
    if stale and not args.check:
        for cid in stale:
            (out_dir / f'{cid}.json').unlink()
    report = {'components': len(ids), 'written': written, 'drift': drift, 'stale': stale, 'failed': failed}
    if args.json:
        print(json.dumps(report, indent=1))
    else:
        for line in failed:
            print('failed ' + line)
        for cid in drift:
            print(f'drift {cid}: library/build/components/{cid}.json is not what the source compiles to; run ./formweb library build')
        for cid in stale if args.check else []:
            print(f'stale {cid}: library/build/components/{cid}.json has no component')
        print(f'library build: {len(ids)} components, {len(written)} written, {len(drift)} drifted, {len(stale)} stale, {len(failed)} failed')
    return 1 if failed or (args.check and (drift or stale)) else 0


if __name__ == '__main__':
    sys.exit(main())
