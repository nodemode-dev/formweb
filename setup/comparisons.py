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
    if "rows" in data:
        rows, others = data["rows"], data["lanes"][1:]
        grades = [row["m"][0] for row in rows]
        full, partial = grades.count("full"), grades.count("partial")
        documented = {lane[1]: sum(1 for row in rows if row[lane[0]][3] == "documented") for lane in others}
        return {"n": len(rows), "full": full, "partial": partial, "none": len(rows) - full - partial, "pts": full + partial * 0.5, "vendors": list(documented), "documented": documented}
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


DATA = FOLDER / "data" / "formweb-parity.json"
TEMPLATE = FOLDER / "template"
VALUE = {"full": 1.0, "partial": 0.5, "none": 0.0}


def esc(text) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def tally(grades: dict) -> dict:
    values = list(grades.values())
    full, partial = values.count("full"), values.count("partial")
    return {"n": len(values), "full": full, "partial": partial, "none": len(values) - full - partial, "pts": full + partial * 0.5}


def render(data: dict) -> str:
    version, prev = data["version"], data["previous"]
    current = {row["id"]: row["m"][0] for row in data["rows"]}
    snapshots = {**data["grades"], version: current}
    for item in data["history"]:
        if item.get("same_as") in snapshots and item["version"] not in snapshots:
            snapshots[item["version"]] = snapshots[item["same_as"]]
    history = []
    for item in data["history"]:
        grades = snapshots.get(item["version"])
        history.append({**item, **tally(grades)} if grades else item)
    if not any(item["version"] == version for item in history):
        history.append({"version": version, "date": data["date"], "note": data["release_note"], **tally(current)})
    before, after = tally(snapshots[prev]), tally(current)
    changes = [[f"All {after['n']} rows", f"{before['pts']:g} of {before['n']} ({before['full']} Full, {before['partial']} Partial, {before['none']} None)", f"{after['pts']:g} of {after['n']} ({after['full']} Full, {after['partial']} Partial, {after['none']} None)"]]
    closed = []
    for row in data["rows"]:
        old, new = snapshots[prev].get(row["id"]), row["m"][0]
        if old is None:
            changes.append([f"{row['n']} · {row['f']} (new row)", "not in the baseline", f"{new.capitalize()}: {row['m'][1]}"])
        elif old != new:
            changes.append([f"{row['n']} · {row['f']} ({new.capitalize()}, was {old.capitalize()})", old.capitalize(), row["m"][1]])
            if VALUE[new] > VALUE[old]:
                closed.append([f"{row['n']}. {row['f']}", row["m"][1]])
    changes += data["changes"]
    page = {k: data[k] for k in ("lanes", "cats", "short", "src", "rows", "platform", "claims", "vp")}
    page.update(version=version, prev=prev, history=history, changes=changes, closed=closed, closedNote=data["closed_note"])
    lanes = data["lanes"]
    lane_css = "\n".join(f".{k}-full{{background:var(--{v})}} .{k}-partial{{background:linear-gradient(180deg,var(--{v}) 0 50%,var(--{v}-soft) 50% 100%)}} .{k}-none{{background:transparent;box-shadow:inset 0 0 0 1.5px var(--none)}} .mx thead th.{k},.mx td.{k}::before{{color:var(--{v})}} .mx td.{k}{{width:13%}}" for k, _, v in ((lane[0], lane[1], lane[3]) for lane in lanes))
    colors = data["colors"]
    root = ";".join(f"--{name}:{light[0]};--{name}-soft:{light[1]}" for name, light in colors["light"].items())
    dark = ";".join(f"--{name}:{shade[0]};--{name}-soft:{shade[1]}" for name, shade in colors["dark"].items())
    css = (TEMPLATE / "family.css").read_text(encoding="utf-8") + f"\n:root{{{root}}}\n@media (prefers-color-scheme: dark){{:root:not([data-theme=\"light\"]){{{dark}}}}}\n:root[data-theme=\"dark\"]{{{dark}}}\n" + lane_css + "\n.mx tr.now td{background:var(--accent-soft)} .kv{font:11px/1.4 var(--mono);color:var(--faint);margin-top:4px}\n"
    who = "".join(f'<span><i class="sw" style="background:var(--{lane[3]})"></i><b>{esc(lane[1])}</b> {esc(lane[4])}</span>' for lane in lanes)
    tl_rows = "".join(f'<div class="tlrow"><div class="thead" style="color:var(--{lane[3]})">{esc(lane[1])}<small id="sc-{lane[0]}"></small></div><div class="lane" id="lane-{lane[0]}"></div></div>' for lane in lanes)
    key = "".join(f'<span><i style="background:var(--{lane[3]})"></i>{esc(lane[1])}</span>' for lane in lanes)
    tiles = "".join(f'<div class="vc" style="--c:var(--{lane[3]})"><h3>{esc(lane[1])}</h3><div class="score" id="big-{lane[0]}"></div><p id="vp-{lane[0]}"></p></div>' for lane in lanes)
    heads = "".join(f'<th scope="col" class="{lane[0]}">{esc(lane[1])}</th>' for lane in lanes)
    for lane in page["lanes"]:
        lane[2] = f"var(--{lane[3]})"
    payload = json.dumps(page, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    text = data["text"]
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(data["title"])}</title>
<script>/*FA-THEME*/</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,300..900&family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=optional" rel="stylesheet">
<style>
{css}</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <div class="fa-eyebrow">{esc(text["eyebrow"])}</div>
  <h1>{esc(data["title"])}</h1>
  <p class="dek">{esc(text["dek"])}</p>
  <div class="who">{who}<span><i class="sw" style="background:var(--reference)"></i><b>Research baseline</b> {esc(text["baseline"])}</span></div>
