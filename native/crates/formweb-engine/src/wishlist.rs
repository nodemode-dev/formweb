use crate::{descendants, fresh_id, guard_structure, object, string};
use formweb_model::{blank_node, Binding, Site};
use serde_json::{json, Value};
use std::collections::BTreeMap;

fn cms_group(site: &mut Site) -> Result<&mut serde_json::Map<String, Value>, String> {
    site.extensions.entry("cms".into()).or_insert_with(|| json!({})).as_object_mut().ok_or_else(|| "cms group must be an object".into())
}

fn uint(params: &Value, key: &str, default: u64, min: u64, max: u64) -> Result<u64, String> {
    let value = match params.get(key) { None | Some(Value::Null) => default, Some(v) => v.as_u64().ok_or_else(|| format!("{key} must be a nonnegative integer"))? };
    if value < min || value > max { return Err(format!("{key} must be {min} to {max}")); }
    Ok(value)
}

fn add_node(site: &mut Site, prefix: &str, tag: &str, name: &str, text: &str, styles: &[(&str, &str)], attrs: &[(&str, &str)]) -> String {
    let id = fresh_id(site, prefix);
    let mut node = blank_node(&id, tag, name, text, styles);
    for (key, value) in attrs { node.attrs.insert(key.to_string(), value.to_string()); }
    site.nodes.insert(id.clone(), node);
    id
}

fn insert_child(site: &mut Site, parent: &str, child: String, index: Option<usize>) -> Result<(), String> {
    let children = &mut site.nodes.get_mut(parent).ok_or("unknown parent")?.children;
    let at = index.unwrap_or(children.len());
    if at > children.len() { return Err("index is outside parent children".into()); }
    children.insert(at, child);
    Ok(())
}

const CELL: &[(&str, &str)] = &[("padding", "10px 14px"), ("border", "1px solid #d6d8cc"), ("text-align", "left")];
const HEAD: &[(&str, &str)] = &[("padding", "10px 14px"), ("border", "1px solid #d6d8cc"), ("text-align", "left"), ("font-weight", "700"), ("background", "#e3e7d9")];

fn make_row(site: &mut Site, cells: usize, header: bool, labels: bool) -> String {
    let row = add_node(site, "row", "tr", "Table row", "", &[], &[]);
    for index in 0..cells {
        let (tag, name, styles, attrs): (&str, &str, &[(&str, &str)], &[(&str, &str)]) = if header { ("th", "Header cell", HEAD, &[("scope", "col")]) } else { ("td", "Cell", CELL, &[]) };
        let text = if header && labels { format!("Column {}", index + 1) } else { String::new() };
        let cell = add_node(site, if header { "head" } else { "cell" }, tag, name, &text, styles, attrs);
        site.nodes.get_mut(&row).unwrap().children.push(cell);
    }
    row
}

fn table_of(site: &Site, id: &str) -> Result<(), String> {
    if site.nodes.get(id).map(|n| n.tag == "table") != Some(true) { return Err("target must be a table element".into()); }
    guard_structure(site, &[id])
}

fn rows_of(site: &Site, table: &str) -> Vec<(String, String)> {
    let mut rows = vec![];
    for child in &site.nodes[table].children {
        match site.nodes[child].tag.as_str() {
            "tr" => rows.push((child.clone(), table.to_string())),
            "thead" | "tbody" | "tfoot" => for row in &site.nodes[child].children { if site.nodes[row].tag == "tr" { rows.push((row.clone(), child.clone())); } },
            _ => {}
        }
    }
    rows
}

fn cells_of(site: &Site, row: &str) -> Vec<String> {
    site.nodes[row].children.iter().filter(|c| ["td", "th"].contains(&site.nodes[*c].tag.as_str())).cloned().collect()
}

fn remove_subtree(site: &mut Site, parent: &str, id: &str) -> Result<(), String> {
    let ids = descendants(site, id)?;
    site.nodes.get_mut(parent).ok_or("unknown parent")?.children.retain(|c| c != id);
    for id in ids { site.nodes.remove(&id); }
    Ok(())
}

