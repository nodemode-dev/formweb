use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub type Strings = BTreeMap<String, String>;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Site {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub pages: Vec<Page>,
    pub nodes: BTreeMap<String, Node>,
    #[serde(default)]
    pub tokens: Strings,
    pub breakpoints: Vec<Breakpoint>,
    #[serde(default)]
    pub components: BTreeMap<String, Component>,
    #[serde(default)]
    pub collections: BTreeMap<String, Collection>,
    #[serde(default)]
    pub locales: BTreeMap<String, Strings>,
    pub default_locale: String,
    #[serde(default)]
    pub settings: Strings,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Page {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub root: String,
    pub seo: Seo,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Seo {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub noindex: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Node {
    pub id: String,
    pub tag: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub children: Vec<String>,
    #[serde(default)]
    pub attrs: Strings,
    #[serde(default)]
    pub styles: Strings,
    #[serde(default)]
    pub breakpoints: BTreeMap<String, Strings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub component_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub component_source_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub overrides: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub binding: Option<Binding>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub interactions: Vec<Interaction>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub collection: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Interaction {
    pub trigger: String,
    pub action: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub class_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Breakpoint {
    pub id: String,
    pub name: String,
    pub max_width: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Component {
    pub id: String,
    pub name: String,
    pub root: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub fields: Vec<Field>,
    #[serde(default)]
    pub items: Vec<Item>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Field {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub required: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Item {
    pub id: String,
    pub slug: String,
    pub values: BTreeMap<String, Value>,
    pub status: String,
}

pub fn identifier(value: &str) -> bool {
    !value.is_empty() && value.len() <= 96 && value.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

pub fn locale_code(value: &str) -> bool {
    !value.is_empty() && value.len() <= 24 && value.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
}

pub fn slug(value: &str) -> bool {
    value.len() <= 240 && !value.contains("..") && !value.contains("//") && value.bytes().all(|c| c.is_ascii_alphanumeric() || b"/-_".contains(&c))
}

pub fn safe_url(value: &str) -> bool {
    if value.trim() != value || value.len() > 4096 || value.starts_with("//") || value.chars().any(|c| c.is_control() || matches!(c, '\\' | '<' | '>' | '"' | '\'')) {
        return false;
    }
    let lower = value.to_ascii_lowercase();
    if lower.starts_with("https://") || lower.starts_with("http://") {
        return !value[lower.find("://").unwrap() + 3..].is_empty();
    }
    if lower.starts_with("mailto:") || lower.starts_with("tel:") {
        return true;
    }
    !value.split(['/', '?', '#']).next().unwrap_or("").contains(':')
}

pub fn safe_css_value(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    value.len() <= 4096 && !value.chars().any(|c| c.is_control() || matches!(c, ';' | '{' | '}' | '<' | '>' | '\\' | '@'))
        && !["url(", "expression", "javascript:", "-moz-binding", "behavior:", "/*", "*/"].iter().any(|bad| lower.contains(bad))
}

pub fn safe_style(name: &str, value: &str) -> bool {
    const PROPERTIES: &[&str] = &[
        "display", "position", "top", "right", "bottom", "left", "inset", "z-index", "width", "height", "min-width", "max-width", "min-height", "max-height", "margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "padding", "padding-top", "padding-right", "padding-bottom", "padding-left", "gap", "row-gap", "column-gap", "grid-template-columns", "grid-template-rows", "grid-column", "grid-row", "grid-auto-flow", "align-items", "align-self", "align-content", "justify-content", "justify-items", "justify-self", "flex", "flex-grow", "flex-shrink", "flex-basis", "flex-direction", "flex-wrap", "order", "background", "background-color", "background-image", "color", "opacity", "border", "border-color", "border-width", "border-style", "border-radius", "border-top", "border-bottom", "border-left", "border-right", "box-shadow", "box-sizing", "font", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-transform", "text-decoration", "text-wrap", "white-space", "word-break", "overflow", "overflow-x", "overflow-y", "object-fit", "object-position", "aspect-ratio", "transform", "transform-origin", "transition", "filter", "backdrop-filter", "cursor", "list-style", "outline", "outline-offset", "visibility", "vertical-align", "content", "scroll-margin-top", "pointer-events"
    ];
    let valid_name = PROPERTIES.contains(&name) || (name.starts_with("--") && identifier(&name[2..]));
    valid_name && safe_css_value(value)
}

pub fn void_tag(tag: &str) -> bool {
    ["img", "input", "br", "hr", "source", "wbr"].contains(&tag)
}

pub fn validate(site: &Site) -> Result<(), String> {
    if site.schema_version != 1 { return Err("unsupported schemaVersion".into()); }
    if !identifier(&site.id) || site.name.len() > 1000 { return Err("invalid site identity".into()); }
    if site.nodes.len() > 10000 || site.pages.is_empty() || site.pages.len() > 200 { return Err("site must contain 1 to 200 pages and at most 10000 nodes".into()); }
    if !locale_code(&site.default_locale) { return Err("invalid defaultLocale".into()); }
    let mut page_ids = BTreeSet::new();
    let mut slugs = BTreeSet::new();
    let mut roots = BTreeSet::new();
    for page in &site.pages {
        if !identifier(&page.id) || !page_ids.insert(&page.id) || !slug(&page.slug) || !slugs.insert(page.slug.trim_matches('/').to_string()) || !roots.insert(&page.root) { return Err("invalid or duplicate page id, slug or root".into()); }
        if !site.nodes.contains_key(&page.root) { return Err(format!("page root {} is missing", page.root)); }
    }
    let mut breakpoint_ids = BTreeSet::new();
    for bp in &site.breakpoints {
        if !identifier(&bp.id) || !breakpoint_ids.insert(&bp.id) || bp.max_width == 0 || bp.max_width > 100000 { return Err("invalid breakpoint".into()); }
    }
    if site.breakpoints.is_empty() { return Err("at least one breakpoint is required".into()); }
    for (name, value) in &site.tokens {
        if !identifier(name.trim_start_matches("--")) || !safe_css_value(value) { return Err(format!("unsafe token {name}")); }
    }
    let mut parents = BTreeMap::new();
    for (key, node) in &site.nodes {
        if key != &node.id || !identifier(key) { return Err("invalid node identity".into()); }
        validate_node(node, site)?;
        let mut unique = BTreeSet::new();
        for child in &node.children {
            if !site.nodes.contains_key(child) || !unique.insert(child) || parents.insert(child.clone(), key.clone()).is_some() { return Err(format!("missing or multiply parented child {child}")); }
        }
    }
    for root in &roots {
        if parents.contains_key(*root) { return Err("a page root cannot have a parent".into()); }
    }
    let mut visited = BTreeSet::new();
    for root in &roots { walk(site, root, &mut BTreeSet::new(), &mut visited, 0)?; }
    if visited.len() != site.nodes.len() { return Err("every node must belong to a page tree".into()); }
    for (id, component) in &site.components {
        if id != &component.id || !identifier(id) || !site.nodes.contains_key(&component.root) { return Err("invalid component reference".into()); }
        if site.nodes[&component.root].component_source_id.is_some() { return Err("component source cannot be an instance".into()); }
    }
    let instance_roots = instance_roots(site);
    let attr_maps = component_attr_maps(site);
    for node in site.nodes.values() {
        if let Some(source_id) = &node.component_source_id {
            let source = &site.nodes[source_id];
            if let Some(component) = &node.component_id {
                if site.components[component].root != *source_id { return Err("instance root must link to its component root".into()); }
            } else {
                let parent = parents.get(&node.id).and_then(|id| site.nodes.get(id)).ok_or("linked child has no parent")?;
                if parent.component_source_id.is_none() { return Err("linked child must belong to a linked instance".into()); }
            }
            if node.tag != source.tag || node.binding != source.binding || node.children.len() != source.children.len() || !node.children.iter().zip(&source.children).all(|(child, source_child)| site.nodes[child].component_source_id.as_ref() == Some(source_child)) { return Err("linked instance tree differs from its source".into()); }
            let has_override = |field: &str| node.overrides.iter().any(|value| value == field);
            let instance_root = instance_roots.get(&node.id).ok_or("linked node needs an instance root")?;
            let inherited_attrs = linked_attrs(source, &attr_maps[instance_root]);
            if (!has_override("text") && node.text != source.text) || (!has_override("styles") && node.styles != source.styles) || (!has_override("attrs") && node.attrs != inherited_attrs) || (!has_override("breakpoints") && node.breakpoints != source.breakpoints) || (!has_override("interactions") && node.interactions != source.interactions) { return Err("linked instance changes need explicit overrides".into()); }
        } else if node.component_id.is_some() || !node.overrides.is_empty() { return Err("instance metadata needs componentSourceId".into()); }
    }
    for (id, collection) in &site.collections {
        if id != &collection.id || !identifier(id) { return Err("invalid collection identity".into()); }
        validate_collection(collection)?;
    }
    for (locale, translations) in &site.locales {
        if !locale_code(locale) || translations.len() > 20000 || translations.values().any(|s| s.len() > 100000) { return Err("invalid translations".into()); }
    }
    if let Some(base) = site.settings.get("baseUrl") {
        if !safe_url(base) || !(base.starts_with("https://") || base.starts_with("http://")) { return Err("baseUrl must be an http(s) URL".into()); }
    }
    Ok(())
}

pub fn instance_roots(site: &Site) -> BTreeMap<String, String> {
    let mut result = BTreeMap::new();
    let mut pending: Vec<(String, Option<String>)> = site.pages.iter().map(|p|(p.root.clone(), None)).collect();
    while let Some((id, root)) = pending.pop() {
        let node = &site.nodes[&id];
        let root = if node.component_id.is_some() { Some(id.clone()) } else { root };
        if node.component_source_id.is_some() {
            if let Some(root) = &root { result.insert(id.clone(), root.clone()); }
        }
        for child in &node.children { pending.push((child.clone(), root.clone())); }
    }
    result
}

pub fn component_attr_maps(site: &Site) -> BTreeMap<String, Strings> {
    let mut result = BTreeMap::new();
    for node in site.nodes.values().filter(|n|n.component_id.is_some()) {
        let component = &site.components[node.component_id.as_ref().unwrap()];
        let mut ids = Strings::new();
        let mut pending = vec![component.root.clone()];
        while let Some(id) = pending.pop() {
            let source = &site.nodes[&id];
            if let Some(html_id) = source.attrs.get("id") { ids.insert(html_id.clone(), format!("{html_id}-{}", node.id)); }
            pending.extend(source.children.iter().cloned());
        }
        result.insert(node.id.clone(), ids);
    }
    result
}

pub fn linked_attrs(source: &Node, ids: &Strings) -> Strings {
    let mut attrs = source.attrs.clone();
    for name in ["id", "for"] {
        if let Some(value) = attrs.get_mut(name) {
            if let Some(mapped) = ids.get(value) { *value = mapped.clone(); }
        }
    }
    for name in ["aria-labelledby", "aria-describedby"] {
        if let Some(value) = attrs.get_mut(name) { *value = value.split_whitespace().map(|id| ids.get(id).cloned().unwrap_or_else(||id.into())).collect::<Vec<_>>().join(" "); }
    }
    if let Some(href) = attrs.get_mut("href") {
        if let Some(mapped) = href.strip_prefix('#').and_then(|id|ids.get(id)) { *href = format!("#{mapped}"); }
    }
    attrs
}

fn walk(site: &Site, id: &str, path: &mut BTreeSet<String>, visited: &mut BTreeSet<String>, depth: usize) -> Result<(), String> {
    if depth > 100 || !path.insert(id.to_string()) { return Err("tree cycle or nesting exceeds 100".into()); }
    visited.insert(id.to_string());
    for child in &site.nodes[id].children { walk(site, child, path, visited, depth + 1)?; }
    path.remove(id);
    Ok(())
}

fn validate_node(node: &Node, site: &Site) -> Result<(), String> {
    const TAGS: &[&str] = &["div", "main", "section", "article", "header", "footer", "nav", "aside", "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "a", "button", "img", "figure", "figcaption", "ul", "ol", "li", "dl", "dt", "dd", "blockquote", "strong", "em", "small", "b", "i", "br", "hr", "form", "label", "input", "textarea", "select", "option", "fieldset", "legend", "details", "summary", "table", "thead", "tbody", "tr", "th", "td", "caption", "time", "code", "pre", "video", "audio", "source", "wbr"];
    if !TAGS.contains(&node.tag.as_str()) { return Err(format!("unsupported tag {}", node.tag)); }
    if node.text.len() > 100000 || node.name.len() > 1000 || node.attrs.len() > 100 || node.interactions.len() > 20 { return Err("node content exceeds limit".into()); }
    if void_tag(&node.tag) && (!node.children.is_empty() || !node.text.is_empty()) { return Err("void elements cannot contain text or children".into()); }
    for (name, value) in &node.attrs {
        let allowed = ["id", "class", "title", "role", "href", "src", "alt", "target", "rel", "type", "name", "value", "placeholder", "required", "checked", "disabled", "multiple", "selected", "min", "max", "step", "pattern", "minlength", "maxlength", "autocomplete", "for", "method", "action", "enctype", "loading", "width", "height", "tabindex", "open", "datetime", "colspan", "rowspan", "scope", "controls", "muted", "loop", "poster", "preload"].contains(&name.as_str())
            || (name.starts_with("aria-") && identifier(&name[5..])) || (name.starts_with("data-") && identifier(&name[5..]));
        if !allowed || value.len() > 10000 || name.starts_with("on") { return Err(format!("unsupported attribute {name}")); }
        if ["href", "src", "action", "poster"].contains(&name.as_str()) && !safe_url(value) { return Err(format!("unsafe URL on {}", node.id)); }
        if name == "target" && !["_blank", "_self", "_parent", "_top"].contains(&value.as_str()) { return Err("unsupported link target".into()); }
        if name == "method" && !["post", "get"].contains(&value.as_str()) { return Err("form method must be post or get".into()); }
    }
    for (name, value) in &node.styles {
        if !safe_style(name, value) { return Err(format!("unsafe style {name} on {}", node.id)); }
    }
    for (breakpoint, styles) in &node.breakpoints {
        if !site.breakpoints.iter().any(|bp| &bp.id == breakpoint) { return Err(format!("unknown breakpoint {breakpoint}")); }
        for (name, value) in styles {
            if !safe_style(name, value) { return Err(format!("unsafe responsive style {name}")); }
        }
    }
    if let Some(component) = &node.component_id {
        if !site.components.contains_key(component) { return Err("unknown component".into()); }
    }
    if let Some(source) = &node.component_source_id {
        if source == &node.id || !site.nodes.contains_key(source) || site.nodes[source].component_source_id.is_some() { return Err("invalid component source".into()); }
    }
    if node.overrides.iter().any(|v| !["text", "styles", "attrs", "breakpoints", "interactions"].contains(&v.as_str())) { return Err("unsupported component override".into()); }
    if let Some(binding) = &node.binding {
        let collection = site.collections.get(&binding.collection).ok_or("unknown binding collection")?;
        if let Some(field) = &binding.field {
            let definition = collection.fields.iter().find(|f| &f.name == field).ok_or("unknown binding field")?;
            if node.tag == "img" && !["image", "url"].contains(&definition.kind.as_str()) { return Err("image binding needs an image or URL field".into()); }
        }
    }
    for interaction in &node.interactions {
        if !["click", "hover", "scroll"].contains(&interaction.trigger.as_str()) || !["toggle-class", "navigate", "fade-in"].contains(&interaction.action.as_str()) { return Err("unsupported interaction".into()); }
        if interaction.action == "toggle-class" && !interaction.class_name.as_ref().map(|v| identifier(v)).unwrap_or(false) { return Err("toggle-class needs one valid className".into()); }
        if interaction.action == "navigate" && !interaction.url.as_ref().map(|v| safe_url(v)).unwrap_or(false) { return Err("navigate needs a safe URL".into()); }
        if interaction.duration.unwrap_or(300) > 10000 { return Err("interaction duration exceeds 10000ms".into()); }
    }
    Ok(())
}

pub fn validate_collection(collection: &Collection) -> Result<(), String> {
    if collection.fields.len() > 100 || collection.items.len() > 10000 { return Err("collection exceeds limit".into()); }
    let mut names = BTreeSet::new();
    for field in &collection.fields {
        if !identifier(&field.name) || !names.insert(&field.name) || !["text", "number", "boolean", "url", "image", "date"].contains(&field.kind.as_str()) { return Err("invalid collection field".into()); }
    }
    let mut ids = BTreeSet::new();
    let mut slugs = BTreeSet::new();
    for item in &collection.items {
        if !identifier(&item.id) || !ids.insert(&item.id) || item.slug.is_empty() || !slug(&item.slug) || !slugs.insert(&item.slug) || !["published", "draft", "archived"].contains(&item.status.as_str()) { return Err("invalid or duplicate CMS item".into()); }
        if item.values.keys().any(|name| !names.contains(name)) { return Err("CMS item has an unknown field".into()); }
        for field in &collection.fields {
            let value = item.values.get(&field.name);
            if field.required && (value.is_none() || value == Some(&Value::Null) || value.and_then(Value::as_str) == Some("")) { return Err(format!("required field {} is missing", field.name)); }
            if let Some(value) = value.filter(|v| !v.is_null()) {
                let valid = match field.kind.as_str() {
                    "number" => value.is_number(),
                    "boolean" => value.is_boolean(),
                    "url" | "image" => value.as_str().map(safe_url).unwrap_or(false),
                    "date" => value.as_str().map(valid_date).unwrap_or(false),
                    _ => value.as_str().map(|s| s.len() <= 100000).unwrap_or(false),
                };
                if !valid { return Err(format!("invalid type for field {}", field.name)); }
            }
        }
    }
    Ok(())
}

fn valid_date(value: &str) -> bool {
    if value.len() != 10 || !value.bytes().enumerate().all(|(i, c)| if i == 4 || i == 7 { c == b'-' } else { c.is_ascii_digit() }) { return false; }
    let year = value[0..4].parse::<u32>().unwrap_or(0);
    let month = value[5..7].parse::<u32>().unwrap_or(0);
    let day = value[8..10].parse::<u32>().unwrap_or(0);
    let days = match month { 1 | 3 | 5 | 7 | 8 | 10 | 12 => 31, 4 | 6 | 9 | 11 => 30, 2 => if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) { 29 } else { 28 }, _ => 0 };
    year > 0 && day > 0 && day <= days
}

pub fn blank_node(id: &str, tag: &str, name: &str, text: &str, styles: &[(&str, &str)]) -> Node {
    Node { id: id.into(), tag: tag.into(), name: name.into(), text: text.into(), children: vec![], attrs: Strings::new(), styles: styles.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(), breakpoints: BTreeMap::new(), component_id: None, component_source_id: None, overrides: vec![], binding: None, interactions: vec![] }
}

pub fn starter(name: &str) -> Site {
    let mut site = Site {
        schema_version: 1, id: "formweb-site".into(), name: name.into(),
        pages: vec![Page { id: "home".into(), name: "Home".into(), slug: "/".into(), root: "root".into(), seo: Seo { title: "Aster Studio | Spaces for better ideas".into(), description: "Independent design studio creating thoughtful identities and digital experiences.".into(), noindex: false } }],
        nodes: BTreeMap::new(), tokens: [("accent".into(), "#d6f05d".into()), ("ink".into(), "#222820".into()), ("paper".into(), "#f4f3ed".into())].into(),
        breakpoints: vec![Breakpoint { id: "desktop".into(), name: "Desktop".into(), max_width: 100000 }, Breakpoint { id: "tablet".into(), name: "Tablet".into(), max_width: 991 }, Breakpoint { id: "mobile".into(), name: "Mobile".into(), max_width: 767 }],
        components: BTreeMap::new(), collections: BTreeMap::new(), locales: [("en".into(), Strings::new())].into(), default_locale: "en".into(), settings: [("baseUrl".into(), "https://example.com".into())].into(),
    };
    let nodes = vec![
        blank_node("root", "main", "Page", "", &[("background", "var(--paper)"), ("color", "var(--ink)"), ("font-family", "Arial, Helvetica, sans-serif"), ("min-height", "100vh"), ("padding", "0 7%")]),
        blank_node("navigation", "header", "Navigation", "", &[("display", "flex"), ("align-items", "center"), ("justify-content", "space-between"), ("padding", "28px 0"), ("border-bottom", "1px solid #d6d8cc")]),
        blank_node("brand", "a", "Brand", "aster / studio", &[("font-size", "24px"), ("font-weight", "700"), ("letter-spacing", "-1px"), ("color", "inherit"), ("text-decoration", "none")]),
        blank_node("nav", "nav", "Navigation links", "", &[("display", "flex"), ("gap", "28px"), ("font-size", "14px")]),
        blank_node("nav-work", "a", "Work link", "Selected work", &[("color", "inherit"), ("text-decoration", "none")]),
        blank_node("nav-about", "a", "About link", "Our approach", &[("color", "inherit"), ("text-decoration", "none")]),
        blank_node("hero", "section", "Hero", "", &[("display", "grid"), ("grid-template-columns", "1.5fr 1fr"), ("gap", "60px"), ("align-items", "center"), ("padding", "90px 0 84px")]),
        blank_node("hero-copy", "div", "Hero copy", "", &[]),
        blank_node("eyebrow", "p", "Eyebrow", "INDEPENDENT DESIGN STUDIO / EST. 2026", &[("font-size", "11px"), ("letter-spacing", "2px"), ("margin", "0 0 24px"), ("font-weight", "700")]),
        blank_node("headline", "h1", "Headline", "Spaces for\nbetter ideas.", &[("font-size", "clamp(44px, 6.4vw, 88px)"), ("line-height", "0.98"), ("letter-spacing", "-4px"), ("white-space", "pre-line"), ("margin", "0 0 28px"), ("font-weight", "500")]),
        blank_node("description", "p", "Description", "We shape brands and digital experiences with clarity, curiosity, and a little unexpected possibility.", &[("font-size", "17px"), ("line-height", "1.7"), ("max-width", "420px"), ("color", "#626a5d"), ("margin", "0 0 32px")]),
        blank_node("cta", "a", "Primary button", "Start a conversation", &[("display", "inline-flex"), ("background", "var(--ink)"), ("color", "var(--paper)"), ("padding", "16px 24px"), ("border-radius", "30px"), ("text-decoration", "none"), ("font-size", "14px")]),
        blank_node("hero-art", "div", "Studio artwork", "", &[("background", "#dadfd0"), ("border-radius", "180px 180px 12px 12px"), ("min-height", "400px"), ("display", "flex"), ("align-items", "center"), ("justify-content", "center"), ("position", "relative"), ("overflow", "hidden")]),
        blank_node("art-orbit", "div", "Sculptural orbit", "", &[("width", "220px"), ("height", "220px"), ("border", "44px solid #222820"), ("border-radius", "50%"), ("transform", "rotate(-24deg) skew(-12deg)"), ("box-shadow", "26px 34px 0 var(--accent)")]),
        blank_node("art-label", "p", "Artwork caption", "Form follows possibility.", &[("position", "absolute"), ("bottom", "18px"), ("font-size", "11px"), ("letter-spacing", "1px")]),
        blank_node("proof", "section", "Studio principles", "", &[("border-top", "1px solid #d6d8cc"), ("border-bottom", "1px solid #d6d8cc"), ("padding", "28px 0"), ("display", "grid"), ("grid-template-columns", "repeat(3, 1fr)"), ("gap", "24px")]),
        blank_node("proof-1", "p", "Principle one", "01 / Thoughtfully independent", &[("font-size", "13px"), ("margin", "0")]),
        blank_node("proof-2", "p", "Principle two", "02 / Built around your ambition", &[("font-size", "13px"), ("margin", "0")]),
        blank_node("proof-3", "p", "Principle three", "03 / Designed to keep growing", &[("font-size", "13px"), ("margin", "0")]),
        blank_node("work", "section", "Selected work", "", &[("padding", "66px 0")]),
        blank_node("work-title", "h2", "Work heading", "A few things we have shaped.", &[("font-size", "36px"), ("font-weight", "500"), ("letter-spacing", "-1px"), ("margin", "0 0 28px")]),
        blank_node("work-grid", "div", "Projects grid", "", &[("display", "grid"), ("grid-template-columns", "repeat(3, 1fr)"), ("gap", "20px")]),
        blank_node("project-card", "article", "CMS project card", "", &[("padding", "26px"), ("background", "#e3e7d9"), ("border-radius", "12px"), ("min-height", "180px")]),
        blank_node("project-title", "h3", "Project title", "Field Notes", &[("font-size", "24px"), ("font-weight", "500"), ("margin", "0 0 20px")]),
        blank_node("project-summary", "p", "Project summary", "Identity with a quieter kind of confidence.", &[("font-size", "14px"), ("line-height", "1.6"), ("color", "#626a5d")]),
        blank_node("contact", "section", "Contact", "", &[("display", "flex"), ("justify-content", "space-between"), ("align-items", "center"), ("padding", "38px 0"), ("border-top", "1px solid #d6d8cc"), ("gap", "24px")]),
        blank_node("contact-title", "h2", "Contact heading", "Have something in mind?", &[("font-size", "32px"), ("font-weight", "500"), ("letter-spacing", "-1px")]),
        blank_node("contact-link", "a", "Email link", "hello@aster.studio", &[("font-size", "16px"), ("color", "inherit"), ("text-decoration", "underline")]),
        blank_node("footer", "footer", "Footer", "Aster Studio / Thoughtful by design / 2026", &[("font-size", "11px"), ("color", "#626a5d"), ("padding", "24px 0"), ("border-top", "1px solid #d6d8cc")]),
    ];
    for node in nodes { site.nodes.insert(node.id.clone(), node); }
    for (id, children) in [
        ("root", vec!["navigation", "hero", "proof", "work", "contact", "footer"]), ("navigation", vec!["brand", "nav"]), ("nav", vec!["nav-work", "nav-about"]), ("hero", vec!["hero-copy", "hero-art"]), ("hero-copy", vec!["eyebrow", "headline", "description", "cta"]), ("hero-art", vec!["art-orbit", "art-label"]), ("proof", vec!["proof-1", "proof-2", "proof-3"]), ("work", vec!["work-title", "work-grid"]), ("work-grid", vec!["project-card"]), ("project-card", vec!["project-title", "project-summary"]), ("contact", vec!["contact-title", "contact-link"]),
    ] { site.nodes.get_mut(id).unwrap().children = children.into_iter().map(String::from).collect(); }
    for (id, href) in [("brand", "/"), ("nav-work", "#work"), ("nav-about", "#proof"), ("cta", "#contact"), ("contact-link", "mailto:hello@aster.studio")] { site.nodes.get_mut(id).unwrap().attrs.insert("href".into(), href.into()); }
    for id in ["work", "proof", "contact"] { site.nodes.get_mut(id).unwrap().attrs.insert("id".into(), id.into()); }
    site.nodes.get_mut("hero").unwrap().breakpoints.insert("mobile".into(), [("grid-template-columns".into(), "1fr".into()), ("padding".into(), "48px 0".into()), ("gap".into(), "36px".into())].into());
    site.nodes.get_mut("hero-art").unwrap().breakpoints.insert("mobile".into(), [("min-height".into(), "300px".into())].into());
    site.nodes.get_mut("nav").unwrap().breakpoints.insert("mobile".into(), [("display".into(), "none".into())].into());
    for id in ["work-grid", "proof"] { site.nodes.get_mut(id).unwrap().breakpoints.insert("mobile".into(), [("grid-template-columns".into(), "1fr".into())].into()); }
    site.nodes.get_mut("contact").unwrap().breakpoints.insert("mobile".into(), [("flex-direction".into(), "column".into()), ("align-items".into(), "flex-start".into())].into());
    site.collections.insert("projects".into(), Collection { id: "projects".into(), name: "Selected projects".into(), fields: vec![Field { name: "title".into(), kind: "text".into(), required: true }, Field { name: "summary".into(), kind: "text".into(), required: true }], items: [("field-notes", "Field Notes", "An editorial identity with a quieter kind of confidence."), ("common-ground", "Common Ground", "A digital home for ideas that bring people together."), ("open-season", "Open Season", "A growing brand for a fresh perspective on everyday life.")].iter().map(|(id, title, summary)| Item { id: id.to_string(), slug: id.to_string(), values: [("title".into(), Value::String(title.to_string())), ("summary".into(), Value::String(summary.to_string()))].into(), status: "published".into() }).collect() });
    site.nodes.get_mut("project-card").unwrap().binding = Some(Binding { collection: "projects".into(), field: None });
    for (id, field) in [("project-title", "title"), ("project-summary", "summary")] { site.nodes.get_mut(id).unwrap().binding = Some(Binding { collection: "projects".into(), field: Some(field.into()) }); }
    site.components.insert("primary-button".into(), Component { id: "primary-button".into(), name: "Primary button".into(), root: "cta".into() });
    site
}
