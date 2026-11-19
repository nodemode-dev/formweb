"""./formweb library list|insert|preset|starter against the running service: list reads the same routes the Library panel uses; insert, preset and starter go through the MCP endpoint and its library tools.

  ./formweb library list [sections|components|presets|starters] [--category ID] [words ...]
  ./formweb library insert SECTION [field=value ...] [--parent NODE] [--page PAGE] [--index N]
  ./formweb library preset PRESET [--all]        without --all only values the site lacks are added
  ./formweb library starter STARTER [field=value ...]
Add --json for machine output, --update-components to replace a site's own copy of a page component.
Writes go through the MCP endpoint like any outside agent: Agents must be on in the editor, the editor's approval settings apply, and each write is one undo step in the open editor. FORMWEB_PORT or FORMWEB_API picks the server (default 8240).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from run import call, tool  # noqa: E402

TEXT_FIELDS = ('text', 'longtext', 'url', 'asset', 'color')


def cast(specs: dict, pairs: list[str]) -> dict:
    """field=value pairs; numbers only where the template declares a number field, everything else stays text."""
    values = {}
    for item in pairs:
        key, found, raw = item.partition('=')
        if not found or not key:
            raise SystemExit(f'[formweb] field values look like name=value, not {item!r}')
        spec = specs.get(key)
        if spec is None and specs:
            raise SystemExit(f'[formweb] unknown field {key}; this template has: ' + ', '.join(sorted(specs)))
        if (spec or {}).get('type') == 'number':
            try:
                values[key] = json.loads(raw)
            except ValueError:
                raise SystemExit(f'[formweb] field {key} needs a number, not {raw!r}')
        else:
            values[key] = raw
    return values


def fields_of(kind: str, ident: str) -> dict:
    found = next((item for item in call('/api/library')[kind] if item['id'] == ident), None)
    if found is None:
        raise SystemExit(f'[formweb] library has no {kind[:-1]} {ident}; ./formweb library list {kind} shows them')
    return found.get('fields') or {}


def starter_fields(ident: str) -> dict:
    index = call('/api/library')
    starter = next((item for item in index['starters'] if item['id'] == ident), None)
    if starter is None:
        raise SystemExit(f'[formweb] library has no starter {ident}; ./formweb library list starters shows them')
    names = {sid for page in starter.get('pages') or [] for sid in page.get('sections') or []}
    fields = {}
    for item in index['sections']:
        if item['id'] in names:
            fields.update(item.get('fields') or {})
    return fields


def options(argv: list[str], names: tuple[str, ...]) -> tuple[list[str], dict]:
    rest, found, i = [], {}, 0
    while i < len(argv):
        if argv[i] in names:
            if i + 1 >= len(argv):
                raise SystemExit(f'[formweb] {argv[i]} needs a value')
            found[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            rest.append(argv[i])
            i += 1
    return rest, found


def show(label: str, result: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps({key: result.get(key) for key in ('revision', 'canUndo', 'root', 'pages', 'changed', 'warnings')}))
        return
    print(f"[formweb] {label}; revision {result.get('revision')}. One undo step in the editor.")
    for line in result.get('warnings') or []:
        print('  note: ' + line)


def main(argv: list[str]) -> int:
    as_json = '--json' in argv
    update = '--update-components' in argv
    everything = '--all' in argv
    argv = [item for item in argv if item not in ('--json', '--update-components', '--all')]
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__.strip())
        return 0
    action, rest = argv[0], argv[1:]
    if action == 'list':
        rest, opts = options(rest, ('--category',))
        kinds = ('sections', 'components', 'presets', 'starters')
        kind = rest.pop(0) if rest and rest[0] in kinds else None
        index = call('/api/library')
        words = [w.lower() for w in rest]
        out = {}
        for key in kinds:
            if kind and key != kind:
                continue
            out[key] = [item for item in index[key]
                        if (not opts.get('category') or item.get('category') == opts['category'])
                        and all(w in (' '.join(str(item.get(k) or '') for k in ('id', 'name', 'description', 'category')) + ' ' + ' '.join(map(str, item.get('tags') or []))).lower() for w in words)]
        if as_json:
            print(json.dumps(out, indent=1))
            return 0
        for key, items in out.items():
            print(f'{key} ({len(items)})')
            for item in items:
                extra = f"  [{item['category']}]" if item.get('category') else ''
                fields = item.get('fields')
                print(f"  {item['id']}{extra}  {item.get('name') or ''}" + (f"  fields: {', '.join(sorted(fields))}" if fields else ''))
        return 0
    if action == 'insert':
        rest, opts = options(rest, ('--parent', '--page', '--index'))
        if not rest:
            raise SystemExit('[formweb] usage: ./formweb library insert SECTION [field=value ...]')
        body = {'section': rest[0], 'values': cast(fields_of('sections', rest[0]), rest[1:]), 'update_components': update}
        for key in ('parent', 'page'):
            if key in opts:
                body[key] = opts[key]
        if 'index' in opts:
            try:
                body['index'] = int(opts['index'])
            except ValueError:
                raise SystemExit('[formweb] --index needs a number')
        result = tool('library_insert', body)
        show(f"inserted {rest[0]} as {result.get('root')}", result, as_json)
        return 0
    if action == 'preset':
        if len(rest) != 1:
            raise SystemExit('[formweb] usage: ./formweb library preset PRESET [--all]')
        result = tool('library_apply_preset', {'preset': rest[0], 'mode': 'all' if everything else 'missing'})
        show(f"preset {rest[0]} " + ('applied' if result.get('changed') else 'already in place'), result, as_json)
        return 0
    if action == 'starter':
        if not rest:
            raise SystemExit('[formweb] usage: ./formweb library starter STARTER [field=value ...]')
        result = tool('library_apply_starter', {'starter': rest[0], 'values': cast(starter_fields(rest[0]), rest[1:]), 'update_components': update})
        show(f"starter {rest[0]} built: pages {', '.join(result.get('pages') or [])}", result, as_json)
        return 0
    raise SystemExit(f'[formweb] unknown library action {action}')


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