fn table_insert(site: &mut Site, params: &Value) -> Result<(), String> {
    let parent = string(params, "parent")?.to_string();
    guard_structure(site, &[&parent])?;
    let parent_node = site.nodes.get(&parent).ok_or("unknown parent")?;
    if formweb_model::void_tag(&parent_node.tag) || ["table", "thead", "tbody", "tfoot", "tr"].contains(&parent_node.tag.as_str()) { return Err("a table cannot be placed inside this element".into()); }
    let rows = uint(params, "rows", 3, 1, 100)? as usize;
    let cols = uint(params, "cols", 3, 1, 30)? as usize;
    let header = params.get("header").and_then(Value::as_bool).unwrap_or(true);
    let index = params.get("index").map(|v| v.as_u64().ok_or("index must be a nonnegative integer")).transpose()?.map(|v| v as usize);
    let table = add_node(site, "table", "table", "Table", "", &[("width", "100%"), ("border-collapse", "collapse"), ("table-layout", "auto")], &[]);
    if let Some(caption) = params.get("caption").and_then(Value::as_str).filter(|c| !c.is_empty()) {
        let node = add_node(site, "caption", "caption", "Table caption", caption, &[("caption-side", "top"), ("text-align", "left"), ("padding", "0 0 8px")], &[]);
        site.nodes.get_mut(&table).unwrap().children.push(node);
    }
    if header {
        let head = add_node(site, "thead", "thead", "Table header", "", &[], &[]);
        let row = make_row(site, cols, true, true);
        site.nodes.get_mut(&head).unwrap().children.push(row);
        site.nodes.get_mut(&table).unwrap().children.push(head);
    }
    let body = add_node(site, "tbody", "tbody", "Table body", "", &[], &[]);
    for _ in 0..rows {
        let row = make_row(site, cols, false, false);
        site.nodes.get_mut(&body).unwrap().children.push(row);
    }
    site.nodes.get_mut(&table).unwrap().children.push(body);
    insert_child(site, &parent, table, index)
}

fn row_add(site: &mut Site, params: &Value) -> Result<(), String> {
    let table = string(params, "table")?.to_string();
    table_of(site, &table)?;
    let rows = rows_of(site, &table);
    let cells = rows.first().map(|(row, _)| cells_of(site, row).len()).unwrap_or(1).max(1);
    let section = match site.nodes[&table].children.iter().rev().find(|c| site.nodes[*c].tag == "tbody").cloned() {
        Some(section) => section,
        None => { let body = add_node(site, "tbody", "tbody", "Table body", "", &[], &[]); insert_child(site, &table, body.clone(), None)?; body }
    };
    let row = make_row(site, cells, false, false);
    if let Some((reference, _)) = rows.iter().rev().find(|(_, parent)| *parent == section) {
        let source = cells_of(site, reference);
        for (cell, original) in cells_of(site, &row).iter().zip(source.iter()) { let styles = site.nodes[original].styles.clone(); site.nodes.get_mut(cell).unwrap().styles = styles; }
    }
    let index = params.get("index").map(|v| v.as_u64().ok_or("index must be a nonnegative integer")).transpose()?.map(|v| v as usize);
    let (target, position) = match index.and_then(|i| rows.get(i)) {
        Some((reference, parent)) if site.nodes[parent].tag != "thead" => (parent.clone(), site.nodes[parent].children.iter().position(|c| c == reference)),
        Some(_) => (section.clone(), Some(0)),
        None => (section.clone(), None),
    };
    insert_child(site, &target, row, position)
}

fn row_remove(site: &mut Site, params: &Value) -> Result<(), String> {
    let table = string(params, "table")?.to_string();
    table_of(site, &table)?;
    let rows = rows_of(site, &table);
    if rows.len() < 2 { return Err("a table needs at least one row".into()); }
    let index = uint(params, "index", u64::MAX, 0, u64::MAX - 1)? as usize;
    let (row, parent) = rows.get(index).cloned().ok_or("row index is out of range")?;
    remove_subtree(site, &parent, &row)?;
    if parent != table && site.nodes[&parent].children.is_empty() && site.nodes[&parent].tag != "tbody" { remove_subtree(site, &table, &parent)?; }
    Ok(())
}

