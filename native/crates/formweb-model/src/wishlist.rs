use crate::{identifier, safe_css_value, Site};
use serde_json::{Map, Value};
use std::collections::BTreeSet;

pub const MAX_FACETS: usize = 16;
pub const MAX_SORTS: usize = 16;
pub const MAX_NESTING: usize = 6;

fn object<'a>(value: &'a Value, what: &str) -> Result<&'a Map<String, Value>, String> {
    value.as_object().ok_or_else(|| format!("{what} must be an object"))
}

fn only(map: &Map<String, Value>, allowed: &[&str], what: &str) -> Result<(), String> {
    if map.keys().any(|k| !allowed.contains(&k.as_str())) { return Err(format!("unknown {what} field")); }
    Ok(())
}

fn text(map: &Map<String, Value>, key: &str, max: usize) -> Result<(), String> {
    match map.get(key) {
        None => Ok(()),
        Some(v) if v.as_str().map(|s| s.len() <= max && !s.chars().any(char::is_control)).unwrap_or(false) => Ok(()),
        _ => Err(format!("invalid {key}")),
    }
}

fn flag(map: &Map<String, Value>, key: &str) -> Result<(), String> {
    if map.get(key).map(Value::is_boolean).unwrap_or(true) { Ok(()) } else { Err(format!("{key} must be boolean")) }
}

pub fn path_kind(site: &Site, collection: &str, path: &str) -> Option<String> {
    let mut current = collection.to_string();
    let mut parts = path.split('.').peekable();
    let mut depth = 0;
    while let Some(name) = parts.next() {
        depth += 1;
        if depth > MAX_NESTING { return None; }
        if parts.peek().is_none() && ["id", "slug", "status"].contains(&name) { return Some("text".into()); }
        let field = site.collections.get(&current)?.fields.iter().find(|f| f.name == name)?;
        if parts.peek().is_none() { return Some(field.kind.clone()); }
        if !["reference", "references"].contains(&field.kind.as_str()) { return None; }
        current = field.collection.clone()?;
    }
    None
}

pub fn validate(site: &Site, cms: &Value) -> Result<(), String> {
    if let Some(folders) = cms.get("folders") {
        let folders = object(folders, "folders")?;
        if folders.len() > 100 { return Err("too many collection folders".into()); }
        let mut seen = BTreeSet::new();
        for (id, folder) in folders {
            let folder = object(folder, "folder")?;
            only(folder, &["name", "collections"], "folder")?;
            if !identifier(id) { return Err("invalid folder id".into()); }
            text(folder, "name", 200)?;
            let members = folder.get("collections").and_then(Value::as_array).ok_or("folder collections must be an array")?;
            for member in members {
                let member = member.as_str().ok_or("folder collection must be text")?;
                if !site.collections.contains_key(member) || !seen.insert(member.to_string()) { return Err("folder references an unknown or already filed collection".into()); }
            }
        }
    }
    nesting(site, cms)?;
    let Some(lists) = cms.get("lists") else { return Ok(()); };
    for list in object(lists, "lists")?.values() {
        let list = object(list, "list")?;
        let collection = list.get("collection").and_then(Value::as_str).ok_or("list collection required")?;
        if let Some(facets) = list.get("facets") {
            let facets = facets.as_array().ok_or("facets must be an array")?;
            if facets.len() > MAX_FACETS { return Err("too many facets".into()); }
            let mut keys = BTreeSet::new();
            for facet in facets {
                let facet = object(facet, "facet")?;
                only(facet, &["key", "field", "kind", "label", "fields", "placeholder"], "facet")?;
                let key = facet.get("key").and_then(Value::as_str).ok_or("facet key required")?;
                if !identifier(key) || ["sort", "page"].contains(&key) || !keys.insert(key.to_string()) { return Err("invalid or duplicate facet key".into()); }
                let field = facet.get("field").and_then(Value::as_str).ok_or("facet field required")?;
                let kind = path_kind(site, collection, field).ok_or("unknown facet field")?;
                match facet.get("kind").and_then(Value::as_str) {
                    Some("checkbox") | Some("select") | Some("search") => {}
                    Some("range") => { if !["number", "date"].contains(&kind.as_str()) { return Err("range facets need a number or date field".into()); } }
                    _ => return Err("facet kind must be checkbox, select, search or range".into()),
                }
                text(facet, "label", 200)?;
                text(facet, "placeholder", 200)?;
                if let Some(fields) = facet.get("fields") {
                    let fields = fields.as_array().ok_or("facet fields must be an array")?;
                    if fields.len() > 8 || fields.iter().any(|f| !f.as_str().map(|p| path_kind(site, collection, p).is_some()).unwrap_or(false)) { return Err("invalid facet search fields".into()); }
                }
            }
        }
        if let Some(sorts) = list.get("sortOptions") {
            let sorts = sorts.as_array().ok_or("sortOptions must be an array")?;
            if sorts.len() > MAX_SORTS { return Err("too many sort options".into()); }
            let mut keys = BTreeSet::new();
            for sort in sorts {
                let sort = object(sort, "sort option")?;
                only(sort, &["key", "field", "direction", "label"], "sort option")?;
                let key = sort.get("key").and_then(Value::as_str).ok_or("sort option key required")?;
                if !identifier(key) || !keys.insert(key.to_string()) { return Err("invalid or duplicate sort option key".into()); }
                let field = sort.get("field").and_then(Value::as_str).ok_or("sort field required")?;
                if path_kind(site, collection, field).is_none() { return Err("unknown sort field".into()); }
                if !["asc", "desc"].contains(&sort.get("direction").and_then(Value::as_str).unwrap_or("asc")) { return Err("invalid sort direction".into()); }
                text(sort, "label", 200)?;
            }
        }
        if let Some(slider) = list.get("slider") {
            let slider = object(slider, "slider")?;
            only(slider, &["perView", "arrows", "dots", "autoplay", "interval", "loop", "label", "gap"], "slider")?;
            if slider.get("perView").map(|v| v.as_u64().map(|n| (1..=6).contains(&n)).unwrap_or(false)) == Some(false) { return Err("slider perView must be 1 to 6".into()); }
            if slider.get("interval").map(|v| v.as_u64().map(|n| (2000..=60000).contains(&n)).unwrap_or(false)) == Some(false) { return Err("slider interval must be 2000 to 60000 ms".into()); }
            for key in ["arrows", "dots", "autoplay", "loop"] { flag(slider, key)?; }
            text(slider, "label", 200)?;
            if let Some(gap) = slider.get("gap") {
                let gap = gap.as_str().ok_or("slider gap must be text")?;
                if !length(gap) { return Err("slider gap must be a CSS length".into()); }
            }
        }
        if list.get("slider").is_some() && (list.get("facets").is_some() || list.get("sortOptions").is_some()) { return Err("a slider cannot also carry filters or sorting".into()); }
        if list.get("slider").is_some() && list.get("pageSize").map(|v| v.as_u64().unwrap_or(0) > 0).unwrap_or(false) { return Err("a slider cannot also paginate".into()); }
    }
    Ok(())
}

