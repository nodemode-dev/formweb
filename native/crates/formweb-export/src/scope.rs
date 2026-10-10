use formweb_model::Site;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

fn selected(value: Option<&Value>, ids: &BTreeSet<String>) -> Value {
    Value::Object(value.and_then(Value::as_object).map(|map| map.iter().filter(|(id, _)| ids.contains(*id)).map(|(id, value)| (id.clone(), value.clone())).collect()).unwrap_or_default())
}
fn portable_url(value: &mut Value, prefix: &str, links: &BTreeMap<String,String>) { if let Some(url)=value.as_str(){*value=json!(crate::routing::link(url,prefix,links));} }
fn portable_attrs(attrs: &formweb_model::Strings, prefix: &str, links: &BTreeMap<String,String>) -> Value { let mut attrs=json!(attrs);if let Some(href)=attrs.get_mut("href"){portable_url(href,prefix,links);}attrs }
fn component_data(site:&Site,components:&BTreeSet<String>,ids:&BTreeSet<String>,prefix:&str,links:&BTreeMap<String,String>)->Value {
    let group=site.extensions.get("components");let mut definitions=selected(group.and_then(|v|v.get("definitions")),components);
    if let Some(definitions)=definitions.as_object_mut(){for definition in definitions.values_mut(){if let Some(props)=definition.get_mut("props").and_then(Value::as_object_mut){for prop in props.values_mut(){if prop.get("field").and_then(Value::as_str)==Some("attrs.href"){if let Some(value)=prop.get_mut("default"){portable_url(value,prefix,links);}}}}if let Some(variants)=definition.get_mut("variants").and_then(Value::as_object_mut){for variant in variants.values_mut(){if let Some(nodes)=variant.get_mut("nodes").and_then(Value::as_object_mut){for patch in nodes.values_mut(){if let Some(href)=patch.get_mut("attrs").and_then(|v|v.get_mut("href")){portable_url(href,prefix,links);}}}}}}}
    let mut instances=selected(group.and_then(|v|v.get("instances")),ids);
    if let Some(instances)=instances.as_object_mut(){for(id,instance)in instances{if let Some(props)=instance.get_mut("props").and_then(Value::as_object_mut){let definition=site.nodes.get(id).and_then(|n|n.component_id.as_ref()).and_then(|id|definitions.get(id));for(name,value)in props{if definition.and_then(|v|v.get("props")).and_then(|v|v.get(name)).and_then(|v|v.get("field")).and_then(Value::as_str)==Some("attrs.href"){portable_url(value,prefix,links);}}}}}
    json!({"definitions":definitions,"instances":instances})
}
pub fn configuration(site: &Site, root: &str, records: Vec<Value>, context: Value, links: &BTreeMap<String, String>, prefix: &str) -> Value {
    let mut ids = BTreeSet::new();
    let mut pending = vec![root.to_string()];
    while let Some(id) = pending.pop() { if ids.insert(id.clone()) { if let Some(node) = site.nodes.get(&id) { pending.extend(node.children.iter().cloned()); } } }
    let components: BTreeSet<String> = ids.iter().filter_map(|id| site.nodes.get(id)?.component_id.clone()).collect();
    let mut sources = ids.clone();
    for id in &ids { if let Some(source) = site.nodes.get(id).and_then(|n|n.component_source_id.as_ref()) { sources.insert(source.clone()); } }
    let node_map: BTreeMap<_, _> = site.nodes.iter().filter(|(id, _)|sources.contains(*id)).map(|(id, n)|(id.clone(),json!({"componentId":n.component_id,"componentSourceId":n.component_source_id,"text":n.text,"styles":n.styles,"breakpoints":n.breakpoints,"attrs":portable_attrs(&n.attrs,prefix,links)}))).collect();
    let behaviors = site.extensions.get("behaviors");
    let actions: BTreeSet<String> = records.iter().flat_map(|record| record.get("actions").and_then(Value::as_array).into_iter().flatten()).filter_map(|action|action.get("timeline").and_then(Value::as_str).map(str::to_string)).collect();
    let overlays: Value = Value::Object(behaviors.and_then(|v|v.get("overlays")).and_then(Value::as_object).map(|map|map.iter().filter(|(_,value)|value.get("node").and_then(Value::as_str).map(|id|ids.contains(id)).unwrap_or(false)).map(|(id,v)|(id.clone(),v.clone())).collect()).unwrap_or_default());
    let mut forms = selected(site.extensions.get("forms").and_then(|v|v.get("forms")), &ids);
    if let Some(forms) = forms.as_object_mut() { for specification in forms.values_mut() { if let Some(url) = specification.get("successRedirect").and_then(Value::as_str).map(str::to_string) { specification["successRedirect"] = json!(crate::routing::link(&url, prefix, links)); } } }
    let mut integrations = site.extensions.get("integrations").cloned().unwrap_or_else(||json!({}));
    integrations["widgets"] = selected(integrations.get("widgets"), &ids);
    json!({"records":records,"behaviors":{"nodes":selected(behaviors.and_then(|v|v.get("nodes")),&ids),"timelines":selected(behaviors.and_then(|v|v.get("timelines")),&actions),"overlays":overlays},"forms":{"forms":forms},"components":component_data(site,&components,&ids,prefix,links),"integrations":integrations,"nodes":node_map,"breakpoints":site.breakpoints,"routePrefix":prefix,"context":context})
}