fn uniform(site: &Site, table: &str) -> Result<Vec<(String, Vec<String>)>, String> {
    let rows: Vec<_> = rows_of(site, table).into_iter().map(|(row, _)| { let cells = cells_of(site, &row); (row, cells) }).collect();
    let width = rows.first().map(|(_, c)| c.len()).unwrap_or(0);
    if rows.is_empty() || rows.iter().any(|(_, c)| c.len() != width) || rows.iter().flat_map(|(_, c)| c).any(|c| site.nodes[c].attrs.contains_key("colspan") || site.nodes[c].attrs.contains_key("rowspan")) { return Err("column commands need a regular table without merged cells".into()); }
    Ok(rows)
}

fn col_add(site: &mut Site, params: &Value) -> Result<(), String> {
    let table = string(params, "table")?.to_string();
    table_of(site, &table)?;
    let rows = uniform(site, &table)?;
    let width = rows[0].1.len();
    if width >= 30 { return Err("a table can have at most 30 columns".into()); }
    let index = uint(params, "index", width as u64, 0, width as u64)? as usize;
    for (row, cells) in rows {
        let neighbour = cells.get(index).or_else(|| cells.last()).cloned();
        let header = neighbour.as_ref().map(|c| site.nodes[c].tag == "th").unwrap_or(false);
        let (tag, name, styles, attrs): (&str, &str, &[(&str, &str)], &[(&str, &str)]) = if header { ("th", "Header cell", HEAD, &[("scope", "col")]) } else { ("td", "Cell", CELL, &[]) };
        let text = if header { format!("Column {}", width + 1) } else { String::new() };
        let cell = add_node(site, if header { "head" } else { "cell" }, tag, name, &text, styles, attrs);
        if let Some(neighbour) = neighbour { let copied = site.nodes[&neighbour].styles.clone(); site.nodes.get_mut(&cell).unwrap().styles = copied; }
        let position = cells.get(index).and_then(|c| site.nodes[&row].children.iter().position(|x| x == c)).unwrap_or(site.nodes[&row].children.len());
        site.nodes.get_mut(&row).unwrap().children.insert(position, cell);
    }
    Ok(())
}

fn col_remove(site: &mut Site, params: &Value) -> Result<(), String> {
    let table = string(params, "table")?.to_string();
    table_of(site, &table)?;
    let rows = uniform(site, &table)?;
    let width = rows[0].1.len();
    if width < 2 { return Err("a table needs at least one column".into()); }
    let index = uint(params, "index", u64::MAX, 0, u64::MAX - 1)? as usize;
    if index >= width { return Err("column index is out of range".into()); }
    for (row, cells) in rows { remove_subtree(site, &row, &cells[index])?; }
    Ok(())
}

fn collection_mut<'a>(site: &'a mut Site, params: &Value) -> Result<&'a mut formweb_model::Collection, String> {
    let id = string(params, "collection")?;
    site.collections.get_mut(id).ok_or_else(|| "unknown collection".into())
}

fn reorder(site: &mut Site, params: &Value) -> Result<(), String> {
    let ids: Vec<String> = params.get("ids").and_then(Value::as_array).ok_or("ids must be an array")?.iter().map(|v| v.as_str().map(String::from).ok_or("ids must be text")).collect::<Result<_, _>>()?;
    let collection = collection_mut(site, params)?;
    let mut sorted = ids.clone();
    sorted.sort();
    let mut existing: Vec<String> = collection.items.iter().map(|i| i.id.clone()).collect();
    existing.sort();
    if sorted != existing { return Err("ids must list every item of the collection exactly once".into()); }
    let mut by_id: BTreeMap<String, formweb_model::Item> = collection.items.drain(..).map(|i| (i.id.clone(), i)).collect();
    collection.items = ids.iter().filter_map(|id| by_id.remove(id)).collect();
    Ok(())
}

fn move_item(site: &mut Site, params: &Value) -> Result<(), String> {
    let id = string(params, "id")?.to_string();
    let index = uint(params, "index", 0, 0, 10000)? as usize;
    let collection = collection_mut(site, params)?;
    let from = collection.items.iter().position(|i| i.id == id).ok_or("unknown CMS item")?;
    let item = collection.items.remove(from);
    if index > collection.items.len() { return Err("index is outside the collection".into()); }
    collection.items.insert(index, item);
    Ok(())
}

