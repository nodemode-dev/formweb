use crate::{Node, Site};
use serde_json::Value;
use std::collections::BTreeSet;

const SHARED: &[&str] = &[
    "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset",
    "fill-rule", "fill-opacity", "stroke-opacity", "transform", "vector-effect", "opacity", "data-fw-vector",
    "clip-path", "mask", "paint-order", "clip-rule", "data-fw-align", "data-fw-weight", "data-fw-width", "data-fw-mask", "data-fw-type",
    "data-fw-blend", "data-fw-repeat", "data-fw-live", "data-fw-brush", "data-fw-brushdef", "data-fw-stroke", "data-fw-compound", "visibility", "data-fw-warp", "data-fw-effect",
];
const DATA_LIMIT: usize = 262_144;

pub fn is_tag(tag: &str) -> bool {
    matches!(tag, "svg" | "g" | "path" | "defs" | "linearGradient" | "radialGradient" | "stop" | "clipPath" | "mask" | "text" | "textPath" | "symbol" | "use")
}

pub fn attr_allowed(tag: &str, name: &str) -> bool {
    if !is_tag(tag) {
        return false;
    }
    let drawn = matches!(tag, "svg" | "g" | "path" | "text" | "textPath" | "symbol" | "use");
    (drawn && SHARED.contains(&name))
        || (tag == "path" && name == "d")
        || (tag == "svg" && matches!(name, "viewBox" | "preserveAspectRatio"))
        || (tag == "linearGradient" && matches!(name, "x1" | "y1" | "x2" | "y2" | "gradientUnits" | "gradientTransform" | "spreadMethod"))
        || (tag == "radialGradient" && matches!(name, "cx" | "cy" | "r" | "fx" | "fy" | "gradientUnits" | "gradientTransform" | "spreadMethod"))
        || (tag == "stop" && matches!(name, "offset" | "stop-color" | "stop-opacity"))
        || (tag == "clipPath" && name == "clipPathUnits")
        || (tag == "mask" && matches!(name, "maskUnits" | "maskContentUnits" | "x" | "y"))
        || (tag == "text" && matches!(name, "x" | "y" | "dy" | "font-size" | "font-family" | "font-weight" | "letter-spacing" | "text-anchor"))
        || (tag == "textPath" && matches!(name, "startOffset" | "dy"))
        || (tag == "use" && matches!(name, "x" | "y" | "width" | "height"))
}

pub fn max_len(tag: &str, name: &str) -> usize {
    if is_tag(tag) && matches!(name, "d" | "data-fw-vector" | "data-fw-width" | "data-fw-warp") { DATA_LIMIT } else { 10000 }
}

fn child_ok(parent: &str, child: &str) -> bool {
    match parent {
        "svg" | "g" => matches!(child, "g" | "path" | "defs" | "linearGradient" | "radialGradient" | "clipPath" | "mask" | "text" | "use"),
        "defs" => matches!(child, "linearGradient" | "radialGradient" | "clipPath" | "mask" | "symbol"),
        "symbol" => matches!(child, "g" | "path" | "text"),
        "linearGradient" | "radialGradient" => child == "stop",
        "clipPath" => child == "path",
        "mask" => matches!(child, "g" | "path"),
        "text" => child == "textPath",
        _ => false,
    }
}

#[derive(Default)]
struct Refs {
    defined: BTreeSet<String>,
    paths: BTreeSet<String>,
    used: Vec<String>,
    hrefs: Vec<String>,
    symbols: BTreeSet<String>,
    uses: Vec<String>,
    arts: Vec<String>,
}

fn art_of(node: &Node, name: &str) -> Option<String> {
    let value: Value = serde_json::from_str(node.attrs.get(name)?).ok()?;
    value.get("art").and_then(Value::as_str).filter(|id| !id.is_empty()).map(str::to_string)
}

fn holds_use(site: &Site, node: &Node, depth: usize) -> bool {
    depth > 64 || node.children.iter().filter_map(|id| site.nodes.get(id)).any(|child| child.tag == "use" || holds_use(site, child, depth + 1))
}

fn url_target(value: &str) -> Option<&str> {
    value.strip_prefix("url(#").and_then(|rest| rest.strip_suffix(')'))
}