</header>
<div class="tl" id="tl" role="img" aria-label="Parity timeline: one segment per researched capability, for the baseline and each product">
  <div class="tlrow"><div></div><div class="lane ruler" id="ruler"></div></div>
  <div class="tlrow"><div class="thead">Research baseline<small>{len(data["rows"])} capabilities</small></div><div class="lane" id="lane-k"></div></div>
  {tl_rows}
  <div class="tlkey">{key}<span><i style="box-shadow:inset 0 0 0 1.5px var(--none)"></i>None or not found</span><span><i class="k-two"></i>Category both Framer and Webflow document</span><span><i class="k-vendor"></i>One vendor's own claim</span></div>
</div>
<div class="verdict">{tiles}</div>
<p class="lede" id="bottomline" style="margin-top:14px"></p>
<section id="changes"><h2>What changed since the v{esc(prev)} page</h2>
<p class="lede">{esc(text["changes"])}</p>
<div class="tablewrap"><table class="mx"><thead><tr><th scope="col">Row</th><th scope="col">v{esc(prev)}</th><th scope="col" class="m">v{esc(version)}</th></tr></thead><tbody id="cx"></tbody></table></div>
<h3 class="subh">Every release so far</h3>
<p class="lede">{esc(text["history"])}</p>
<div class="tablewrap"><table class="mx"><thead><tr><th scope="col">Release</th><th scope="col">Date</th><th scope="col">Rows</th><th scope="col">Full</th><th scope="col">Partial</th><th scope="col">None</th><th scope="col" class="m">Score</th><th scope="col">What moved</th></tr></thead><tbody id="hx"></tbody></table></div></section>
<section id="parity"><h2>Parity, line by line</h2>
<p class="lede">{esc(text["parity"])}</p>
<div class="ctrl"><div class="seg-ctl" role="group" aria-label="Filter rows"><button type="button" data-f="all" aria-pressed="true">All</button><button type="button" data-f="gaps" aria-pressed="false">FormWeb's gaps</button><button type="button" data-f="lead" aria-pressed="false">FormWeb ahead of all four</button><button type="button" data-f="behind" aria-pressed="false">A product ahead of FormWeb</button></div><span class="count" id="rowcount"></span></div>
<div class="tablewrap"><table class="mx"><thead><tr><th scope="col">Capability</th><th scope="col">Target and sources</th>{heads}</tr></thead><tbody id="mx"></tbody></table></div></section>
<section id="exceeds"><h2>Where the builds part ways</h2>
<p class="lede" id="exceeds-lede"></p>
<h3 class="subh">Where FormWeb leads all four</h3><div class="tablewrap"><table class="mx"><thead><tr><th scope="col">Row</th>{heads}</tr></thead><tbody id="ex-m"></tbody></table></div>
<h3 class="subh">Where a product scores above FormWeb</h3><div class="tablewrap"><table class="mx"><thead><tr><th scope="col">Row</th>{heads}</tr></thead><tbody id="ex-b"></tbody></table></div></section>
<section id="merit"><h2>Product and platform</h2>
<div class="tablewrap"><table class="mx"><thead><tr><th scope="col">Area</th>{heads}</tr></thead><tbody id="ex3"></tbody></table></div></section>
<section id="claims"><h2>Claims checked against the sources</h2><div class="facts" id="facts"></div></section>
<section id="reference"><h2>What none of the five has yet</h2><ul class="imp-list" id="psfacts"></ul></section>
<section id="improve"><h2>Where FormWeb can improve</h2>
<div class="imp-summary"><div class="n"><b id="n-high"></b>None</div><div class="n"><b id="n-med"></b>Partial</div><div class="n"><b id="n-done"></b>Closed since v{esc(prev)}</div></div>
<h3 class="subh">Closed since v{esc(prev)}</h3><ul class="imp-list" id="imp-done"></ul>
<h3 class="subh">Still open</h3><ul class="imp-list" id="imp-ps"></ul></section>
<section id="sources"><h2>Sources and method</h2>
<div class="method">{"".join(f"<p><b>{esc(k)}.</b> {esc(v)}</p>" for k, v in text["method"])}</div>
<ul class="srclist" id="srclist"></ul></section>
<footer>{esc(text["footer"])}</footer>
</div>
<script id="data" type="application/json">{payload}</script>
<script>
{(TEMPLATE / "family.js").read_text(encoding="utf-8")}</script>
</body>
</html>
'''


def build(args) -> dict:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    version = args.version or data["version"]
    if version != data["version"]:
        return {"ok": False, "error": f"data is for v{data['version']}, not v{version}", "hint": "update version in docs/comparisons/data/formweb-parity.json"}
    target = page_path(version)
    html = render(data)
    same = target.is_file() and target.read_text(encoding="utf-8") == html
    result = {"ok": True, "version": version, "page": str(target.relative_to(ROOT)), "current": same, "rows": len(data["rows"])}
    if same:
        result["action"] = "none"
    elif args.check:
        result.update(ok=False, action="would build")
    else:
        target.write_text(html, encoding="utf-8")
        result["action"] = "built"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(prog="formweb comparisons", description="Release the FormWeb comparison page into the consolidated FormAI matrix.")
    parser.add_argument("command", choices=["status", "build", "embed"], help="status reports whether the matrix carries the release page; build renders the family-format page from docs/comparisons/data/formweb-parity.json; embed appends the page to the matrix as the newest web override")
    parser.add_argument("--version", help="comparison page version (default: the VERSION file, else the newest FormWeb-Parity_v*.html)")
    parser.add_argument("--check", action="store_true", help="with embed: change nothing, exit 1 when the matrix is stale")
    parser.add_argument("--json", action="store_true", help="print one JSON object for agents")
    args = parser.parse_args()
    result = build(args) if args.command == "build" else run(args)
    if args.json:
        print(json.dumps(result))
    elif not result["ok"] and "error" in result:
        print(f"comparisons: {result['error']} ({result['hint']})")
    elif args.command == "build":
        print(f"comparisons: v{result['version']} page, {result['rows']} rows, {result['page']}; action: {result['action']}")
    else:
        state = "current" if result["current"] else "stale"
        print(f"comparisons: v{result['version']} page, {result['rows']} rows, FormWeb {result['formweb']}")
        print(f"comparisons: matrix is {state}; action: {result['action']}")
        for name, count in result["documented"].items():
            print(f"comparisons:   {name} {count} of {result['rows']} documented")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
