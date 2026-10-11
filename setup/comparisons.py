#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FOLDER = ROOT / "docs" / "comparisons"
MATRIX = FOLDER / "FormAI-Parity-Matrix-consolidated.html"
PAGE_LINE = re.compile(r"^  PAGES\.web = (\".*\");$", re.M)
DATA_BLOCK = r'<script id="{}" type="application/json">(.*?)</script>'
VENDORS = (("framer", "Framer"), ("webflow", "Webflow"), ("x", "Adobe Express"), ("c", "Canva"))


def release_version() -> str:
    return (ROOT / "VERSION").read_text(encoding="utf-8").strip()


def page_path(version: str) -> Path:
    return FOLDER / f"FormWeb-Parity_v{version}.html"


def block(page: str, name: str):
    match = re.search(DATA_BLOCK.format(name), page, re.S)
    return json.loads(match.group(1)) if match else None


def summary(page: str) -> dict:
    data = block(page, "data")
    if data is None:
        raise ValueError("comparison page has no data block")
    lanes = block(page, "data-lanes") or {"lanes": {}, "features": []}
    features = list(data["features"])
    for feature in features:
        lane = lanes["lanes"].get(feature["id"], {})
        feature.setdefault("x", lane.get("x", {"status": "not verified"}))
        feature.setdefault("c", lane.get("c", {"status": "not verified"}))
    features += lanes["features"]
    grades = [(f.get("audit") or {}).get("grade", "none") for f in features]
    full, partial = grades.count("full"), grades.count("partial")
    names = [label for key, label in VENDORS if all(key in f for f in features)]
    documented = {label: sum(1 for f in features if f[key]["status"] == "documented") for key, label in VENDORS if label in names}
    return {"n": len(features), "full": full, "partial": partial, "none": len(features) - full - partial, "pts": full + partial * 0.5, "vendors": names, "documented": documented}


def embedded(matrix: str):
    found = PAGE_LINE.findall(matrix)
    return json.loads(found[-1]) if found else None


def override(version: str, page: str, info: dict) -> str:
    vendors = info["vendors"]
    scores = {"h1": "FormWeb, measured against " + ", ".join(vendors[:-1]) + " and " + vendors[-1], "baseline": {"name": "Research baseline", "note": f"{info['n']} researched targets across {len(vendors)} vendors; vendor tiles report documented coverage", "extra": vendors}, "rows": [{"name": "FormWeb", "pts": info["pts"], "n": info["n"], "full": info["full"], "partial": info["partial"], "none": info["none"], "segs": info["n"]}], "refsc": {}}
    meta = f'  META.forEach(function(g){{ g.items.forEach(function(p){{ if(p.id === "web") {{ p.desc = "Visual website builder, {len(vendors)}-vendor comparison at {version}"; p.base = {json.dumps(" and ".join([", ".join(vendors[:-1]), vendors[-1]]))}; p.built = true; p.status = "dev"; }} }}); }});'
    serialized = json.dumps(page, ensure_ascii=False).replace("<", "\\u003c")
    return "\n".join(["  SCORES.web = " + json.dumps(scores, separators=(",", ":")) + ";", meta, "  PAGES.web = " + serialized + ";"])


def newest_page_version() -> str | None:
    found = [m.group(1) for p in FOLDER.glob("FormWeb-Parity_v*.html") if (m := re.fullmatch(r"FormWeb-Parity_v(\d+\.\d+\.\d+)\.html", p.name))]
    return max(found, key=lambda v: tuple(int(n) for n in v.split("."))) if found else None


def run(args) -> dict:
    version = args.version or release_version()
    if not args.version and not page_path(version).is_file():
        version = newest_page_version() or version
    source = page_path(version)
    if not source.is_file():
        return {"ok": False, "error": f"missing {source.relative_to(ROOT)}", "hint": "write the release comparison page first"}
    page = source.read_text(encoding="utf-8")
    info = summary(page)
    matrix = MATRIX.read_text(encoding="utf-8")
    current = embedded(matrix) == page
    result = {"ok": True, "version": version, "page": str(source.relative_to(ROOT)), "matrix": str(MATRIX.relative_to(ROOT)), "current": current, "rows": info["n"], "formweb": f"{info['pts']:g} of {info['n']} weighted", "documented": info["documented"]}
    if args.command == "status" or current:
        result["action"] = "none" if current else "run ./formweb comparisons embed"
        return result
    if args.check:
        result.update(ok=False, action="would embed")
        return result
    last = list(PAGE_LINE.finditer(matrix))[-1]
    MATRIX.write_text(matrix[:last.end()] + "\n" + override(version, page, info) + matrix[last.end():], encoding="utf-8")
    result["action"] = "embedded"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(prog="formweb comparisons", description="Release the FormWeb comparison page into the consolidated FormAI matrix.")
    parser.add_argument("command", choices=["status", "embed"], help="status reports whether the matrix carries the release page; embed appends it as the newest web override")
    parser.add_argument("--version", help="comparison page version (default: the VERSION file, else the newest FormWeb-Parity_v*.html)")
    parser.add_argument("--check", action="store_true", help="with embed: change nothing, exit 1 when the matrix is stale")
    parser.add_argument("--json", action="store_true", help="print one JSON object for agents")
    args = parser.parse_args()
    result = run(args)
    if args.json:
        print(json.dumps(result))
    elif not result["ok"] and "error" in result:
        print(f"comparisons: {result['error']} ({result['hint']})")
    else:
        state = "current" if result["current"] else "stale"
        print(f"comparisons: v{result['version']} page, {result['rows']} rows, FormWeb {result['formweb']}")
        print(f"comparisons: matrix is {state}; action: {result['action']}")
        for name, count in result["documented"].items():
            print(f"comparisons:   {name} {count} of {result['rows']} documented")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
