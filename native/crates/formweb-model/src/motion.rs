use crate::advanced::{keys, maps, node, object, string, subtree, typed_value};
use crate::{identifier, safe_style, Site};
use serde_json::Value;

pub const KINDS: &[&str] = &["reveals", "scenes", "loops", "counters", "text", "drag", "pointer", "disclosure", "actions", "scripts"];
const SAFE: &[&str] = &["opacity", "transform", "translate", "scale", "rotate", "filter", "backdrop-filter", "clip-path", "color", "background-color", "border-color", "box-shadow"];
const EASINGS: &[&str] = &["linear", "ease", "ease-in", "ease-out", "ease-in-out"];
const TRIGGERS: &[&str] = &["click", "hover", "submit", "change", "load", "view", "input"];
const SCRIPT_TRIGGERS: &[&str] = &["submit", "click", "load", "view", "change"];

fn number(value: &Value, key: &str, min: f64, max: f64) -> Result<Option<f64>, String> {
    match value.get(key) {
        None => Ok(None),
        Some(n) => n.as_f64().filter(|n| n.is_finite() && *n >= min && *n <= max).map(Some).ok_or_else(|| format!("{key} must be a number from {min} to {max}")),
    }
}
fn required(value: &Value, key: &str, min: f64, max: f64) -> Result<f64, String> { number(value, key, min, max)?.ok_or_else(|| format!("{key} is required")) }
fn integer(value: &Value, key: &str, min: f64, max: f64) -> Result<Option<f64>, String> {
    let found = number(value, key, min, max)?;
    if found.map(|n| n.fract() != 0.0).unwrap_or(false) { return Err(format!("{key} must be a whole number")); }
    Ok(found)
}
fn flag(value: &Value, key: &str) -> Result<Option<bool>, String> { match value.get(key) { None => Ok(None), Some(v) => v.as_bool().map(Some).ok_or_else(|| format!("{key} must be boolean")) } }
fn choice<'a>(value: &'a Value, key: &str, options: &[&str]) -> Result<Option<&'a str>, String> {
    match value.get(key) {
        None => Ok(None),
        Some(v) => v.as_str().filter(|s| options.contains(s)).map(Some).ok_or_else(|| format!("invalid {key}")),
    }
}
fn reference<'a>(site: &Site, value: &'a Value, key: &str) -> Result<Option<&'a str>, String> {
    match value.get(key) { None => Ok(None), Some(v) => { let id = v.as_str().ok_or_else(|| format!("{key} must be a node id"))?; node(site, id)?; Ok(Some(id)) } }
}
fn target<'a>(site: &Site, value: &'a Value, key: &str) -> Result<&'a str, String> { reference(site, value, key)?.ok_or_else(|| format!("{key} is required")) }

fn motion_styles(value: &Value) -> Result<(), String> {
    let map = object(value)?;
    if map.len() > 32 { return Err("too many motion styles".into()); }
    for (k, v) in map {
        let allowed = SAFE.contains(&k.as_str()) || (k.starts_with("--") && identifier(&k[2..]));
        if !allowed || !v.as_str().map(|v| safe_style(k, v)).unwrap_or(false) { return Err(format!("motion style {k} is not allowed")); }
    }
    Ok(())
}

fn easing(value: &Value) -> Result<(), String> {
    let Some(easing) = value.get("easing") else { return Ok(()) };
    let s = easing.as_str().ok_or("easing must be text")?;
    if EASINGS.contains(&s) { return Ok(()); }
    let arguments = |prefix: &str| s.strip_prefix(prefix).and_then(|r| r.strip_suffix(')')).map(|r| r.split(',').map(|v| v.trim().parse::<f64>()).collect::<Result<Vec<_>, _>>());
    if let Some(parsed) = arguments("cubic-bezier(") {
        let v = parsed.map_err(|_| "invalid easing")?;
        if v.len() == 4 && v.iter().all(|n| n.is_finite()) && (0.0..=1.0).contains(&v[0]) && (0.0..=1.0).contains(&v[2]) { return Ok(()); }
    }
    if let Some(parsed) = arguments("spring(") {
        let v = parsed.map_err(|_| "invalid easing")?;
        if v.len() == 2 && v.iter().all(|n| n.is_finite()) && (1.0..=1000.0).contains(&v[0]) && (1.0..=100.0).contains(&v[1]) { return Ok(()); }
    }
    Err("invalid easing".into())
}

