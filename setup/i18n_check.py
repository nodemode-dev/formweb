import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'frontend' / 'src' / 'i18n'
FULL = ['es', 'pt-BR', 'fr', 'de', 'it', 'nl', 'da', 'fi', 'nb', 'sv', 'ru', 'pl', 'cs', 'hu', 'uk', 'tr', 'zh-CN', 'zh-TW', 'ja', 'ko', 'id', 'th', 'vi']
REGIONAL = ['es-MX', 'fr-CA']


def array(path: Path) -> list:
    body = path.read_text(encoding='utf-8')
    start, end = re.search(r'(=|default)\s*\[', body).end() - 1, body.rindex('\n]') + 1
    inner = re.sub(r',\s*$', '', body[start + 1:end].strip())
    return json.loads('[' + inner + ']')


def table(path: Path) -> dict:
    body = path.read_text(encoding='utf-8')
    start, end = body.index('{'), body.rindex('}')
    inner = re.sub(r',\s*$', '', body[start + 1:end].strip())
    return json.loads('{' + inner + '}')


def tokens(text: str) -> list:
    return sorted(re.findall(r'\{\d+\}', text))


def main() -> int:
    keys = array(ROOT / 'keys.ts')
    problems, report = [], []
    for code in FULL:
        path = ROOT / 'locales' / f'{code}.ts'
        if not path.exists():
            problems.append(f'{code}: missing')
            continue
        try:
            values = array(path)
        except (ValueError, json.JSONDecodeError) as error:
            problems.append(f'{code}: not a JSON-style string array ({error})')
            continue
        empty = [i for i, value in enumerate(values) if not isinstance(value, str) or not value.strip()]
        if len(values) != len(keys):
            problems.append(f'{code}: {len(values)} entries for {len(keys)} keys')
        if empty:
            problems.append(f'{code}: empty entries at {empty[:10]}')
        broken = [key for key, value in zip(keys, values) if isinstance(value, str) and tokens(key) != tokens(value)]
        for key in broken[:20]:
            problems.append(f'{code}: placeholders differ for "{key}"')
        same = sum(1 for key, value in zip(keys, values) if key == value)
        report.append(f'{code}: {len(values)} entries, {same} left as English')
    for code in REGIONAL:
        path = ROOT / 'locales' / f'{code}.ts'
        if path.exists():
            try:
                stray = [key for key in table(path) if key not in keys]
                for key, value in table(path).items():
                    if tokens(key) != tokens(value):
                        problems.append(f'{code}: placeholders differ for "{key}"')
                report.append(f'{code}: {len(table(path))} overrides')
                if stray:
                    problems.append(f'{code}: overrides for unknown keys {stray[:5]}')
            except (ValueError, json.JSONDecodeError) as error:
                problems.append(f'{code}: not a JSON-style object ({error})')
    if '--json' in sys.argv:
        print(json.dumps({'keys': len(keys), 'problems': problems, 'report': report}, ensure_ascii=False))
    else:
        print(f'{len(keys)} keys')
        for line in report + problems:
            print(line)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
