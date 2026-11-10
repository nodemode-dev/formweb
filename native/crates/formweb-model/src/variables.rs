use crate::advanced::{keys, maps, node, object, string};
use crate::formula;
use crate::Site;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub fn valid_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 64
        && (bytes[0].is_ascii_alphabetic() || bytes[0] == b'_')
        && bytes.iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_')
        && !formula::FUNCTIONS.contains(&name)
        && name != "true"
        && name != "false"
}

fn finite(value: &Value) -> Option<f64> { value.as_f64().filter(|n| n.is_finite()) }

fn optional_finite(value: &Value, key: &str) -> Result<Option<f64>, String> {
    match value.get(key) {
        None => Ok(None),
        Some(v) => finite(v).map(Some).ok_or_else(|| format!("{key} must be a finite number")),
    }
}

fn css_var(value: &Value) -> Result<(), String> {
    if value.get("cssVar").map(Value::is_boolean).unwrap_or(true) { Ok(()) } else { Err("cssVar must be boolean".into()) }
}

fn short_text(value: &Value, max: usize) -> bool { value.as_str().map(|s| s.chars().count() <= max).unwrap_or(false) }

fn value_definition(definition: &Value) -> Result<(), String> {
    match string(definition, "type")? {
        "number" => {
            keys(definition, &["type", "initial", "min", "max", "step", "cssVar"])?;
            let initial = definition.get("initial").and_then(finite).ok_or("number initial must be a finite number")?;
            let min = optional_finite(definition, "min")?;
            let max = optional_finite(definition, "max")?;
            let step = optional_finite(definition, "step")?;
            if min.map(|m| initial < m).unwrap_or(false) || max.map(|m| initial > m).unwrap_or(false) || (min.is_some() && max.is_some() && min > max) { return Err("number initial must sit between min and max".into()); }
            if step.map(|s| s <= 0.0).unwrap_or(false) { return Err("step must be above 0".into()); }
            css_var(definition)
        }
        "text" => {
            keys(definition, &["type", "initial", "options"])?;
            let initial = definition.get("initial").filter(|v| short_text(v, 2000)).and_then(Value::as_str).ok_or("text initial must be text up to 2000 characters")?;
            if let Some(options) = definition.get("options") {
                let list = options.as_array().filter(|l| (1..=100).contains(&l.len())).ok_or("options needs 1 to 100 entries")?;
                if !list.iter().all(|o| short_text(o, 200)) || !list.iter().any(|o| o.as_str() == Some(initial)) { return Err("options must be short text and include the initial value".into()); }
            }
            Ok(())
        }
        "boolean" => {
            keys(definition, &["type", "initial", "cssVar"])?;
            if !definition.get("initial").map(Value::is_boolean).unwrap_or(false) { return Err("boolean initial must be boolean".into()); }
            css_var(definition)
        }
        _ => Err("variable type must be number, text or boolean".into()),
    }
}

fn table(entries: &Value) -> Result<(), String> {
    let map = object(entries)?;
    if map.len() > 500 { return Err("a table holds at most 500 entries".into()); }
    for (key, entry) in map {
        if key.chars().count() > 64 { return Err("table keys are at most 64 characters".into()); }
        if !(entry.as_f64().map(f64::is_finite).unwrap_or(false) || short_text(entry, 200)) { return Err("table values are finite numbers or text up to 200 characters".into()); }
    }
    Ok(())
}

pub(crate) fn check_formula(source: &str, group: Option<&Value>) -> Result<Vec<String>, String> {
    if source.len() > 2000 { return Err("formula exceeds 2000 bytes".into()); }
    let expr = formula::parse(source)?;
    let references = formula::references(&expr);
    if let Some(group) = group {
        let has = |kind: &str, name: &str| group.get(kind).and_then(|m| m.get(name)).is_some();
        for (name, table_position) in &references {
            if has("tables", name) {
                if !table_position { return Err(format!("table {name} can only be used with lookup or sum")); }
            } else if !has("values", name) && !has("formulas", name) {
                return Err(format!("formula references unknown name {name}"));
            }
        }
        for name in formula::lookup_tables(&expr) {
            if !has("tables", &name) { return Err(format!("lookup needs a table, not {name}")); }
        }
    }
    let mut names: Vec<String> = references.into_iter().map(|(name, _)| name).collect();
    names.sort();
    names.dedup();
    Ok(names)
}

