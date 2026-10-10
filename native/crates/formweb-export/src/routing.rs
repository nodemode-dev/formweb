use crate::{cms, escape, translation};
use formweb_model::{slug, Item, Page, Site};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub struct Route { pub page: Page, pub locale: String, pub slug: String, pub collection: Option<String>, pub item: Option<Item> }
impl Route {
    pub fn path(&self) -> String { let route = self.slug.trim_matches('/'); if route.is_empty() { "index.html".into() } else { format!("{route}/index.html") } }
    pub fn prefix(&self) -> String { "../".repeat(self.slug.trim_matches('/').split('/').filter(|p| !p.is_empty()).count()) }
    pub fn canonical(&self, base: &str) -> String { let route = self.slug.trim_matches('/'); if route.is_empty() { format!("{}/", base.trim_end_matches('/')) } else { format!("{}/{route}/", base.trim_end_matches('/')) } }
}
pub fn page_slug(site: &Site, page: &Page, locale: &str) -> String {
    site.extensions.get("localization").and_then(|v| v.get("pageSlugs")).and_then(|v| v.get(&page.id)).and_then(|v| v.get(locale)).and_then(Value::as_str).unwrap_or(&page.slug).into()
}
pub fn plan(site: &Site, locale: &str, all: bool) -> Result<Vec<Route>, String> {
    let locales = if all { let mut v: Vec<_> = site.locales.keys().cloned().collect(); if !v.contains(&site.default_locale) { v.push(site.default_locale.clone()); } v } else { vec![locale.into()] };
    let mut result = vec![];
    let mut paths = BTreeSet::new();
    for locale in locales {
        let prefix = if all && locale != site.default_locale { format!("/{locale}") } else { String::new() };
        for page in &site.pages {
            let template = cms::group(site).and_then(|v| v.get("templates")).and_then(|v| v.get(&page.id));
            if let Some(template) = template {
                let collection = template.get("collection").and_then(Value::as_str).ok_or("template collection missing")?;
                for item in cms::published(site, collection, &locale) {
                    let default = format!("{}/{{item.slug}}", page_slug(site, page, &locale).trim_end_matches('/'));
                    let route = cms::interpolate(site, template.get("slug").and_then(Value::as_str).unwrap_or(&default), Some(collection), Some(&item), &locale);
                    let route = format!("{prefix}/{}", route.trim_matches('/'));
                    if !slug(&route) { return Err(format!("invalid CMS route for {}:{}", page.id, item.id)); }
                    let entry = Route { page: page.clone(), locale: locale.clone(), slug: route, collection: Some(collection.into()), item: Some(item) };
                    if !paths.insert(entry.path()) { return Err(format!("duplicate exported route {}", entry.path())); }
                    result.push(entry);
                }
            } else {
                let route = format!("{prefix}/{}", page_slug(site, page, &locale).trim_matches('/'));
                if !slug(&route) { return Err(format!("invalid localized route {}", page.id)); }
                let entry = Route { page: page.clone(), locale: locale.clone(), slug: route, collection: None, item: None };
                if !paths.insert(entry.path()) { return Err(format!("duplicate exported route {}", entry.path())); }
                result.push(entry);
            }
        }
    }
    Ok(result)
}
pub fn links(site: &Site, current: &Route, routes: &[Route]) -> BTreeMap<String, String> {
    let mut result = BTreeMap::new();
    for route in routes.iter().filter(|r| r.locale == current.locale) {
        result.insert(route.slug.trim_matches('/').into(), route.slug.trim_matches('/').into());
        if route.item.is_none() { result.insert(route.page.slug.trim_matches('/').into(), route.slug.trim_matches('/').into()); }
        else if let (Some(collection), Some(item)) = (&route.collection, &route.item) {
            let definition = cms::group(site).and_then(|v| v.get("templates")).and_then(|v| v.get(&route.page.id));
            let base_item = cms::item(site, collection, &item.id, &site.default_locale);
            if let Some(base_item) = base_item {
                let fallback = format!("{}/{{item.slug}}", route.page.slug.trim_end_matches('/'));
                let source = cms::interpolate(site, definition.and_then(|v| v.get("slug")).and_then(Value::as_str).unwrap_or(&fallback), Some(collection), Some(&base_item), &site.default_locale);
                result.insert(source.trim_matches('/').into(), route.slug.trim_matches('/').into());
            }
        }
    }
    result
}
pub fn link(url: &str, prefix: &str, links: &BTreeMap<String, String>) -> String {
    if url.is_empty() || url.starts_with('#') || url.starts_with('?') || url.contains(':') { return url.into(); }
    let split = url.find(['?', '#']).unwrap_or(url.len());
    let route = url[..split].trim_matches('/');
    if let Some(target) = links.get(route) {
        let target = if target.is_empty() { if prefix.is_empty() { "./".into() } else { prefix.into() } } else { format!("{prefix}{target}/") };
        format!("{target}{}", &url[split..])
    } else { url.into() }
}
pub fn metadata(site: &Site, route: &Route) -> (String, String, Option<Value>) {
    let template = cms::group(site).and_then(|v| v.get("templates")).and_then(|v| v.get(&route.page.id));
    let seo = site.extensions.get("seo").and_then(|v| v.get("pages")).and_then(|v| v.get(&route.page.id));
    let title = seo.and_then(|v| v.get("titleTemplate")).and_then(Value::as_str).or_else(|| template.and_then(|v| v.get("title")).and_then(Value::as_str));
    let description = seo.and_then(|v| v.get("descriptionTemplate")).and_then(Value::as_str).or_else(|| template.and_then(|v| v.get("description")).and_then(Value::as_str));
    let translated_title = translation(site, &route.locale, &format!("{}.title", route.page.id), &route.page.seo.title);
    let translated_description = translation(site, &route.locale, &format!("{}.description", route.page.id), &route.page.seo.description);
    let interpolate = |s: &str| cms::interpolate(site, s, route.collection.as_deref(), route.item.as_ref(), &route.locale);
    let title = interpolate(title.unwrap_or(&translated_title));
    let description = interpolate(description.unwrap_or(&translated_description));
    let json_ld = seo.and_then(|v| v.get("jsonLd")).map(|v| interpolate_json(v, &interpolate));
    (title, description, json_ld)
}
fn interpolate_json(value: &Value, interpolate: &impl Fn(&str) -> String) -> Value {
    match value {
        Value::String(s) => Value::String(interpolate(s)),
        Value::Array(values) => Value::Array(values.iter().map(|v| interpolate_json(v, interpolate)).collect()),
        Value::Object(values) => Value::Object(values.iter().map(|(k,v)| (k.clone(), interpolate_json(v, interpolate))).collect()),
        other => other.clone(),
    }
}
pub fn alternates(route: &Route, routes: &[Route], base: &str) -> String {
    let item = route.item.as_ref().map(|i| i.id.as_str());
    routes.iter().filter(|r| r.page.id == route.page.id && r.item.as_ref().map(|i| i.id.as_str()) == item).map(|r| format!("<link rel=\"alternate\" hreflang=\"{}\" href=\"{}\">", escape(&r.locale), escape(&r.canonical(base)))).collect()
}
