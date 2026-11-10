use formweb_model::formula;
use formweb_model::{Node, Site};
use serde_json::Value;

fn group(site: &Site) -> Option<&Value> {
    site.extensions.get("variables")
}

pub fn output_text(site: &Site, node: &Node) -> Option<String> {
    let group = group(site)?;
    let output = group.get("outputs")?.get(&node.id)?;
    let from = output.get("from")?.as_str()?;
    let values = formula::evaluate(group);
    let value = values.get(from)?;
    Some(formula::format(value, output))
}

pub fn input_attrs(site: &Site, node: &Node) -> Vec<(String, String)> {
    let mut attrs = Vec::new();
    let Some(group) = group(site) else { return attrs };
    let Some(name) = group.get("inputs").and_then(|v| v.get(&node.id)).and_then(|v| v.get("variable")).and_then(Value::as_str) else { return attrs };
    let Some(value) = group.get("values").and_then(|v| v.get(name)) else { return attrs };
    let initial = value.get("initial");
    match value.get("type").and_then(Value::as_str) {
        Some("number") => {
            if let Some(number) = initial.and_then(Value::as_f64) {
                attrs.push(("value".to_string(), formula::number_text(number)));
            }
            for key in ["min", "max", "step"] {
                if node.attrs.contains_key(key) { continue; }
                if let Some(number) = value.get(key).and_then(Value::as_f64) {
                    attrs.push((key.to_string(), formula::number_text(number)));
                }
            }
        }
        Some("text") => {
            if let Some(text) = initial.and_then(Value::as_str) {
                attrs.push(("value".to_string(), text.to_string()));
            }
        }
        Some("boolean") => {
            if initial.and_then(Value::as_bool) == Some(true) {
                attrs.push(("checked".to_string(), String::new()));
            }
        }
        _ => {}
    }
    attrs
}

pub fn boot(site: &Site) -> String {
    let Some(values) = group(site).and_then(|v| v.get("values")).and_then(Value::as_object) else { return String::new() };
    let mut script = String::new();
    for (name, value) in values {
        if value.get("cssVar").and_then(Value::as_bool) != Some(true) { continue; }
        let text = match value.get("type").and_then(Value::as_str) {
            Some("number") => match value.get("initial").and_then(Value::as_f64) {
                Some(number) => formula::number_text(number),
                None => continue,
            },
            Some("boolean") => if value.get("initial").and_then(Value::as_bool) == Some(true) { "1".to_string() } else { "0".to_string() },
            _ => continue,
        };
        script.push_str(&format!("d.style.setProperty(\"--fw-v-{name}\",\"{text}\");"));
    }
    script
}

pub fn reserve(site: &Site, node_id: &str) -> Option<usize> {
    let group = group(site)?;
    let output = group.get("outputs")?.get(node_id)?;
    if let Some(value) = output.get("reserve").and_then(Value::as_u64) {
        return Some(value as usize);
    }
    let from = output.get("from")?.as_str()?;
    let values = formula::evaluate(group);
    let value = values.get(from)?;
    Some(formula::format(value, output).chars().count() + 2)
}
