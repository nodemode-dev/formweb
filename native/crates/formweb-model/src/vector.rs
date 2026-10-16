use crate::{Node, Site};
use serde_json::Value;

const SHARED: &[&str] = &[
    "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset",
    "fill-rule", "fill-opacity", "stroke-opacity", "transform", "vector-effect", "opacity", "data-fw-vector",
];
const DATA_LIMIT: usize = 262_144;

pub fn is_tag(tag: &str) -> bool {
    matches!(tag, "svg" | "g" | "path")
}

pub fn attr_allowed(tag: &str, name: &str) -> bool {
    if !is_tag(tag) {
        return false;
    }
    SHARED.contains(&name) || (tag == "path" && name == "d") || (tag == "svg" && matches!(name, "viewBox" | "preserveAspectRatio"))
}

pub fn max_len(tag: &str, name: &str) -> usize {
    if is_tag(tag) && matches!(name, "d" | "data-fw-vector") { DATA_LIMIT } else { 10000 }
}

pub fn check_node(node: &Node, site: &Site) -> Result<(), String> {
    let vector_parent = is_tag(&node.tag);
    if vector_parent && !node.text.is_empty() { return Err("vector elements cannot contain text".into()); }
    if node.tag == "path" && !node.children.is_empty() { return Err("path cannot have children".into()); }
    for child in &node.children {
        let Some(child) = site.nodes.get(child) else { continue };
        let vector_child = is_tag(&child.tag);
        if vector_parent && !matches!(child.tag.as_str(), "g" | "path") { return Err("svg and g may only contain g and path".into()); }
        if !vector_parent && vector_child && child.tag != "svg" { return Err("path and g must live inside an svg element".into()); }
    }
    Ok(())
}

pub fn check_attr(tag: &str, name: &str, value: &str) -> Result<(), String> {
    let fail = || Err(format!("invalid value for vector attribute {name}"));
    let ok = match name {
        "d" => return path_data(value),
        "data-fw-vector" => value.len() <= DATA_LIMIT && serde_json::from_str::<Value>(value).map(|v| v.get("v").and_then(Value::as_u64) == Some(1) && v.get("subs").map(Value::is_array).unwrap_or(false)).unwrap_or(false),
        "fill" | "stroke" => paint(value),
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

fn number_in(value: &str, min: f64, max: f64) -> bool {
    value.trim() == value && value.parse::<f64>().map(|n| n.is_finite() && n >= min && n <= max).unwrap_or(false) && !value.is_empty()
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