fn margin_length(part: &str) -> bool {
    let body = part.strip_suffix("px").or_else(|| part.strip_suffix('%')).unwrap_or("");
    let body = body.strip_prefix('-').unwrap_or(body);
    let mut halves = body.splitn(2, '.');
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit());
    digits(halves.next().unwrap_or("")) && halves.next().map(digits).unwrap_or(true)
}

fn array<'a>(value: &'a Value, key: &str, min: usize, max: usize) -> Result<&'a Vec<Value>, String> {
    let items = value.get(key).and_then(Value::as_array).ok_or_else(|| format!("{key} must be an array"))?;
    if items.len() < min || items.len() > max { return Err(format!("{key} needs {min} to {max} entries")); }
    Ok(items)
}

fn frames(value: &Value, key: &str, max: usize) -> Result<(), String> {
    let list = array(value, key, 2, max)?;
    let mut last = -1.0;
    for (index, frame) in list.iter().enumerate() {
        keys(frame, &["at", "styles"])?;
        let at = required(frame, "at", 0.0, 1.0)?;
        if at <= last || (index == 0 && at != 0.0) || (index == list.len() - 1 && at != 1.0) { return Err("keyframes need ascending at values from 0 to 1".into()); }
        last = at;
        motion_styles(frame.get("styles").ok_or("keyframe styles required")?)?;
    }
    Ok(())
}

fn reveal(value: &Value) -> Result<(), String> {
    keys(value, &["from", "duration", "delay", "stagger", "children", "easing", "threshold", "rootMargin", "once", "trigger"])?;
    motion_styles(value.get("from").ok_or("reveal from state required")?)?;
    for key in ["duration", "delay", "stagger"] { integer(value, key, 0.0, 10000.0)?; }
    number(value, "threshold", 0.0, 1.0)?;
    flag(value, "children")?; flag(value, "once")?; choice(value, "trigger", &["view", "load"])?; easing(value)?;
    if let Some(margin) = value.get("rootMargin") {
        let parts: Vec<&str> = margin.as_str().ok_or("rootMargin must be text")?.split(' ').collect();
        if parts.is_empty() || parts.len() > 4 || !parts.iter().all(|p| margin_length(p)) { return Err("invalid rootMargin".into()); }
    }
    Ok(())
}

fn scene(site: &Site, root: &Value, id: &str, value: &Value) -> Result<(), String> {
    keys(value, &["stage", "length", "offset", "smoothing", "tracks", "distribute", "markers", "reducedAt", "progressVar"])?;
    let members = subtree(site, id);
    let stage = target(site, value, "stage")?;
    if stage == id || !members.contains(stage) { return Err("scene stage must be inside the scene".into()); }
    required(value, "length", 100.0, 2000.0)?;
    if let Some(offset) = value.get("offset") { if !typed_value("length", offset) { return Err("scene offset must be a length".into()); } }
    number(value, "smoothing", 0.0, 2000.0)?; number(value, "reducedAt", 0.0, 1.0)?; flag(value, "progressVar")?;
    for track in array(value, "tracks", 1, 50)? {
        keys(track, &["node", "keyframes", "easing"])?;
        if !members.contains(target(site, track, "node")?) { return Err("scene track must be inside the scene".into()); }
        frames(track, "keyframes", 50)?; easing(track)?;
    }
    if value.get("distribute").is_some() {
        for entry in array(value, "distribute", 0, 50)? {
            keys(entry, &["parent", "stagger", "keyframes", "easing"])?;
            let parent = target(site, entry, "parent")?;
            if !members.contains(parent) { return Err("distribute parent must be inside the scene".into()); }
            let stagger = required(entry, "stagger", 0.0, 1.0)?;
            let count = site.nodes[parent].children.len();
            if count > 1 && stagger * (count as f64 - 1.0) >= 1.0 { return Err("distribute stagger leaves no room for the last child".into()); }
            frames(entry, "keyframes", 50)?; easing(entry)?;
        }
    }
    if value.get("markers").is_some() {
        for marker in array(value, "markers", 0, 50)? {
            keys(marker, &["at", "action"])?;
            required(marker, "at", 0.0, 1.0)?;
            action(site, root, marker.get("action").ok_or("marker action required")?, false)?;
        }
    }
    Ok(())
}

