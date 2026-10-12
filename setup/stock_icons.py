#!/usr/bin/env python3
"""Rebuild FormWeb's bundled icon set (FW-073) from an unpacked lucide-static npm package.

  npm pack lucide-static@1.55.0 && tar xzf lucide-static-1.55.0.tgz
  python3 setup/stock_icons.py package

Writes backend/app/stock/lucide.json (each icon's drawing nodes, search tags and licence) and
backend/app/stock/LICENSE-lucide.txt (the package's licence text, which must travel with the icons).
Icons the licence lists as derived from Feather are marked MIT; the rest are ISC.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'backend' / 'app' / 'stock'
ALLOWED = {'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'}
EMOJI = re.compile('[' + ''.join(map(chr, (0x2014, 0x200D, 0x2600))) + '-' + chr(0x27BF) + chr(0xFE0F) + chr(0x1F300) + '-' + chr(0x1FAFF) + ']')


def main(package: Path) -> None:
    meta = json.loads((package / 'package.json').read_text(encoding='utf-8'))
    nodes = json.loads((package / 'icon-nodes.json').read_text(encoding='utf-8'))
    tags = json.loads((package / 'tags.json').read_text(encoding='utf-8'))
    licence = (package / 'LICENSE').read_text(encoding='utf-8')
    feather_block = licence.split('derived from the Feather project:', 1)[1].split('The MIT License', 1)[0]
    feather = {name.strip() for name in feather_block.replace('\n', ' ').split(',') if name.strip()}
    icons = {}
    for name in sorted(nodes):
        drawing = [[tag, attrs] for tag, attrs in nodes[name] if tag in ALLOWED]
        if not drawing or len(drawing) != len(nodes[name]) or not re.fullmatch(r'[a-z0-9-]+', name):
            raise SystemExit(f'unexpected icon {name}: only {sorted(ALLOWED)} are bundled')
        # Some upstream tags are emoji; the repository bans emoji, and tags are only search aids, so those are dropped.
        words = [tag for tag in tags.get(name, []) if not EMOJI.search(tag)]
        icons[name] = {'n': drawing, 't': words, 'l': 'MIT' if name in feather else 'ISC'}
    OUT.mkdir(parents=True, exist_ok=True)
    bundle = {'source': 'lucide-static', 'version': meta['version'], 'license': meta['license'], 'homepage': 'https://lucide.dev', 'icons': icons}
    (OUT / 'lucide.json').write_text(json.dumps(bundle, separators=(',', ':'), ensure_ascii=False) + '\n', encoding='utf-8')
    (OUT / 'LICENSE-lucide.txt').write_text(licence, encoding='utf-8')
    print(f'stock icons: {len(icons)} from lucide-static {meta["version"]} ({sum(1 for i in icons.values() if i["l"] == "MIT")} MIT, rest ISC)')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]))