fn folder(site: &mut Site, params: &Value) -> Result<(), String> {
    let id = string(params, "id")?.to_string();
    let remove = params.get("remove").and_then(Value::as_bool).unwrap_or(false);
    let group = cms_group(site)?;
    let folders = group.entry("folders").or_insert_with(|| json!({})).as_object_mut().ok_or("folders must be an object")?;
    if remove { folders.remove(&id).ok_or("unknown folder")?; return Ok(()); }
    let entry = folders.entry(id).or_insert_with(|| json!({"name": "", "collections": []}));
    if let Some(name) = params.get("name") { entry["name"] = name.clone(); }
    if let Some(collections) = params.get("collections") {
        entry["collections"] = collections.clone();
        let members: Vec<String> = collections.as_array().ok_or("collections must be an array")?.iter().filter_map(|v| v.as_str().map(String::from)).collect();
        let own = params.get("id").and_then(Value::as_str).unwrap_or("").to_string();
        for value in folders.iter_mut().filter(|(k, _)| **k != own).map(|(_, v)| v) {
            if let Some(list) = value.get_mut("collections").and_then(Value::as_array_mut) { list.retain(|c| !c.as_str().map(|c| members.iter().any(|m| m == c)).unwrap_or(false)); }
        }
    }
    Ok(())
}

fn list_patch(site: &mut Site, params: &Value) -> Result<(), String> {
    let node = string(params, "node")?.to_string();
    if !site.nodes.contains_key(&node) { return Err("unknown node".into()); }
    let patch = object(params, "patch")?;
    let fallback = site.nodes[&node].binding.as_ref().filter(|b| b.field.is_none()).map(|b| b.collection.clone());
    let group = cms_group(site)?;
    let lists = group.entry("lists").or_insert_with(|| json!({})).as_object_mut().ok_or("lists must be an object")?;
    let entry = lists.entry(node).or_insert_with(|| json!({}));
    let map = entry.as_object_mut().ok_or("list config must be an object")?;
    for (key, value) in patch { if value.is_null() { map.remove(key); } else { map.insert(key.clone(), value.clone()); } }
    if !map.contains_key("collection") {
        match fallback { Some(collection) => { map.insert("collection".into(), json!(collection)); } None => return Err("list needs a collection".into()) }
    }
    Ok(())
}

fn slider_create(site: &mut Site, params: &Value) -> Result<(), String> {
    let parent = string(params, "parent")?.to_string();
    guard_structure(site, &[&parent])?;
    let collection_id = string(params, "collection")?.to_string();
    let collection = site.collections.get(&collection_id).ok_or("unknown collection")?.clone();
    if site.nodes.get(&parent).map(|n| formweb_model::void_tag(&n.tag)) != Some(false) { return Err("slider needs a container parent".into()); }
    let image = collection.fields.iter().find(|f| f.kind == "image").map(|f| f.name.clone());
    let texts: Vec<String> = collection.fields.iter().filter(|f| f.kind == "text").map(|f| f.name.clone()).collect();
    let card = add_node(site, "slide", "article", "Slide", "", &[("display", "flex"), ("flex-direction", "column"), ("gap", "12px"), ("padding", "24px"), ("background", "#e3e7d9"), ("border-radius", "12px"), ("min-height", "220px")], &[]);
    site.nodes.get_mut(&card).unwrap().binding = Some(Binding { collection: collection_id.clone(), field: None });
    let mut children = vec![];
    if let Some(field) = image {
        let node = add_node(site, "slide-image", "img", "Slide image", "", &[("width", "100%"), ("height", "180px"), ("object-fit", "cover"), ("border-radius", "8px")], &[("alt", "")]);
        site.nodes.get_mut(&node).unwrap().binding = Some(Binding { collection: collection_id.clone(), field: Some(field) });
        children.push(node);
    }
    for (index, field) in texts.iter().take(2).enumerate() {
        let (tag, name, styles): (&str, &str, &[(&str, &str)]) = if index == 0 { ("h3", "Slide title", &[("margin", "0"), ("font-size", "22px")]) } else { ("p", "Slide text", &[("margin", "0"), ("line-height", "1.6")]) };
        let node = add_node(site, "slide-text", tag, name, "", styles, &[]);
        site.nodes.get_mut(&node).unwrap().binding = Some(Binding { collection: collection_id.clone(), field: Some(field.clone()) });
        children.push(node);
    }
    site.nodes.get_mut(&card).unwrap().children = children;
    let index = params.get("index").map(|v| v.as_u64().ok_or("index must be a nonnegative integer")).transpose()?.map(|v| v as usize);
    insert_child(site, &parent, card.clone(), index)?;
    let per_view = uint(params, "perView", 1, 1, 6)?;
    let label = format!("{} slider", collection.name);
    let config = json!({"collection": collection_id, "slider": {"perView": per_view, "arrows": true, "dots": true, "autoplay": false, "interval": 5000, "loop": true, "label": label, "gap": "16px"}});
    let group = cms_group(site)?;
    group.entry("lists").or_insert_with(|| json!({})).as_object_mut().ok_or("lists must be an object")?.insert(card, config);
    Ok(())
}