fn loop_entry(value: &Value) -> Result<(), String> {
    keys(value, &["type", "direction", "speed", "pauseOnHover", "pauseOffscreen", "duration", "amount", "keyframes", "easing", "iterations"])?;
    flag(value, "pauseOnHover")?; flag(value, "pauseOffscreen")?; easing(value)?;
    match choice(value, "type", &["marquee", "spin", "float", "keyframes"])?.ok_or("loop type required")? {
        "marquee" => { choice(value, "direction", &["left", "right", "up", "down"])?; required(value, "speed", 1.0, 2000.0)?; }
        "spin" | "float" => { required(value, "duration", 100.0, 120000.0)?; number(value, "amount", -100000.0, 100000.0)?; }
        _ => {
            required(value, "duration", 100.0, 120000.0)?;
            let list = array(value, "keyframes", 2, 50)?;
            for frame in list {
                if frame.get("styles").is_some() { keys(frame, &["at", "styles"])?; number(frame, "at", 0.0, 1.0)?; motion_styles(&frame["styles"])?; } else { motion_styles(frame)?; }
            }
            if let Some(iterations) = value.get("iterations") {
                if iterations.as_str() != Some("infinite") && !iterations.as_u64().map(|n| (1..=1000).contains(&n)).unwrap_or(false) { return Err("iterations must be 1 to 1000 or infinite".into()); }
            }
        }
    }
    Ok(())
}

fn counter(value: &Value) -> Result<(), String> {
    keys(value, &["to", "from", "duration", "decimals", "trigger", "odometer"])?;
    required(value, "to", -1.0e12, 1.0e12)?; number(value, "from", -1.0e12, 1.0e12)?;
    integer(value, "duration", 0.0, 60000.0)?; integer(value, "decimals", 0.0, 6.0)?;
    choice(value, "trigger", &["view", "load"])?; flag(value, "odometer")?;
    Ok(())
}

fn text_entry(site: &Site, id: &str, value: &Value) -> Result<(), String> {
    keys(value, &["type", "by", "from", "duration", "stagger", "trigger", "strings", "speed", "erase", "hold", "cursor"])?;
    choice(value, "trigger", &["view", "load"])?; flag(value, "cursor")?;
    match choice(value, "type", &["split", "ghost", "typewriter"])?.ok_or("text type required")? {
        "split" => {
            choice(value, "by", &["chars", "words", "lines"])?;
            motion_styles(value.get("from").ok_or("split from state required")?)?;
            integer(value, "duration", 0.0, 10000.0)?; integer(value, "stagger", 0.0, 10000.0)?;
        }
        "ghost" => {
            if !["input", "textarea"].contains(&site.nodes[id].tag.as_str()) { return Err("ghost text needs an input or textarea".into()); }
            for text in array(value, "strings", 1, 20)? {
                if !text.as_str().map(|s| !s.is_empty() && s.len() <= 200 && !s.chars().any(char::is_control)).unwrap_or(false) { return Err("invalid ghost string".into()); }
            }
            required(value, "speed", 1.0, 10000.0)?; number(value, "erase", 1.0, 10000.0)?; number(value, "hold", 0.0, 60000.0)?;
        }
        _ => { required(value, "speed", 1.0, 10000.0)?; }
    }
    Ok(())
}

fn drag(site: &Site, value: &Value) -> Result<(), String> {
    keys(value, &["axis", "bounds", "inertia", "friction", "restitution", "rotate", "keyboard", "flip"])?;
    choice(value, "axis", &["x", "y", "both"])?; flag(value, "inertia")?; flag(value, "rotate")?;
    number(value, "friction", 0.0, 100.0)?; number(value, "restitution", 0.0, 1.0)?; integer(value, "keyboard", 0.0, 200.0)?;
    if let Some(bounds) = value.get("bounds") {
        let bounds = bounds.as_str().ok_or("bounds must be text")?;
        if !["parent", "window", "none"].contains(&bounds) { node(site, bounds)?; }
    }
    if let Some(flip) = value.get("flip") { keys(flip, &["back"])?; target(site, flip, "back")?; }
    Ok(())
}