fn scan(site: &Site, node: &Node, depth: usize, refs: &mut Refs) -> Result<(), String> {
    if depth > 64 { return Err("vector nesting exceeds 64".into()); }
    if let Some(id) = node.attrs.get("id") {
        if matches!(node.tag.as_str(), "linearGradient" | "radialGradient" | "clipPath" | "mask") { refs.defined.insert(id.clone()); }
        if node.tag == "path" { refs.paths.insert(id.clone()); }
    }
    for name in ["fill", "stroke", "clip-path", "mask"] {
        if let Some(target) = node.attrs.get(name).and_then(|value| url_target(value)) { refs.used.push(target.to_string()); }
    }
    if node.tag == "textPath" {
        if let Some(target) = node.attrs.get("href") { refs.hrefs.push(target.trim_start_matches('#').to_string()); }
    }
    if node.tag == "g" { if let Some(id) = art_of(node, "data-fw-brush") { refs.arts.push(id); } }
    if node.tag == "symbol" {
        if let Some(id) = art_of(node, "data-fw-brushdef") { refs.arts.push(id); }
        if holds_use(site, node, 0) { return Err("a symbol cannot contain use elements".into()); }
        if let Some(id) = node.attrs.get("id") { refs.symbols.insert(id.clone()); }
    }
    if node.tag == "use" {
        match node.attrs.get("href") { Some(target) => refs.uses.push(target.trim_start_matches('#').to_string()), None => return Err("a use element needs an href".into()) }
    }
    for child in &node.children {
        if let Some(child) = site.nodes.get(child) { scan(site, child, depth + 1, refs)?; }
    }
    Ok(())
}

pub fn check_node(node: &Node, site: &Site) -> Result<(), String> {
    let vector_parent = is_tag(&node.tag);
    if vector_parent && !node.text.is_empty() && node.tag != "textPath" { return Err("vector elements cannot contain text".into()); }
    if node.tag == "textPath" && (node.text.chars().count() > 500 || node.text.contains(['<', '>'])) { return Err("path text is too long or has markup".into()); }
    if node.tag == "path" && !node.children.is_empty() { return Err("path cannot have children".into()); }
    for child in &node.children {
        let Some(child) = site.nodes.get(child) else { continue };
        let vector_child = is_tag(&child.tag);
        if vector_parent && !child_ok(&node.tag, &child.tag) { return Err(format!("{} cannot contain {}", node.tag, child.tag)); }
        if !vector_parent && vector_child && child.tag != "svg" { return Err("vector elements must live inside an svg element".into()); }
    }
    if node.tag == "svg" {
        let mut refs = Refs::default();
        scan(site, node, 0, &mut refs)?;
        if refs.used.iter().any(|id| !refs.defined.contains(id)) { return Err("paint, clip and mask references must point at definitions inside the same svg".into()); }
        if refs.hrefs.iter().any(|id| !refs.paths.contains(id)) { return Err("text on a path must reference a path inside the same svg".into()); }
        if refs.uses.iter().any(|id| !refs.symbols.contains(id)) { return Err("a use element must point at a symbol inside the same svg".into()); }
        if refs.arts.iter().any(|id| !refs.symbols.contains(id)) { return Err("a brush must use artwork from a symbol inside the same svg".into()); }
    }
    if vector_parent { check_live(node, site)?; }
    Ok(())
}