fn nesting(site: &Site, cms: &Value) -> Result<(), String> {
    let mut lists: BTreeSet<&str> = site.nodes.values().filter(|n| n.binding.as_ref().map(|b| b.field.is_none()).unwrap_or(false)).map(|n| n.id.as_str()).collect();
    if let Some(map) = cms.get("lists").and_then(Value::as_object) { lists.extend(map.keys().map(String::as_str)); }
    if lists.len() < 2 { return Ok(()); }
    let mut stack: Vec<(&str, usize)> = site.pages.iter().map(|p| (p.root.as_str(), 0)).collect();
    while let Some((id, depth)) = stack.pop() {
        let Some(node) = site.nodes.get(id) else { continue };
        let depth = depth + usize::from(lists.contains(id));
        if depth > MAX_NESTING { return Err(format!("collection lists nest deeper than {MAX_NESTING} levels")); }
        stack.extend(node.children.iter().map(|c| (c.as_str(), depth)));
    }
    Ok(())
}

pub fn constraint(value: &Value) -> Result<(), String> {
    if let Some(preset) = value.get("preset") {
        if !matches!(preset.as_str(), Some("phone" | "postal" | "email")) { return Err("form preset must be phone, postal or email".into()); }
    }
    if let Some(accept) = value.get("accept") {
        let accept = accept.as_str().ok_or("accept must be text")?;
        if accept.len() > 200 || !accept.bytes().all(|c| c.is_ascii_alphanumeric() || b"./*,+- ".contains(&c)) { return Err("invalid accept list".into()); }
    }
    if let Some(size) = value.get("maxSize") {
        if !size.as_u64().map(|n| (1..=2 * 1024 * 1024).contains(&n)).unwrap_or(false) { return Err("maxSize must be 1 to 2097152 bytes".into()); }
    }
    Ok(())
}

pub fn length(value: &str) -> bool {
    safe_css_value(value) && (value == "0" || ["px", "rem", "em", "%", "vh", "vw", "ch"].iter().any(|unit| value.strip_suffix(unit).and_then(|n| n.parse::<f64>().ok()).map(|n| n.is_finite() && n >= 0.0).unwrap_or(false)))
}

pub fn padding(value: &str) -> bool {
    let parts: Vec<&str> = value.split_whitespace().collect();
    !parts.is_empty() && parts.len() <= 4 && parts.iter().all(|p| length(p))
}

pub fn validate_settings(settings: &crate::Strings) -> Result<(), String> {
    if let Some(gap) = settings.get("layoutGap") { if !length(gap) { return Err("layoutGap must be a CSS length".into()); } }
    if let Some(value) = settings.get("layoutPadding") { if !padding(value) { return Err("layoutPadding must be one to four CSS lengths".into()); } }
    if let Some(value) = settings.get("layoutColumns") { if !value.parse::<u32>().map(|n| (1..=12).contains(&n)).unwrap_or(false) { return Err("layoutColumns must be 1 to 12".into()); } }
    Ok(())
}