fn pointer(site: &Site, value: &Value) -> Result<(), String> {
    keys(value, &["type", "max", "perspective", "spring", "within", "show", "radius"])?;
    number(value, "spring", 0.0, 1.0)?;
    match choice(value, "type", &["tilt", "follow", "proximity"])?.ok_or("pointer type required")? {
        "tilt" => {
            number(value, "max", 0.0, 45.0)?;
            if let Some(perspective) = value.get("perspective") { if !typed_value("length", perspective) { return Err("perspective must be a length".into()); } }
        }
        "follow" => { target(site, value, "within")?; choice(value, "show", &["hover", "always"])?; }
        _ => { required(value, "radius", 1.0, 2000.0)?; }
    }
    Ok(())
}

fn disclosure(site: &Site, value: &Value) -> Result<(), String> {
    let kind = choice(value, "type", &["accordion", "tabs", "filter"])?.ok_or("disclosure type required")?;
    match kind {
        "accordion" | "tabs" => {
            keys(value, if kind == "tabs" { &["type", "indicator", "initial", "items"] } else { &["type", "single", "initial", "items"] })?;
            flag(value, "single")?; reference(site, value, "indicator")?;
            let items = array(value, "items", 1, 50)?;
            for item in items { keys(item, &["trigger", "panel"])?; target(site, item, "trigger")?; target(site, item, "panel")?; }
            if let Some(initial) = value.get("initial") {
                if !initial.is_null() && !initial.as_u64().map(|i| (i as usize) < items.len()).unwrap_or(false) { return Err("initial must index an item".into()); }
            }
        }
        _ => {
            keys(value, &["type", "items", "initial", "chips"])?;
            target(site, value, "items")?;
            let chips = array(value, "chips", 1, 50)?;
            let mut values = vec![];
            for chip in chips {
                keys(chip, &["trigger", "value"])?;
                target(site, chip, "trigger")?;
                let tag = string(chip, "value")?;
                if !identifier(tag) { return Err("invalid filter value".into()); }
                values.push(tag);
            }
            if let Some(initial) = value.get("initial") { if !initial.as_str().map(|i| values.contains(&i)).unwrap_or(false) { return Err("initial must match a chip value".into()); } }
        }
    }
    Ok(())
}

fn hidden_template<'a>(site: &Site, value: &'a Value, key: &str) -> Result<&'a str, String> {
    let id = target(site, value, key)?;
    if !site.nodes[id].attrs.contains_key("hidden") { return Err(format!("{key} node must carry the hidden attribute")); }
    Ok(id)
}

fn set_variable(site: &Site, value: &Value) -> Result<(), String> {
    let name = string(value, "variable")?;
    if !crate::variables::valid_name(name) { return Err("invalid variable name".into()); }
    let group = site.extensions.get("variables");
    match (value.get("value"), value.get("formula")) {
        (Some(literal), None) => {
            let kind = match group {
                Some(group) => Some(group.get("values").and_then(|v| v.get(name)).ok_or("set-variable needs a variable value name")?.get("type").and_then(Value::as_str).unwrap_or("")),
                None => None,
            };
            let valid = match (kind, literal) {
                (Some("number"), v) | (None, v @ Value::Number(_)) => v.as_f64().map(f64::is_finite).unwrap_or(false),
                (Some("text"), Value::String(s)) | (None, Value::String(s)) => s.chars().count() <= 2000,
                (Some("boolean"), Value::Bool(_)) | (None, Value::Bool(_)) => true,
                _ => false,
            };
            if !valid { return Err("set-variable value does not match the variable type".into()); }
        }
        (None, Some(source)) => {
            if let Some(group) = group { if group.get("values").and_then(|v| v.get(name)).is_none() { return Err("set-variable needs a variable value name".into()); } }
            crate::variables::check_formula(source.as_str().ok_or("formula must be text")?, group)?;
        }
        _ => return Err("set-variable needs exactly one of value or formula".into()),
    }
    Ok(())
}