fn layout_convert(site: &mut Site, params: &Value) -> Result<(), String> {
    let id = string(params, "id")?.to_string();
    let mode = string(params, "mode")?.to_string();
    if !["flex", "grid"].contains(&mode.as_str()) { return Err("mode must be flex or grid".into()); }
    let gap = params.get("gap").and_then(Value::as_str).map(String::from).or_else(|| site.settings.get("layoutGap").cloned()).unwrap_or_else(|| "16px".into());
    let padding = params.get("padding").and_then(Value::as_str).map(String::from).or_else(|| site.settings.get("layoutPadding").cloned());
    let columns = uint(params, "columns", site.settings.get("layoutColumns").and_then(|v| v.parse().ok()).unwrap_or(3), 1, 12)?;
    let direction = params.get("direction").and_then(Value::as_str).unwrap_or("row").to_string();
    if !["row", "column"].contains(&direction.as_str()) { return Err("direction must be row or column".into()); }
    let node = site.nodes.get_mut(&id).ok_or("unknown node")?;
    if node.component_source_id.is_some() { return Err("linked instance layout cannot be changed; detach first".into()); }
    if formweb_model::void_tag(&node.tag) { return Err("void elements cannot hold a layout".into()); }
    node.styles.insert("display".into(), mode.clone());
    node.styles.insert("gap".into(), gap);
    if mode == "grid" {
        node.styles.insert("grid-template-columns".into(), format!("repeat({columns}, 1fr)"));
        node.styles.remove("flex-direction");
    } else {
        node.styles.insert("flex-direction".into(), direction);
        node.styles.remove("grid-template-columns");
    }
    if let Some(padding) = padding { if !node.styles.contains_key("padding") { node.styles.insert("padding".into(), padding); } }
    Ok(())
}

