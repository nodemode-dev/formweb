//! Value checks for the style properties added in the wider authoring vocabulary. Each runs after `safe_css_value`
//! (no url(), no expression, no control characters, at most 4096 bytes) and only accepts the shapes below.

const UNITS: &[&str] = &["px", "rem", "em", "%", "vh", "vw", "svh", "lvh", "dvh", "vmin", "vmax", "ch", "ex", "vi", "vb", "lh", "cqw", "cqh"];
const WIDE: &[&str] = &["inherit", "initial", "unset", "revert"];
const BORDER_STYLES: &[&str] = &["none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset"];

/// Splits on spaces at parenthesis depth zero; None when the parentheses do not balance.
fn tokens(value: &str) -> Option<Vec<&str>> {
    let mut out = Vec::new();
    let (mut depth, mut start) = (0i32, None);
    for (index, c) in value.char_indices() {
        match c {
            '(' => { depth += 1; start.get_or_insert(index); }
            ')' => { depth -= 1; if depth < 0 { return None; } }
            ' ' | '\t' if depth == 0 => { if let Some(s) = start.take() { out.push(&value[s..index]); } }
            _ => { start.get_or_insert(index); }
        }
    }
    if depth != 0 { return None; }
    if let Some(s) = start { out.push(&value[s..]); }
    Some(out)
}

fn number(text: &str) -> bool {
    !text.is_empty() && text.parse::<f64>().map(|n| n.is_finite() && n.abs() <= 1e6).unwrap_or(false)
}

fn token_ident(text: &str) -> bool {
    crate::identifier(text)
}

/// var(--token), or calc(), min(), max(), clamp() whose body is only numbers, units, operators and var(--token).
fn function(text: &str) -> bool {
    if text.len() > 512 { return false; }
    if let Some(inner) = text.strip_prefix("var(--").and_then(|rest| rest.strip_suffix(')')) { return token_ident(inner); }
    let Some(name) = ["calc(", "min(", "max(", "clamp("].iter().find(|p| text.starts_with(**p)) else { return false };
    if !text.ends_with(')') || !text[name.len()..].bytes().all(|c| c.is_ascii_alphanumeric() || b" .%+-*/(),_".contains(&c)) { return false; }
    let (mut depth, bytes) = (0i32, text.as_bytes());
    for (i, c) in bytes.iter().enumerate() {
        match c { b'(' => depth += 1, b')' => { depth -= 1; if depth < 0 || (depth == 0 && i + 1 != bytes.len()) { return false; } } _ => {} }
    }
    depth == 0 && text.match_indices("var(").all(|(i, _)| text[i + 4..].starts_with("--"))
}

fn length_token(text: &str, allow_auto: bool) -> bool {
    if text == "0" || (allow_auto && text == "auto") || WIDE.contains(&text) { return true; }
    if function(text) { return true; }
    UNITS.iter().any(|unit| text.strip_suffix(unit).map(number).unwrap_or(false))
}

fn colour_token(text: &str) -> bool {
    if text.is_empty() || text.len() > 96 { return false; }
    let lower = text.to_ascii_lowercase();
    if let Some(hex) = lower.strip_prefix('#') { return matches!(hex.len(), 3 | 4 | 6 | 8) && hex.bytes().all(|c| c.is_ascii_hexdigit()); }
    if lower.bytes().all(|c| c.is_ascii_alphabetic()) { return lower.len() <= 24 && lower != "url"; }
    if let Some(inner) = lower.strip_prefix("var(--").and_then(|rest| rest.strip_suffix(')')) { return token_ident(inner); }
    ["rgb(", "rgba(", "hsl(", "hsla("].iter().any(|prefix| {
        lower.strip_prefix(prefix).and_then(|rest| rest.strip_suffix(')')).map(|inner| !inner.is_empty() && inner.bytes().all(|c| c.is_ascii_digit() || b" .,%/+-".contains(&c) || c.is_ascii_lowercase())).unwrap_or(false)
    })
}