fn search(site: &Site, value: &Value) -> Result<(), String> {
    if site.nodes[target(site, value, "input")?].tag != "input" { return Err("search input must be an input element".into()); }
    target(site, value, "results")?;
    hidden_template(site, value, "template")?;
    integer(value, "limit", 1.0, 50.0)?;
    reference(site, value, "empty")?;
    flag(value, "fromParam")?;
    Ok(())
}

fn action(site: &Site, root: &Value, value: &Value, trigger: bool) -> Result<(), String> {
    keys(value, &["trigger", "action", "text", "from", "feedback", "duration", "to", "progress", "easing", "command", "target", "variable", "value", "formula", "input", "results", "template", "limit", "empty", "fromParam", "script"])?;
    if trigger { if !TRIGGERS.contains(&string(value, "trigger")?) { return Err("invalid action trigger".into()); } } else if value.get("trigger").is_some() { return Err("marker actions take no trigger".into()); }
    integer(value, "duration", 0.0, 60000.0)?; easing(value)?;
    match string(value, "action")? {
        "copy" => {
            let literal = value.get("text").map(|t| t.as_str().filter(|s| s.len() <= 4096).ok_or("copy text must be text up to 4096 bytes")).transpose()?;
            let from = reference(site, value, "from")?;
            if literal.is_none() == from.is_none() { return Err("copy needs exactly one of text or from".into()); }
            if let Some(feedback) = value.get("feedback") { if !feedback.as_str().map(|s| s.len() <= 64 && !s.chars().any(char::is_control)).unwrap_or(false) { return Err("invalid copy feedback".into()); } }
        }
        "scroll-to" => { target(site, value, "to")?; number(value, "progress", 0.0, 1.0)?; }
        "media" => {
            choice(value, "command", &["play", "pause", "toggle", "restart"])?.ok_or("media command required")?;
            if !["video", "audio"].contains(&site.nodes[target(site, value, "target")?].tag.as_str()) { return Err("media target must be a video or audio element".into()); }
        }
        "lightbox" => { if site.nodes[target(site, value, "target")?].tag != "img" { return Err("lightbox target must be an image".into()); } }
        "toggle-theme" => {}
        "set-variable" => set_variable(site, value)?,
        "search" => search(site, value)?,
        "play" => { let script = string(value, "script")?; if root.get("scripts").and_then(|s| s.get(script)).is_none() { return Err("play needs an existing script".into()); } }
        _ => return Err("invalid motion action".into()),
    }
    Ok(())
}

fn actions(site: &Site, root: &Value, value: &Value) -> Result<(), String> {
    let list = value.as_array().ok_or("actions must be an array")?;
    if list.len() > 20 { return Err("too many actions on one node".into()); }
    for entry in list { action(site, root, entry, true)?; }
    Ok(())
}

fn step_target(site: &Site, aliases: &[String], step: &Value, key: &str) -> Result<(), String> {
    let name = string(step, key)?;
    match name.strip_prefix('@') {
        Some(alias) => if aliases.iter().any(|a| a == alias) { Ok(()) } else { Err(format!("alias {name} is not defined by an earlier append")) },
        None => node(site, name),
    }
}

fn step_text(step: &Value, key: &str, required: bool) -> Result<(), String> {
    match step.get(key) {
        None if !required => Ok(()),
        Some(Value::String(s)) if s.chars().count() <= 4000 => Ok(()),
        _ => Err(format!("{key} must be text up to 4000 characters")),
    }
}

fn class_list(step: &Value, key: &str) -> Result<(), String> {
    let Some(list) = step.get(key) else { return Ok(()) };
    let list = list.as_array().filter(|l| l.len() <= 32).ok_or_else(|| format!("{key} must be a list of up to 32 class names"))?;
    if list.iter().all(|c| c.as_str().map(identifier).unwrap_or(false)) { Ok(()) } else { Err(format!("{key} holds invalid class names")) }
}