fn cyclic(name: &str, edges: &BTreeMap<String, Vec<String>>, done: &mut BTreeSet<String>, path: &mut BTreeSet<String>) -> bool {
    if done.contains(name) { return false; }
    if !path.insert(name.to_string()) { return true; }
    for next in edges.get(name).into_iter().flatten() {
        if cyclic(next, edges, done, path) { return true; }
    }
    path.remove(name);
    done.insert(name.to_string());
    false
}

pub fn validate(site: &Site, value: &Value) -> Result<(), String> {
    keys(value, &["values", "tables", "formulas", "inputs", "outputs"])?;
    let values = maps(value, "values")?;
    let tables = maps(value, "tables")?;
    let formulas = maps(value, "formulas")?;
    let inputs = maps(value, "inputs")?;
    let outputs = maps(value, "outputs")?;
    if values.len() > 200 || tables.len() > 50 || formulas.len() > 200 || inputs.len() > 500 || outputs.len() > 500 { return Err("variables exceed a count limit".into()); }
    let mut names = BTreeSet::new();
    for &(name, _) in values.iter().chain(tables.iter()).chain(formulas.iter()) {
        if !valid_name(name) || !names.insert(name.as_str()) { return Err(format!("invalid or duplicate variable name {name}")); }
    }
    for (_, definition) in &values { value_definition(definition)?; }
    for (_, entries) in &tables { table(entries)?; }
    let mut edges: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (name, source) in &formulas {
        let source = source.as_str().ok_or("a formula must be text")?;
        let referenced = check_formula(source, Some(value))?;
        edges.insert((*name).clone(), referenced.into_iter().filter(|r| value["formulas"].get(r).is_some()).collect());
    }
    let mut done = BTreeSet::new();
    for name in edges.keys() {
        if cyclic(name, &edges, &mut done, &mut BTreeSet::new()) { return Err("formulas cannot depend on themselves".into()); }
    }
    for (id, input) in &inputs {
        node(site, id)?;
        if !["input", "select", "textarea"].contains(&site.nodes[*id].tag.as_str()) { return Err("an input binding needs an input, select or textarea node".into()); }
        keys(input, &["variable", "event"])?;
        if value["values"].get(string(input, "variable")?).is_none() { return Err("an input binds to a value, not a formula".into()); }
        if let Some(event) = input.get("event") { if !event.as_str().map(|e| ["input", "change"].contains(&e)).unwrap_or(false) { return Err("input event must be input or change".into()); } }
    }
    for (id, output) in &outputs {
        node(site, id)?;
        keys(output, &["from", "decimals", "prefix", "suffix", "grouping", "reserve"])?;
        let from = string(output, "from")?;
        if value["values"].get(from).is_none() && value["formulas"].get(from).is_none() { return Err("an output reads a value or a formula".into()); }
        if let Some(decimals) = output.get("decimals") { if !decimals.as_u64().map(|d| d <= 10).unwrap_or(false) { return Err("decimals must be 0 to 10".into()); } }
        for key in ["prefix", "suffix"] { if let Some(text) = output.get(key) { if !short_text(text, 32) { return Err(format!("{key} is at most 32 characters")); } } }
        if output.get("grouping").map(|g| !g.is_boolean()).unwrap_or(false) { return Err("grouping must be boolean".into()); }
        if let Some(reserve) = output.get("reserve") { if !reserve.as_u64().map(|r| (1..=64).contains(&r)).unwrap_or(false) { return Err("reserve must be 1 to 64".into()); } }
    }
    Ok(())
}