fn form_steps(site: &mut Site, params: &Value) -> Result<(), String> {
    let form = string(params, "form")?.to_string();
    guard_structure(site, &[&form])?;
    if site.nodes.get(&form).map(|n| n.tag == "form") != Some(true) { return Err("target must be a form element".into()); }
    let steps = params.get("steps").and_then(Value::as_array).ok_or("steps must be an array")?;
    let existing: Vec<String> = site.nodes[&form].children.iter().filter(|c| site.nodes[*c].attrs.contains_key("data-fw-step")).cloned().collect();
    if steps.is_empty() {
        for step in existing {
            let inner = site.nodes[&step].children.clone();
            let children = &mut site.nodes.get_mut(&form).unwrap().children;
            let at = children.iter().position(|c| *c == step).unwrap();
            children.splice(at..=at, inner);
            site.nodes.remove(&step);
        }
        return Ok(());
    }
    if !existing.is_empty() { return Err("form already has steps; send an empty steps list first".into()); }
    if steps.len() > 12 { return Err("a form can have at most 12 steps".into()); }
    let mut taken = std::collections::BTreeSet::new();
    let mut groups = vec![];
    for step in steps {
        let nodes: Vec<String> = step.get("nodes").and_then(Value::as_array).ok_or("each step needs a nodes array")?.iter().map(|v| v.as_str().map(String::from).ok_or("step nodes must be ids")).collect::<Result<_, _>>()?;
        if nodes.is_empty() { return Err("a step needs at least one node".into()); }
        for id in &nodes { if !site.nodes[&form].children.contains(id) || !taken.insert(id.clone()) { return Err("step nodes must be unique direct children of the form".into()); } }
        let title = step.get("title").and_then(Value::as_str).unwrap_or("").to_string();
        if title.len() > 120 { return Err("step title is too long".into()); }
        groups.push((nodes, title));
    }
    for (index, (nodes, title)) in groups.into_iter().enumerate() {
        let number = (index + 1).to_string();
        let mut attrs = vec![("data-fw-step", number.as_str())];
        if !title.is_empty() { attrs.push(("data-fw-step-title", title.as_str())); }
        let container = add_node(site, "step", "div", &format!("Step {number}"), "", &[("display", "flex"), ("flex-direction", "column"), ("gap", "12px")], &attrs);
        let children = &mut site.nodes.get_mut(&form).unwrap().children;
        let at = children.iter().position(|c| nodes.contains(c)).unwrap();
        children.retain(|c| !nodes.contains(c));
        children.insert(at.min(children.len()), container.clone());
        site.nodes.get_mut(&container).unwrap().children = nodes;
    }
    Ok(())
}

fn signed_length(value: &str) -> bool {
    let number = value.strip_suffix("px").or_else(|| value.strip_suffix("em")).or_else(|| value.strip_suffix("rem")).or_else(|| value.strip_suffix('%'));
    number.and_then(|n| n.parse::<f64>().ok()).map(f64::is_finite).unwrap_or(false)
}

fn script(site: &mut Site, params: &Value) -> Result<(), String> {
    let id = string(params, "id")?.to_string();
    let mode = params.get("mode").and_then(Value::as_str).unwrap_or("keep").to_string();
    if !["super", "sub", "none", "keep"].contains(&mode.as_str()) { return Err("mode must be super, sub, none or keep".into()); }
    let node = site.nodes.get_mut(&id).ok_or("unknown node")?;
    if mode != "keep" {
        if node.component_source_id.is_some() { return Err("linked instance tag cannot be changed; detach first".into()); }
        if !["span", "sup", "sub"].contains(&node.tag.as_str()) { return Err("superscript and subscript apply to inline span, sup or sub elements".into()); }
        node.tag = match mode.as_str() { "super" => "sup", "sub" => "sub", _ => "span" }.into();
        node.styles.remove("font-variant-position");
        if mode == "none" { for key in ["vertical-align", "line-height"] { node.styles.remove(key); } node.styles.remove("font-size"); }
        else { node.styles.entry("font-size".into()).or_insert_with(|| "0.75em".into()); node.styles.insert("line-height".into(), "0".into()); node.styles.remove("vertical-align"); }
    }
    match params.get("shift") {
        None => {}
        Some(Value::Null) => { node.styles.remove("vertical-align"); }
        Some(value) => {
            let shift = value.as_str().ok_or("shift must be text such as -0.2em")?;
            if !signed_length(shift) { return Err("shift must be a signed px, em, rem or % length".into()); }
            node.styles.insert("vertical-align".into(), shift.into());
            if node.tag == "span" && !node.styles.contains_key("display") { node.styles.insert("display".into(), "inline-block".into()); }
        }
    }
    if params.get("trueGlyphs").and_then(Value::as_bool) == Some(true) && node.tag != "span" { node.styles.insert("font-variant-position".into(), if node.tag == "sup" { "super" } else { "sub" }.into()); }
    Ok(())
}

