use formweb_model::{Item, Node, Site};
use serde_json::{json, Value};
use std::cmp::Ordering;

pub fn group(site: &Site) -> Option<&Value> { site.extensions.get("cms") }
pub fn list<'a>(site: &'a Site, id: &str) -> Option<&'a Value> { group(site)?.get("lists")?.get(id) }
pub fn list_collection<'a>(site: &'a Site, node: &'a Node) -> Option<&'a str> {
    list(site, &node.id).and_then(|v| v.get("collection")).and_then(Value::as_str)
        .or_else(|| node.binding.as_ref().filter(|b| b.field.is_none()).map(|b| b.collection.as_str()))
}
pub fn localized(site: &Site, collection: &str, item: &Item, locale: &str) -> Item {
    let mut result = item.clone();
    if let Some(patch) = group(site).and_then(|v| v.get("localized")).and_then(|v| v.get(collection)).and_then(|v| v.get(&item.id)).and_then(|v| v.get(locale)) {
        if let Some(values) = patch.get("values").and_then(Value::as_object) {
            for (key, value) in values { result.values.insert(key.clone(), value.clone()); }
        }
        if let Some(slug) = patch.get("slug").and_then(Value::as_str) { result.slug = slug.into(); }
        if let Some(status) = patch.get("status").and_then(Value::as_str) { result.status = status.into(); }
    }
    result
}
pub fn item(site: &Site, collection: &str, id: &str, locale: &str) -> Option<Item> {
    site.collections.get(collection)?.items.iter().find(|item| item.id == id).map(|item| localized(site, collection, item, locale))
}
pub fn published(site: &Site, collection: &str, locale: &str) -> Vec<Item> {
    site.collections.get(collection).map(|c| c.items.iter().map(|item| localized(site, collection, item, locale)).filter(|item| item.status == "published").collect()).unwrap_or_default()
}
pub fn field(site: &Site, collection: &str, item: &Item, path: &str, locale: &str) -> Option<Value> {
    let mut parts = path.splitn(2, '.');
    let name = parts.next()?;
    if name == "id" { return Some(Value::String(item.id.clone())); }
    if name == "slug" { return Some(Value::String(item.slug.clone())); }
    if name == "status" { return Some(Value::String(item.status.clone())); }
    let value = item.values.get(name)?.clone();
    let Some(rest) = parts.next() else { return Some(value); };
    let definition = site.collections.get(collection)?.fields.iter().find(|f| f.name == name)?;
    let definition = serde_json::to_value(definition).ok()?;
    let target = definition.get("collection")?.as_str()?;
    if let Some(id) = value.as_str() {
        let target_item = self::item(site, target, id, locale)?;
        if target_item.status != "published" { return None; }
        field(site, target, &target_item, rest, locale)
    } else if let Some(ids) = value.as_array() {
        Some(Value::Array(ids.iter().filter_map(Value::as_str).filter_map(|id| {
            let target_item = self::item(site, target, id, locale)?;
            if target_item.status != "published" { return None; }
            field(site, target, &target_item, rest, locale)
        }).collect()))
    } else { None }
}
pub fn display(value: &Value) -> String {
    match value { Value::String(s) => s.clone(), Value::Null => String::new(), Value::Array(items) => items.iter().map(display).collect::<Vec<_>>().join(", "), other => other.to_string() }
}
fn compare(left: &Value, right: &Value) -> Ordering {
    match (left.as_f64(), right.as_f64()) {
        (Some(a), Some(b)) => a.partial_cmp(&b).unwrap_or(Ordering::Equal),
        _ => display(left).to_lowercase().cmp(&display(right).to_lowercase()),
    }
}
fn matches(actual: Option<Value>, predicate: &Value) -> bool {
    let actual = actual.unwrap_or(Value::Null);
    let expected = predicate.get("value").unwrap_or(&Value::Null);
    match predicate.get("op").and_then(Value::as_str).unwrap_or("eq") {
        "eq" => actual == *expected,
        "ne" => actual != *expected,
        "contains" => actual.as_array().map(|items|items.contains(expected)).unwrap_or_else(||display(&actual).to_lowercase().contains(&display(expected).to_lowercase())),
        "gt" => compare(&actual, expected) == Ordering::Greater,
        "lt" => compare(&actual, expected) == Ordering::Less,
        "gte" => compare(&actual, expected) != Ordering::Less,
        "lte" => compare(&actual, expected) != Ordering::Greater,
        "in" => expected.as_array().map(|items| items.contains(&actual)).unwrap_or(false),
        _ => false,
    }
}
pub fn query(site: &Site, node: &Node, collection: &str, locale: &str) -> Vec<Item> {
    let mut items = published(site, collection, locale);
    if let Some(config) = list(site, &node.id) {
        if let Some(filters) = config.get("filter").and_then(Value::as_array) {
            items.retain(|item| filters.iter().all(|filter| matches(field(site, collection, item, filter.get("field").and_then(Value::as_str).unwrap_or(""), locale), filter)));
        }
        if let Some(sort) = config.get("sort").and_then(Value::as_array) {
            items.sort_by(|a, b| {
                for order in sort {
                    let key = order.get("field").and_then(Value::as_str).unwrap_or("");
                    let left = field(site, collection, a, key, locale).unwrap_or(Value::Null);
                    let right = field(site, collection, b, key, locale).unwrap_or(Value::Null);
                    let mut result = compare(&left, &right);
                    if order.get("direction").and_then(Value::as_str) == Some("desc") { result = result.reverse(); }
                    if result != Ordering::Equal { return result; }
                }
                a.id.cmp(&b.id)
            });
        }
        let offset = config.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
        let limit = config.get("limit").and_then(Value::as_u64).map(|v| v as usize).unwrap_or(items.len());
        items = items.into_iter().skip(offset).take(limit).collect();
    }
    items
}
pub fn empty_target<'a>(site: &'a Site, id: &str) -> Option<&'a str> { list(site, id)?.get("emptyNode")?.as_str() }
pub fn is_empty_target(site: &Site, id: &str) -> bool {
    group(site).and_then(|v| v.get("lists")).and_then(Value::as_object).map(|lists| lists.values().any(|v| v.get("emptyNode").and_then(Value::as_str) == Some(id))).unwrap_or(false)
}
pub fn page_size(site: &Site, id: &str) -> Option<u64> { list(site, id)?.get("pageSize")?.as_u64().filter(|v| *v > 0) }
pub fn binding(site: &Site, node: &Node, locale: &str, context: Option<(&str, &Item)>) -> Option<(String, String)> {
    let config = group(site)?.get("bindings")?.get(&node.id)?;
    let collection = config.get("collection")?.as_str()?;
    let key = config.get("field")?.as_str()?;
    let selected = config.get("item").and_then(Value::as_str);
    let value = if let Some(id) = selected {
        let item = self::item(site, collection, id, locale)?;
        if item.status != "published" { Value::Null } else { field(site, collection, &item, key, locale).unwrap_or(Value::Null) }
    } else if let Some((current, item)) = context.filter(|(current, _)| *current == collection) {
        field(site, current, item, key, locale).unwrap_or(Value::Null)
    } else {
        let item = published(site, collection, locale).into_iter().next();
        item.and_then(|item| field(site, collection, &item, key, locale)).unwrap_or(Value::Null)
    };
    Some((config.get("target").and_then(Value::as_str).unwrap_or("text").into(), display(&value)))
}
pub fn interpolate(site: &Site, template: &str, collection: Option<&str>, item: Option<&Item>, locale: &str) -> String {
    let mut output = String::new();
    let mut remaining = template;
    while let Some(start) = remaining.find('{') {
        output.push_str(&remaining[..start]);
        let next = &remaining[start + 1..];
        let Some(end) = next.find('}') else { output.push_str(&remaining[start..]); return output; };
        let key = next[..end].trim().trim_start_matches("item.");
        let content = collection.zip(item).and_then(|(c, i)| field(site, c, i, key, locale)).unwrap_or(json!(""));
        output.push_str(&display(&content));
        remaining = &next[end + 1..];
    }
    output.push_str(remaining);
    output
}