fn keyword(value: &str, allowed: &[&str]) -> bool {
    allowed.contains(&value) || WIDE.contains(&value)
}

fn lengths(value: &str, max: usize, allow_auto: bool) -> bool {
    tokens(value).map(|list| !list.is_empty() && list.len() <= max && list.iter().all(|t| length_token(t, allow_auto))).unwrap_or(false)
}

fn size(value: &str, extra: &[&str]) -> bool {
    keyword(value, extra) || length_token(value, false)
}

/// A scene offset that is not a plain length: var(--token) or a calc() of lengths and tokens.
pub fn offset_expression(value: &str) -> bool {
    crate::safe_css_value(value) && (value.starts_with("var(") || value.starts_with("calc(")) && function(value)
}

/// Some(result) for a property added in the wider vocabulary, None for every older property.
pub fn value_ok(name: &str, value: &str) -> Option<bool> {
    Some(match name {
        "margin-block" | "margin-inline" | "inset-block" | "inset-inline" => lengths(value, 2, true),
        "margin-block-start" | "margin-block-end" | "margin-inline-start" | "margin-inline-end" | "inset-block-end" | "inset-inline-start" | "inset-inline-end" => lengths(value, 1, true),
        "padding-block" | "padding-inline" => lengths(value, 2, false),
        "padding-block-start" | "padding-block-end" | "padding-inline-start" | "padding-inline-end" => lengths(value, 1, false),
        "inline-size" | "block-size" | "min-inline-size" | "min-block-size" => size(value, &["auto", "min-content", "max-content", "fit-content"]),
        "max-inline-size" | "max-block-size" => size(value, &["none", "min-content", "max-content", "fit-content"]),
        "border-block" | "border-inline" => tokens(value).map(|list| !list.is_empty() && list.len() <= 3 && list.iter().all(|t| BORDER_STYLES.contains(t) || length_token(t, false) || colour_token(t))).unwrap_or(false),
        "background-clip" | "-webkit-background-clip" => { let parts: Vec<&str> = value.split(',').map(str::trim).collect(); parts.len() <= 4 && parts.iter().all(|p| keyword(p, &["border-box", "padding-box", "content-box", "text"])) }
        "-webkit-text-fill-color" | "text-decoration-color" => colour_token(value),
        "scrollbar-color" => value == "auto" || tokens(value).map(|list| list.len() == 2 && list.iter().all(|t| colour_token(t))).unwrap_or(false),
        "scrollbar-width" => keyword(value, &["auto", "thin", "none"]),
        "scrollbar-gutter" => matches!(value, "auto" | "stable" | "stable both-edges") || WIDE.contains(&value),
        "writing-mode" => keyword(value, &["horizontal-tb", "vertical-rl", "vertical-lr", "sideways-rl", "sideways-lr"]),
        "text-orientation" => keyword(value, &["mixed", "upright", "sideways"]),
        "text-underline-offset" => value == "auto" || length_token(value, false),
        "text-decoration-thickness" => matches!(value, "auto" | "from-font") || length_token(value, false),
        "overflow-wrap" => keyword(value, &["normal", "break-word", "anywhere"]),
        "hyphens" => keyword(value, &["none", "manual", "auto"]),
        "appearance" | "-webkit-appearance" => keyword(value, &["none", "auto"]),
        "resize" => keyword(value, &["none", "both", "horizontal", "vertical", "block", "inline"]),
        "text-rendering" => keyword(value, &["auto", "optimizeSpeed", "optimizeLegibility", "geometricPrecision"]),
        "-webkit-user-select" => keyword(value, &["auto", "none", "text", "all", "contain"]),
        "fill" | "stroke" => value == "none" || colour_token(value),
        "stroke-width" => number(value) || length_token(value, false),
        _ => return None,
    })
}