fn step(site: &Site, root: &Value, aliases: &mut Vec<String>, value: &Value) -> Result<(), String> {
    match string(value, "type")? {
        "append" => {
            keys(value, &["type", "template", "into", "as", "text"])?;
            hidden_template(site, value, "template")?;
            step_target(site, aliases, value, "into")?;
            step_text(value, "text", false)?;
            if let Some(alias) = value.get("as") {
                let alias = alias.as_str().filter(|a| identifier(a)).ok_or("invalid alias")?;
                if aliases.iter().any(|a| a == alias) { return Err("alias is defined twice".into()); }
                aliases.push(alias.to_string());
            }
        }
        "clear" | "press" | "focus" => { keys(value, &["type", "target"])?; step_target(site, aliases, value, "target")?; }
        "wait" => { keys(value, &["type", "ms"])?; required(value, "ms", 0.0, 60000.0)?; }
        "stream" => {
            keys(value, &["type", "target", "text", "speed", "by"])?;
            step_target(site, aliases, value, "target")?; step_text(value, "text", true)?;
            number(value, "speed", 1.0, 2000.0)?; choice(value, "by", &["chars", "words"])?;
        }
        "type" => {
            keys(value, &["type", "target", "text", "speed"])?;
            step_target(site, aliases, value, "target")?; step_text(value, "text", true)?;
            number(value, "speed", 1.0, 2000.0)?;
        }
        "class" => { keys(value, &["type", "target", "add", "remove"])?; step_target(site, aliases, value, "target")?; class_list(value, "add")?; class_list(value, "remove")?; }
        "pointer" => {
            keys(value, &["type", "target", "to", "duration", "easing"])?;
            step_target(site, aliases, value, "target")?; step_target(site, aliases, value, "to")?;
            number(value, "duration", 0.0, 10000.0)?; easing(value)?;
        }
        "scroll" => {
            keys(value, &["type", "target", "to"])?;
            step_target(site, aliases, value, "target")?;
            if !["start", "end"].contains(&string(value, "to")?) { step_target(site, aliases, value, "to")?; }
        }
        "action" => {
            keys(value, &["type", "action"])?;
            let inner = value.get("action").ok_or("step action required")?;
            if string(inner, "action")? == "play" { return Err("a script step cannot play a script".into()); }
            action(site, root, inner, false)?;
        }
        _ => return Err("invalid script step".into()),
    }
    Ok(())
}

fn script(site: &Site, root: &Value, id: &str, value: &Value) -> Result<(), String> {
    keys(value, &["trigger", "once", "restart", "reset", "loop", "loopDelay", "steps"])?;
    let trigger = choice(value, "trigger", SCRIPT_TRIGGERS)?.ok_or("script trigger required")?;
    if trigger == "submit" && site.nodes[id].tag != "form" { return Err("a submit script needs a form node".into()); }
    flag(value, "once")?; flag(value, "restart")?; flag(value, "reset")?;
    if flag(value, "loop")?.unwrap_or(false) && !["load", "view"].contains(&trigger) { return Err("only load and view scripts can loop".into()); }
    integer(value, "loopDelay", 0.0, 60000.0)?;
    let mut aliases = Vec::new();
    for entry in array(value, "steps", 1, 100)? { step(site, root, &mut aliases, entry)?; }
    Ok(())
}

pub fn validate(site: &Site, value: &Value) -> Result<(), String> {
    keys(value, KINDS)?;
    let mut total = 0;
    for kind in KINDS {
        let entries = maps(value, kind)?;
        total += entries.len();
        if total > 2000 { return Err("motion exceeds 2000 entries".into()); }
        for (id, entry) in entries {
            node(site, id)?;
            match *kind {
                "reveals" => reveal(entry)?,
                "scenes" => scene(site, value, id, entry)?,
                "loops" => loop_entry(entry)?,
                "counters" => counter(entry)?,
                "text" => text_entry(site, id, entry)?,
                "drag" => drag(site, entry)?,
                "pointer" => pointer(site, entry)?,
                "disclosure" => disclosure(site, entry)?,
                "scripts" => script(site, value, id, entry)?,
                _ => actions(site, value, entry)?,
            }
        }
    }
    Ok(())
}