fn check_live(node: &Node, site: &Site) -> Result<(), String> {
    let blend = node.attrs.get("data-fw-blend");
    let repeat = node.attrs.get("data-fw-repeat");
    let brush = node.attrs.get("data-fw-brush");
    let stroke = node.attrs.get("data-fw-stroke");
    let compound = node.attrs.get("data-fw-compound");
    let warp = node.attrs.get("data-fw-warp");
    let effect = node.attrs.get("data-fw-effect");
    if (blend.is_some() || repeat.is_some() || brush.is_some() || stroke.is_some() || compound.is_some() || warp.is_some() || effect.is_some()) && node.tag != "g" { return Err("live blends, repeats, brushes, stroke options, compound shapes, envelopes and effects live on a group".into()); }
    if [blend, repeat, brush, stroke, compound, warp, effect].iter().filter(|v| v.is_some()).count() > 1 { return Err("a group can be only one of a blend, a repeat, a brush or stroke options".into()); }
    let kids: Vec<&Node> = node.children.iter().filter_map(|id| site.nodes.get(id)).collect();
    let mut live = 0;
    for child in &kids {
        let Some(kind) = child.attrs.get("data-fw-live") else { continue };
        live += 1;
        let owned = match kind.as_str() { "blend" => blend.is_some(), "repeat" => repeat.is_some(), "brush" => brush.is_some(), "stroke" => stroke.is_some(), "compound" => compound.is_some(), "warp" => warp.is_some(), "effect" => effect.is_some(), _ => false };
        let paths_only = child.children.iter().filter_map(|id| site.nodes.get(id)).all(|n| n.tag == "path");
        if !owned || child.tag != "g" || !paths_only { return Err("live copies must sit in a locked group inside their blend or repeat".into()); }
    }
    if live > 1 { return Err("a live group holds one set of generated copies".into()); }
    let source = |id: &str| kids.iter().any(|k| k.id == id && k.tag == "path" && !k.attrs.contains_key("data-fw-live"));
    if let Some(raw) = blend {
        let value: Value = serde_json::from_str(raw).map_err(|_| "invalid vector attribute data-fw-blend".to_string())?;
        let mut ids: Vec<&str> = ["a", "b"].iter().filter_map(|key| value.get(key).and_then(Value::as_str)).collect();
        if let Some(list) = value.get("mid").and_then(Value::as_array) { ids.extend(list.iter().filter_map(Value::as_str)); }
        let spine = value.get("spine").and_then(Value::as_str).unwrap_or("");
        if ids.len() < 2 || !ids.iter().all(|id| source(id)) { return Err("a blend must name its paths inside its group".into()); }
        if !spine.is_empty() && !source(spine) { return Err("a blend spine must be a path inside its group".into()); }
    }
    if let Some(raw) = brush {
        let value: Value = serde_json::from_str(raw).map_err(|_| "invalid vector attribute data-fw-brush".to_string())?;
        if !value.get("src").and_then(Value::as_str).map(|id| source(id)).unwrap_or(false) { return Err("a brush must name its source path inside its group".into()); }
    }
    if let Some(raw) = stroke {
        let value: Value = serde_json::from_str(raw).map_err(|_| "invalid vector attribute data-fw-stroke".to_string())?;
        if !value.get("src").and_then(Value::as_str).map(|id| source(id)).unwrap_or(false) { return Err("stroke options must name their source path inside their group".into()); }
    }
    if let Some(raw) = compound {
        let value: Value = serde_json::from_str(raw).map_err(|_| "invalid vector attribute data-fw-compound".to_string())?;
        let ids: Vec<&str> = value.get("src").and_then(Value::as_array).map(|list| list.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
        if ids.len() < 2 || !ids.iter().all(|id| source(id)) { return Err("a compound shape must name its operand paths inside its group".into()); }
    }
    if let Some(raw) = warp {
        let value: Value = serde_json::from_str(raw).map_err(|_| "invalid vector attribute data-fw-warp".to_string())?;
        let mut ids: Vec<&str> = value.get("src").and_then(Value::as_array).map(|list| list.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
        let env = value.get("env").and_then(Value::as_str).unwrap_or("");
        if !env.is_empty() { ids.push(env); }
        if ids.is_empty() || !ids.iter().all(|id| source(id)) { return Err("an envelope must name its source paths inside its group".into()); }
    }
    if effect.is_some() && kids.iter().filter(|k| k.tag == "path" && !k.attrs.contains_key("data-fw-live")).count() < 2 { return Err("a Pathfinder effect needs two or more paths inside its group".into()); }
    if let Some(raw) = repeat {
        let value: Value = serde_json::from_str(raw).map_err(|_| "invalid vector attribute data-fw-repeat".to_string())?;
        let ids: Vec<&str> = value.get("src").and_then(Value::as_array).map(|list| list.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
        if ids.is_empty() || !ids.iter().all(|id| source(id)) { return Err("a repeat must name source paths inside its group".into()); }
    }
    Ok(())
}

pub fn check_attr(tag: &str, name: &str, value: &str) -> Result<(), String> {
    let fail = || Err(format!("invalid value for vector attribute {name}"));
    let ok = match name {
        "d" => return path_data(value),
        "data-fw-vector" => value.len() <= DATA_LIMIT && serde_json::from_str::<Value>(value).map(|v| v.get("v").and_then(Value::as_u64) == Some(1) && v.get("subs").map(Value::is_array).unwrap_or(false)).unwrap_or(false),
        "fill" | "stroke" => paint(value) || paint_ref(value),
        "clip-path" | "mask" => value == "none" || paint_ref(value),
        "paint-order" => matches!(value, "normal" | "stroke"),
        "clip-rule" => matches!(value, "nonzero" | "evenodd"),
        "data-fw-align" => matches!(value, "inside" | "outside" | "center"),
        "data-fw-weight" => number_in(value, 0.0, 10000.0),
        "data-fw-width" => value.len() <= DATA_LIMIT && serde_json::from_str::<Value>(value).map(|v| width_profile(&v)).unwrap_or(false),
        "data-fw-mask" => matches!(value, "clip" | "clip-invert" | "invert" | "plain"),
        "data-fw-type" => value.len() <= 2048 && serde_json::from_str::<Value>(value).map(|v| type_config(&v)).unwrap_or(false),
        "data-fw-blend" => value.len() <= 1024 && serde_json::from_str::<Value>(value).map(|v| blend_config(&v)).unwrap_or(false),
        "data-fw-repeat" => value.len() <= 2048 && serde_json::from_str::<Value>(value).map(|v| repeat_config(&v)).unwrap_or(false),
        "data-fw-live" => matches!(value, "blend" | "repeat" | "brush" | "stroke" | "compound" | "warp" | "effect"),
        "data-fw-effect" => value.len() <= 1024 && serde_json::from_str::<Value>(value).map(|v| effect_config(&v)).unwrap_or(false),
        "data-fw-warp" => value.len() <= 120_000 && serde_json::from_str::<Value>(value).map(|v| warp_config(&v)).unwrap_or(false),
        "data-fw-compound" => value.len() <= 1024 && serde_json::from_str::<Value>(value).map(|v| compound_config(&v)).unwrap_or(false),
        "visibility" => matches!(value, "hidden" | "visible"),
        "data-fw-stroke" => value.len() <= 1024 && serde_json::from_str::<Value>(value).map(|v| stroke_config(&v)).unwrap_or(false),
        "data-fw-brush" => value.len() <= 1024 && serde_json::from_str::<Value>(value).map(|v| brush_config(&v, true)).unwrap_or(false),
        "data-fw-brushdef" => value.len() <= 1024 && serde_json::from_str::<Value>(value).map(|v| brush_config(&v, false)).unwrap_or(false),
        "id" if tag == "symbol" => ref_id(value),
        "href" if tag == "use" => value.strip_prefix('#').map(ref_id).unwrap_or(false),
        "dy" => number_in(value, -2000.0, 2000.0),
        "x1" | "y1" | "x2" | "y2" | "cx" | "cy" | "r" | "fx" | "fy" | "x" | "y" if tag != "svg" => coordinate(value),
        "width" | "height" if tag == "mask" || tag == "use" => coordinate(value),
        "gradientUnits" | "clipPathUnits" | "maskUnits" | "maskContentUnits" => matches!(value, "userSpaceOnUse" | "objectBoundingBox"),
        "gradientTransform" => transform(value),
        "spreadMethod" => matches!(value, "pad" | "reflect" | "repeat"),
        "offset" => coordinate(value) && value.trim_end_matches('%').parse::<f64>().map(|n| n >= 0.0 && n <= if value.ends_with('%') { 100.0 } else { 1.0 }).unwrap_or(false),
        "stop-color" => paint(value),
        "stop-opacity" => number_in(value, 0.0, 1.0),
        "font-size" => number_in(value, 1.0, 2000.0),
        "letter-spacing" => number_in(value, -100.0, 100.0),
        "font-weight" => matches!(value, "normal" | "bold" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900"),
        "font-family" => !value.is_empty() && value.len() <= 80 && value.bytes().all(|c| c.is_ascii_alphanumeric() || b" ,'-".contains(&c)),
        "text-anchor" => matches!(value, "start" | "middle" | "end"),
        "startOffset" => coordinate(value),
        "href" if tag == "textPath" => value.strip_prefix('#').map(ref_id).unwrap_or(false),
        "stroke-width" => number_in(value, 0.0, 10000.0),
        "stroke-miterlimit" => number_in(value, 1.0, 100.0),
        "stroke-dashoffset" => number_in(value, -100000.0, 100000.0),
        "opacity" | "fill-opacity" | "stroke-opacity" => number_in(value, 0.0, 1.0),
        "stroke-linecap" => matches!(value, "butt" | "round" | "square"),
        "stroke-linejoin" => matches!(value, "miter" | "round" | "bevel"),
        "fill-rule" => matches!(value, "nonzero" | "evenodd"),
        "vector-effect" => matches!(value, "none" | "non-scaling-stroke"),
        "stroke-dasharray" => value == "none" || list(value, 1, 16, 0.0, 100000.0),
        "transform" => transform(value),
        "viewBox" if tag == "svg" => viewbox(value),
        "preserveAspectRatio" if tag == "svg" => matches!(value, "none" | "xMidYMid meet" | "xMidYMid slice" | "xMinYMin meet" | "xMaxYMax meet" | "xMidYMid"),
        "width" | "height" if tag == "svg" => length(value),
        _ => true,
    };
    if ok { Ok(()) } else { fail() }
}

fn width_profile(value: &Value) -> bool {
    let Some(list) = value.as_array() else { return false };
    list.len() >= 2 && list.len() <= 402 && list[0].is_string() && list[1].is_string()
        && list[2..].iter().all(|point| point.as_array().map(|p| (p.len() == 2 || p.len() == 3) && p.iter().all(|n| n.as_f64().map(|n| n.is_finite() && n.abs() <= 1e6).unwrap_or(false))).unwrap_or(false))
}

fn type_config(value: &Value) -> bool {
    let Some(map) = value.as_object() else { return false };
    let number = |key: &str, lo: f64, hi: f64| map.get(key).and_then(Value::as_f64).map(|n| n.is_finite() && n >= lo && n <= hi).unwrap_or(false);
    let word = |key: &str, allowed: &[&str]| map.get(key).and_then(Value::as_str).map(|s| allowed.contains(&s)).unwrap_or(false);
    map.get("v").and_then(Value::as_u64) == Some(1)
        && map.get("path").and_then(Value::as_str).map(ref_id).unwrap_or(false)
        && map.get("text").and_then(Value::as_str).map(|t| t.chars().count() <= 500 && !t.contains(['<', '>'])).unwrap_or(false)
        && number("size", 1.0, 500.0) && number("offset", 0.0, 100.0) && number("spacing", -100.0, 100.0)
        && matches!(map.get("flip").and_then(Value::as_u64), Some(0) | Some(1))
        && word("effect", &["rainbow", "skew", "ribbon", "stair", "gravity"])
        && word("align", &["baseline", "ascender", "descender", "center"])
        && map.len() == 9
}

fn sig_ok(map: &serde_json::Map<String, Value>) -> bool {
    map.get("sig").and_then(Value::as_str).map(|s| s.len() == 8 && s.bytes().all(|c| c.is_ascii_hexdigit())).unwrap_or(false)
}

fn blend_config(value: &Value) -> bool {
    let Some(map) = value.as_object() else { return false };
    let id = |key: &str| map.get(key).and_then(Value::as_str).map(ref_id).unwrap_or(false);
    let int = |key: &str, lo: u64, hi: u64| map.get(key).and_then(Value::as_u64).map(|n| n >= lo && n <= hi).unwrap_or(false);
    let word = |key: &str, allowed: &[&str]| map.get(key).and_then(Value::as_str).map(|s| allowed.contains(&s)).unwrap_or(false);
    let home = map.get("home");
    let home_ok = home.map(|h| h.as_array().map(|list| list.len() == 4 && list.iter().all(|v| v.as_f64().map(|n| n.is_finite() && n.abs() <= 1.0e6).unwrap_or(false))).unwrap_or(false)).unwrap_or(true);
    let extended = map.len() == 10 + usize::from(home.is_some());
    let mut named: Vec<&str> = ["a", "b"].iter().filter_map(|key| map.get(*key).and_then(Value::as_str)).collect();
    let mid_ok = !extended || map.get("mid").and_then(Value::as_array).map(|list| list.len() <= 14 && list.iter().all(|v| v.as_str().map(ref_id).unwrap_or(false))).unwrap_or(false);
    if extended {
        if let Some(list) = map.get("mid").and_then(Value::as_array) { named.extend(list.iter().filter_map(Value::as_str)); }
        if let Some(spine) = map.get("spine").and_then(Value::as_str) { if !spine.is_empty() { named.push(spine); } }
    }
    let spine_ok = !extended || map.get("spine").and_then(Value::as_str).map(|s| s.is_empty() || ref_id(s)).unwrap_or(false);
    let distinct = named.iter().collect::<BTreeSet<_>>().len() == named.len();
    (map.len() == 8 || extended)
        && home_ok && (home.is_none() || extended)
        && mid_ok && spine_ok && distinct
        && map.get("v").and_then(Value::as_u64) == Some(1)
        && id("a") && id("b")
        && word("mode", &["color", "steps", "distance"])
        && int("steps", 1, 500)
        && map.get("distance").and_then(Value::as_f64).map(|n| n.is_finite() && (0.5..=10000.0).contains(&n)).unwrap_or(false)
        && word("orient", &["page", "path"])
        && sig_ok(map)
}

fn brush_config(value: &Value, group: bool) -> bool {
    let Some(map) = value.as_object() else { return false };
    let number = |key: &str, lo: f64, hi: f64| map.get(key).and_then(Value::as_f64).map(|n| n.is_finite() && n >= lo && n <= hi).unwrap_or(false);
    let int = |key: &str, lo: u64, hi: u64| map.get(key).and_then(Value::as_u64).map(|n| n >= lo && n <= hi).unwrap_or(false);
    let word = |key: &str, allowed: &[&str]| map.get(key).and_then(Value::as_str).map(|s| allowed.contains(&s)).unwrap_or(false);
    let kind = map.get("kind").and_then(Value::as_str).unwrap_or("");
    let art = map.get("art").and_then(Value::as_str);
    let art_ok = art.map(|a| (a.is_empty() && (!group || kind == "calligraphic" || kind == "bristle")) || (!a.is_empty() && ref_id(a))).unwrap_or(false);
    let bristle = map.contains_key("bshape");
    let bristle_ok = !bristle || (word("bshape", &["round", "flat", "fan", "angle"]) && number("blen", 5.0, 100.0) && number("bdens", 1.0, 100.0) && number("bthick", 0.1, 50.0) && number("bopac", 5.0, 100.0) && number("bstiff", 0.0, 100.0));
    let own = !group || (map.get("src").and_then(Value::as_str).map(ref_id).unwrap_or(false)
        && map.get("color").and_then(Value::as_str).map(|c| c.len() == 7 && c.starts_with('#') && c[1..].bytes().all(|b| b.is_ascii_hexdigit())).unwrap_or(false)
        && number("weight", 0.0, 10000.0) && sig_ok(map));
    map.len() == (if group { 21 } else { 17 }) + if bristle { 6 } else { 0 }
        && map.get("v").and_then(Value::as_u64) == Some(1)
        && word("kind", &["calligraphic", "scatter", "art", "pattern", "bristle"])
        && (bristle || kind != "bristle") && bristle_ok
        && art_ok && own
        && number("angle", -180.0, 180.0) && number("roundness", 1.0, 100.0) && number("size", 0.1, 2000.0) && number("scale", 1.0, 1000.0)
        && number("spacing", 0.0, 1000.0) && number("scatter", 0.0, 500.0) && number("rotation", -180.0, 180.0)
        && int("seed", 1, 99999) && int("stretch", 0, 1) && int("flip", 0, 1) && int("flipv", 0, 1)
        && word("rotmode", &["fixed", "random"]) && word("rotrel", &["page", "path"]) && word("fit", &["stretch", "space"])
}

fn stroke_config(value: &Value) -> bool {
    let Some(map) = value.as_object() else { return false };
    let word = |key: &str, allowed: &[&str]| map.get(key).and_then(Value::as_str).map(|s| allowed.contains(&s)).unwrap_or(false);
    let number = |key: &str, lo: f64, hi: f64| map.get(key).and_then(Value::as_f64).map(|n| n.is_finite() && n >= lo && n <= hi).unwrap_or(false);
    let arrows = ["none", "simple", "filled", "open", "circle", "square", "bar"];
    let dash = map.get("dash").and_then(Value::as_array).map(|list| list.len() <= 6 && list.len() % 2 == 0 && list.iter().all(|v| v.as_f64().map(|n| n.is_finite() && (0.0..=10000.0).contains(&n)).unwrap_or(false))).unwrap_or(false);
    map.len() == 10
        && map.get("v").and_then(Value::as_u64) == Some(1)
        && map.get("src").and_then(Value::as_str).map(ref_id).unwrap_or(false)
        && dash
        && word("mode", &["preserve", "align"])
        && word("a0", &arrows) && word("a1", &arrows)
        && number("s0", 1.0, 1000.0) && number("s1", 1.0, 1000.0)
        && word("tip", &["extend", "end"])
        && sig_ok(map)
}

fn compound_config(value: &Value) -> bool {
    let Some(map) = value.as_object() else { return false };
    let Some(list) = map.get("src").and_then(Value::as_array) else { return false };
    let ids: Vec<&str> = list.iter().filter_map(Value::as_str).collect();
    let unique: BTreeSet<&str> = ids.iter().copied().collect();
    map.len() == 4
        && map.get("v").and_then(Value::as_u64) == Some(1)
        && map.get("op").and_then(Value::as_str).map(|s| matches!(s, "unite" | "minus-front" | "intersect" | "exclude" | "divide" | "outline")).unwrap_or(false)
        && ids.len() == list.len() && ids.len() >= 2 && ids.len() <= 16 && unique.len() == ids.len() && ids.iter().all(|id| ref_id(id))
        && sig_ok(map)
}

fn mesh_ok(map: &serde_json::Map<String, Value>) -> bool {
    let grid = |key: &str| map.get(key).and_then(Value::as_u64).filter(|n| (1..=50).contains(n));
    let (Some(rows), Some(cols)) = (grid("rows"), grid("cols")) else { return false };
    let Some(points) = map.get("mesh").and_then(Value::as_array) else { return false };
    points.len() as u64 == (rows + 1) * (cols + 1) * 2 && points.iter().all(|v| v.as_f64().map(|n| n.is_finite() && (-10.0..=10.0).contains(&n)).unwrap_or(false))
}

fn effect_config(value: &Value) -> bool {
    let Some(map) = value.as_object() else { return false };
    map.len() == 4
        && map.get("v").and_then(Value::as_u64) == Some(1)
        && map.get("fx").and_then(Value::as_str) == Some("pathfinder")
        && map.get("op").and_then(Value::as_str).map(|s| matches!(s, "unite" | "minus-front" | "intersect" | "exclude" | "divide" | "trim" | "merge" | "crop" | "minus-back" | "outline")).unwrap_or(false)
        && sig_ok(map)
}

fn warp_config(value: &Value) -> bool {
    let Some(map) = value.as_object() else { return false };
    let number = |key: &str| map.get(key).and_then(Value::as_f64).map(|n| n.is_finite() && (-100.0..=100.0).contains(&n)).unwrap_or(false);
    let word = |key: &str, allowed: &[&str]| map.get(key).and_then(Value::as_str).map(|s| allowed.contains(&s)).unwrap_or(false);
    let src = map.get("src").and_then(Value::as_array).map(|list| !list.is_empty() && list.len() <= 16 && list.iter().all(|v| v.as_str().map(ref_id).unwrap_or(false))).unwrap_or(false);
    let env = map.get("env").and_then(Value::as_str).map(|s| s.is_empty() || ref_id(s)).unwrap_or(false);
    let envelope = map.get("env").and_then(Value::as_str).map(|s| !s.is_empty()).unwrap_or(false);
    let count = map.get("src").and_then(Value::as_array).map(|l| l.len()).unwrap_or(0) + usize::from(envelope);
    let op = map.get("op").and_then(Value::as_array).map(|list| list.len() == count && list.iter().all(|v| v.as_str().map(|s| s.is_empty() || s.parse::<f64>().map(|n| (0.0..=1.0).contains(&n)).unwrap_or(false)).unwrap_or(false))).unwrap_or(false);
    let mesh = map.get("mode").and_then(Value::as_str) == Some("mesh");
    map.len() == if mesh { 14 } else { 11 }
        && (!mesh || mesh_ok(map))
        && map.get("v").and_then(Value::as_u64) == Some(1)
        && src && env && op
        && word("mode", &["warp", "top", "mesh"])
        && (map.get("mode").and_then(Value::as_str) == Some("top")) == envelope
        && word("style", &["arc", "arc-lower", "arc-upper", "arch", "bulge", "shell-lower", "shell-upper", "flag", "wave", "fish", "rise", "fisheye", "inflate", "squeeze", "twist"])
        && word("orient", &["h", "v"])
        && number("bend") && number("hd") && number("vd")
        && sig_ok(map)
}

fn repeat_config(value: &Value) -> bool {
    let Some(map) = value.as_object() else { return false };
    let int = |key: &str, lo: u64, hi: u64| map.get(key).and_then(Value::as_u64).map(|n| n >= lo && n <= hi).unwrap_or(false);
    let number = |key: &str, lo: f64, hi: f64| map.get(key).and_then(Value::as_f64).map(|n| n.is_finite() && n >= lo && n <= hi).unwrap_or(false);
    let sources = map.get("src").and_then(Value::as_array).map(|list| !list.is_empty() && list.len() <= 16 && list.iter().all(|v| v.as_str().map(ref_id).unwrap_or(false))).unwrap_or(false);
    map.len() == 13
        && map.get("v").and_then(Value::as_u64) == Some(1)
        && sources
        && map.get("kind").and_then(Value::as_str).map(|s| matches!(s, "radial" | "grid" | "mirror")).unwrap_or(false)
        && int("count", 2, 120) && int("cols", 1, 60) && int("rows", 1, 60)
        && number("radius", -5000.0, 5000.0) && number("gx", -1000.0, 1000.0) && number("gy", -1000.0, 1000.0) && number("offset", -1000.0, 1000.0)
        && number("angle", -360.0, 360.0)
        && map.get("brick").and_then(Value::as_str).map(|s| matches!(s, "none" | "row" | "column")).unwrap_or(false)
        && sig_ok(map)
}

fn number_in(value: &str, min: f64, max: f64) -> bool {
    value.trim() == value && value.parse::<f64>().map(|n| n.is_finite() && n >= min && n <= max).unwrap_or(false) && !value.is_empty()
}

fn coordinate(value: &str) -> bool {
    number_in(value.strip_suffix('%').unwrap_or(value), -1e6, 1e6)
}

fn ref_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 64 && value.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

fn paint_ref(value: &str) -> bool {
    value.len() <= 80 && url_target(value).map(ref_id).unwrap_or(false)
}

fn length(value: &str) -> bool {
    let body = value.strip_suffix("px").or_else(|| value.strip_suffix('%')).unwrap_or(value);
    number_in(body, 0.0, 100000.0)
}

fn viewbox(value: &str) -> bool {
    let parts: Vec<f64> = value.split([' ', ',']).filter(|p| !p.is_empty()).filter_map(|p| p.parse().ok()).collect();
    parts.len() == 4 && value.split([' ', ',']).filter(|p| !p.is_empty()).count() == 4 && parts.iter().all(|n| n.is_finite() && n.abs() <= 1e7) && parts[2] > 0.0 && parts[3] > 0.0
}

fn list(value: &str, min: usize, max: usize, lo: f64, hi: f64) -> bool {
    let items: Vec<&str> = value.split([' ', ',']).filter(|p| !p.is_empty()).collect();
    items.len() >= min && items.len() <= max && items.iter().all(|p| p.parse::<f64>().map(|n| n.is_finite() && n >= lo && n <= hi).unwrap_or(false))
}

fn paint(value: &str) -> bool {
    if value.is_empty() || value.len() > 96 || value.trim() != value { return false; }
    let lower = value.to_ascii_lowercase();
    if let Some(hex) = lower.strip_prefix('#') { return matches!(hex.len(), 3 | 4 | 6 | 8) && hex.bytes().all(|c| c.is_ascii_hexdigit()); }
    if lower.bytes().all(|c| c.is_ascii_alphabetic()) { return lower.len() <= 24 && lower != "url"; }
    if let Some(inner) = lower.strip_prefix("var(--").and_then(|rest| rest.strip_suffix(')')) { return crate::identifier(inner); }
    for prefix in ["rgb(", "rgba(", "hsl(", "hsla("] {
        if let Some(inner) = lower.strip_prefix(prefix).and_then(|rest| rest.strip_suffix(')')) {
            return !inner.is_empty() && inner.bytes().all(|c| c.is_ascii_digit() || b" .,%/+-".contains(&c) || c.is_ascii_lowercase());
        }
    }
    false
}

fn transform(value: &str) -> bool {
    let mut rest = value.trim();
    if rest.is_empty() || rest.len() > 1024 { return false; }
    let mut count = 0;
    while !rest.is_empty() {
        let Some(open) = rest.find('(') else { return false };
        let name = rest[..open].trim();
        let Some(close) = rest.find(')') else { return false };
        if close < open { return false; }
        let args = &rest[open + 1..close];
        let parts: Vec<&str> = args.split([' ', ',']).filter(|p| !p.is_empty()).collect();
        let valid_count = match name { "matrix" => parts.len() == 6, "translate" | "scale" => parts.len() == 1 || parts.len() == 2, "rotate" => parts.len() == 1 || parts.len() == 3, "skewX" | "skewY" => parts.len() == 1, _ => false };
        if !valid_count || !parts.iter().all(|p| p.parse::<f64>().map(|n| n.is_finite() && n.abs() <= 1e7).unwrap_or(false)) { return false; }
        rest = rest[close + 1..].trim_start_matches([' ', ',']);
        count += 1;
        if count > 16 { return false; }
    }
    true
}

fn skip(b: &[u8], i: &mut usize) {
    while *i < b.len() && (b[*i].is_ascii_whitespace() || b[*i] == b',') { *i += 1; }
}

fn number(b: &[u8], i: &mut usize) -> Option<f64> {
    let start = *i;
    if *i < b.len() && (b[*i] == b'+' || b[*i] == b'-') { *i += 1; }
    let mut digits = 0;
    while *i < b.len() && b[*i].is_ascii_digit() { *i += 1; digits += 1; }
    if *i < b.len() && b[*i] == b'.' {
        *i += 1;
        while *i < b.len() && b[*i].is_ascii_digit() { *i += 1; digits += 1; }
    }
    if digits == 0 { return None; }
    if *i < b.len() && (b[*i] == b'e' || b[*i] == b'E') {
        let mark = *i;
        *i += 1;
        if *i < b.len() && (b[*i] == b'+' || b[*i] == b'-') { *i += 1; }
        let exp = *i;
        while *i < b.len() && b[*i].is_ascii_digit() { *i += 1; }
        if *i == exp { *i = mark; }
    }
    let value: f64 = std::str::from_utf8(&b[start..*i]).ok()?.parse().ok()?;
    if value.is_finite() && value.abs() <= 1e7 { Some(value) } else { None }
}

pub fn path_data(d: &str) -> Result<(), String> {
    if d.len() > DATA_LIMIT { return Err("path data is too long".into()); }
    let bad = || Err("invalid path data".to_string());
    let b = d.as_bytes();
    let mut i = 0;
    let mut first = true;
    let mut commands = 0usize;
    loop {
        skip(b, &mut i);
        if i >= b.len() { break; }
        let c = b[i];
        if !c.is_ascii_alphabetic() { return bad(); }
        i += 1;
        let upper = c.to_ascii_uppercase();
        let arity = match upper { b'M' | b'L' | b'T' => 2, b'H' | b'V' => 1, b'C' => 6, b'S' | b'Q' => 4, b'A' => 7, b'Z' => 0, _ => return bad() };
        if first && upper != b'M' { return bad(); }
        first = false;
        commands += 1;
        if commands > 50000 { return Err("path has too many commands".into()); }
        if arity == 0 { continue; }
        let mut groups = 0;
        loop {
            skip(b, &mut i);
            if i >= b.len() || !(b[i].is_ascii_digit() || matches!(b[i], b'.' | b'+' | b'-')) { break; }
            for k in 0..arity {
                skip(b, &mut i);
                if upper == b'A' && (k == 3 || k == 4) {
                    if i >= b.len() || !(b[i] == b'0' || b[i] == b'1') { return bad(); }
                    i += 1;
                } else if number(b, &mut i).is_none() { return bad(); }
            }
            groups += 1;
            commands += 1;
            if commands > 50000 { return Err("path has too many commands".into()); }
        }
        if groups == 0 { return bad(); }
    }
    Ok(())
}