pub fn apply(site: &mut Site, command: &str, params: &Value) -> Result<(), String> {
    match command {
        "table.insert" => table_insert(site, params),
        "table.row.add" => row_add(site, params),
        "table.row.remove" => row_remove(site, params),
        "table.col.add" => col_add(site, params),
        "table.col.remove" => col_remove(site, params),
        "cms.reorder" => reorder(site, params),
        "cms.move" => move_item(site, params),
        "cms.folder" => folder(site, params),
        "cms.list" => list_patch(site, params),
        "slider.create" => slider_create(site, params),
        "layout.convert" => layout_convert(site, params),
        "text.script" => script(site, params),
        "form.steps" => form_steps(site, params),
        _ => Err(format!("unknown command {command}")),
    }
}

fn parse_color(site: &Site, value: &str, depth: usize) -> Option<(f64, f64, f64)> {
    let value = value.trim();
    if depth > 4 { return None; }
    if let Some(name) = value.strip_prefix("var(--").and_then(|v| v.strip_suffix(')')) {
        let token = site.tokens.get(name).or_else(|| site.tokens.get(&format!("--{name}")))?;
        return parse_color(site, token, depth + 1);
    }
    if let Some(hex) = value.strip_prefix('#') {
        let expanded = match hex.len() { 3 => hex.chars().flat_map(|c| [c, c]).collect::<String>(), 6 | 8 => hex[..6].to_string(), _ => return None };
        let n = u32::from_str_radix(&expanded, 16).ok()?;
        return Some((((n >> 16) & 255) as f64, ((n >> 8) & 255) as f64, (n & 255) as f64));
    }
    if let Some(inner) = value.strip_prefix("rgb(").or_else(|| value.strip_prefix("rgba(")).and_then(|v| v.strip_suffix(')')) {
        let parts: Vec<f64> = inner.split([',', ' ', '/']).filter(|p| !p.is_empty()).take(3).filter_map(|p| p.trim_end_matches('%').parse().ok()).collect();
        return if parts.len() == 3 { Some((parts[0], parts[1], parts[2])) } else { None };
    }
    match value { "white" => Some((255.0, 255.0, 255.0)), "black" => Some((0.0, 0.0, 0.0)), _ => None }
}

fn luminance((r, g, b): (f64, f64, f64)) -> f64 {
    let channel = |c: f64| { let c = c / 255.0; if c <= 0.03928 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) } };
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

pub fn contrast(a: (f64, f64, f64), b: (f64, f64, f64)) -> f64 {
    let (x, y) = (luminance(a), luminance(b));
    (x.max(y) + 0.05) / (x.min(y) + 0.05)
}

fn has_content(site: &Site, id: &str, bound: &BTreeMap<&str, ()>) -> bool {
    let mut pending = vec![id.to_string()];
    while let Some(current) = pending.pop() {
        let Some(node) = site.nodes.get(&current) else { continue };
        if !node.text.trim().is_empty() || node.binding.as_ref().map(|b| b.field.is_some()).unwrap_or(false) || bound.contains_key(current.as_str()) { return true; }
        if current != id && (node.attrs.get("aria-label").map(|v| !v.trim().is_empty()).unwrap_or(false)) { return true; }
        if node.tag == "img" && node.attrs.get("alt").map(|v| !v.trim().is_empty()).unwrap_or(false) { return true; }
        pending.extend(node.children.iter().cloned());
    }
    false
}

pub fn audit(site: &Site, issues: &mut Vec<Value>) {
    let mut parents: BTreeMap<&str, &str> = BTreeMap::new();
    for node in site.nodes.values() { for child in &node.children { parents.insert(child.as_str(), node.id.as_str()); } }
    let bound: BTreeMap<&str, ()> = site.extensions.get("cms").and_then(|v| v.get("bindings")).and_then(Value::as_object).map(|m| m.keys().map(|k| (k.as_str(), ())).collect()).unwrap_or_default();
    for node in site.nodes.values() {
        let named = |n: &formweb_model::Node| ["aria-label", "title"].iter().any(|k| n.attrs.get(*k).map(|v| !v.trim().is_empty()).unwrap_or(false)) || n.attrs.contains_key("aria-labelledby");
        if node.tag == "a" && node.attrs.get("href").map(|h| !h.is_empty() && h != "#").unwrap_or(false) && !named(node) && !has_content(site, &node.id, &bound) { issues.push(json!({"severity":"error","code":"a11y.link-empty","node":node.id,"message":"Link has no text, image alt text or accessible name"})); }
        if node.tag == "button" && !named(node) && !has_content(site, &node.id, &bound) { issues.push(json!({"severity":"error","code":"a11y.button-empty","node":node.id,"message":"Button has no text or accessible name"})); }
        if node.tag == "svg" {
            let labelled = named(node) || node.attrs.get("aria-hidden").map(String::as_str) == Some("true") || ["presentation", "none"].contains(&node.attrs.get("role").map(String::as_str).unwrap_or(""));
            if node.attrs.get("role").map(String::as_str) == Some("img") && !named(node) { issues.push(json!({"severity":"warning","code":"a11y.svg-title","node":node.id,"message":"Meaningful SVG (role img) needs an aria-label or title"})); }
            else if !labelled { issues.push(json!({"severity":"info","code":"a11y.svg-decorative","node":node.id,"message":"SVG without a label is hidden from assistive technology on export; add an aria-label and role img if it carries meaning"})); }
        }
        if node.tag == "table" {
            let rows = rows_of(site, &node.id);
            let has_header = rows.iter().any(|(row, _)| cells_of(site, row).iter().any(|c| site.nodes[c].tag == "th"));
            if !has_header { issues.push(json!({"severity":"warning","code":"a11y.table-header","node":node.id,"message":"Table needs header cells (th) so screen readers can announce columns"})); }
            if !site.nodes[&node.id].children.iter().any(|c| site.nodes[c].tag == "caption") && node.attrs.get("aria-label").is_none() { issues.push(json!({"severity":"info","code":"a11y.table-caption","node":node.id,"message":"Give the table a caption or aria-label"})); }
        }
        if node.text.trim().is_empty() { continue; }
        let size = node.styles.get("font-size").and_then(|v| v.strip_suffix("px")).and_then(|v| v.parse::<f64>().ok()).unwrap_or(16.0);
        let bold = node.styles.get("font-weight").map(|v| v == "bold" || v.parse::<u32>().map(|n| n >= 700).unwrap_or(false)).unwrap_or(false);
        let required = if size >= 24.0 || (bold && size >= 18.66) { 3.0 } else { 4.5 };
        let mut foreground = None;
        let mut background = None;
        let mut cursor = Some(node.id.as_str());
        let mut hops = 0;
        while let Some(id) = cursor {
            hops += 1;
            if hops > 120 { break; }
            let current = &site.nodes[id];
            if foreground.is_none() { if let Some(color) = current.styles.get("color") { foreground = parse_color(site, color, 0).or(Some((-1.0, 0.0, 0.0))); } }
            if background.is_none() {
                for key in ["background-color", "background"] {
                    if let Some(color) = current.styles.get(key) { background = parse_color(site, color, 0).or(Some((-1.0, 0.0, 0.0))); break; }
                }
            }
            if foreground.is_some() && background.is_some() { break; }
            cursor = parents.get(id).copied();
        }
        if let (Some(fg), Some(bg)) = (foreground, background) {
            if fg.0 >= 0.0 && bg.0 >= 0.0 {
                let ratio = contrast(fg, bg);
                if ratio < required { issues.push(json!({"severity":"warning","code":"a11y.contrast","node":node.id,"message":format!("Text contrast {ratio:.2}:1 is below the {required}:1 minimum")})); }
            }
        }
    }
    for page in &site.pages {
        let mut previous = 0usize;
        let mut stack = vec![page.root.as_str()];
        while let Some(id) = stack.pop() {
            let Some(node) = site.nodes.get(id) else { continue };
            if let Some(level) = node.tag.strip_prefix('h').and_then(|n| n.parse::<usize>().ok()).filter(|n| (1..=6).contains(n) && node.tag.len() == 2) {
                if previous > 0 && level > previous + 1 { issues.push(json!({"severity":"warning","code":"a11y.heading-order","page":page.id,"node":node.id,"message":format!("Heading jumps from h{previous} to h{level}; do not skip levels")})); }
                previous = level;
            }
            for child in node.children.iter().rev() { stack.push(child.as_str()); }
        }
    }
}
