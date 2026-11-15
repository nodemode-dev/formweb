use crate::{identifier, locale_code, safe_css_value, safe_style, safe_url, slug, validate_collection, Site};
use serde_json::{Map, Value};
use std::collections::BTreeSet;

pub fn object(value: &Value) -> Result<&Map<String, Value>, String> { value.as_object().ok_or_else(||"extension value must be an object".into()) }
pub(crate) fn keys(value: &Value, allowed: &[&str]) -> Result<(), String> {
    if object(value)?.keys().any(|k|!allowed.contains(&k.as_str())) { return Err("unknown extension field".into()); }
    Ok(())
}
pub(crate) fn string<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> { value.get(key).and_then(Value::as_str).ok_or_else(||format!("{key} must be a string")) }
fn text(value: &Value, key: &str, max: usize) -> Result<(), String> { if value.get(key).map(|v|v.as_str().map(|s|s.len()<=max).unwrap_or(false)).unwrap_or(true) { Ok(()) } else { Err(format!("invalid {key}")) } }
fn boolean(value: &Value, key: &str) -> Result<(), String> { if value.get(key).map(Value::is_boolean).unwrap_or(true) { Ok(()) } else { Err(format!("{key} must be boolean")) } }
fn number(value: &Value, key: &str, max: u64) -> Result<(), String> { if value.get(key).map(|v|v.as_u64().map(|n|n<=max).unwrap_or(false)).unwrap_or(true) { Ok(()) } else { Err(format!("invalid {key}")) } }
pub(crate) fn node(site: &Site, id: &str) -> Result<(), String> { if site.nodes.contains_key(id) { Ok(()) } else { Err(format!("extension references unknown node {id}")) } }
fn page(site: &Site, id: &str) -> Result<(), String> { if site.pages.iter().any(|p|p.id==id) { Ok(()) } else { Err(format!("extension references unknown page {id}")) } }
fn styles(value: &Value) -> Result<(), String> {
    for (k,v) in object(value)? { if !v.as_str().map(|v|safe_style(k,v)).unwrap_or(false) { return Err(format!("unsafe extension style {k}")); } }
    Ok(())
}
pub(crate) fn maps<'a>(value: &'a Value, key: &str) -> Result<Vec<(&'a String, &'a Value)>, String> { value.get(key).map(|v|object(v).map(|m|m.iter().collect())).unwrap_or_else(||Ok(vec![])) }
fn safe(value: &Value, key: &str) -> Result<(), String> { if value.get(key).map(|v|v.as_str().map(safe_url).unwrap_or(false)).unwrap_or(true) { Ok(()) } else { Err(format!("unsafe {key}")) } }
pub fn typed_value(kind: &str, value: &Value) -> bool {
    match kind {
        "number" => value.as_f64().map(f64::is_finite).unwrap_or(false),
        "boolean" => value.is_boolean(),
        "url" => value.as_str().map(safe_url).unwrap_or(false),
        "color" => value.as_str().map(|s|safe_css_value(s) && ((s.starts_with('#') && [4,5,7,9].contains(&s.len()) && s[1..].bytes().all(|c|c.is_ascii_hexdigit())) || ["transparent","currentColor","black","white","red","green","blue","orange","purple","gray","grey"].contains(&s) || ["rgb(","rgba(","hsl(","hsla("].iter().any(|p|s.starts_with(p)&&s.ends_with(')')))).unwrap_or(false),
        "length" => value.as_str().map(|s|safe_css_value(s) && (s=="0" || ["px","rem","em","%","vh","vw","vmin","vmax","ch"].iter().any(|u|s.strip_suffix(u).and_then(|n|n.parse::<f64>().ok()).map(f64::is_finite).unwrap_or(false)))).unwrap_or(false),
        "text" => value.as_str().map(|s|s.len()<=100000).unwrap_or(false),
        _ => false,
    }
}
pub fn subtree(site: &Site, root: &str) -> BTreeSet<String> {
    let mut ids = BTreeSet::new(); let mut pending = vec![root.to_string()];
    while let Some(id)=pending.pop() { if ids.insert(id.clone()) { if let Some(n)=site.nodes.get(&id) { pending.extend(n.children.iter().cloned()); } } }
    ids
}
pub fn slot_nodes(site: &Site, root: &str, source: &str) -> Option<Vec<String>> {
    let component = site.nodes.get(root)?.component_id.as_ref()?;
    let group = site.extensions.get("components")?;
    let slots = group.get("definitions")?.get(component)?.get("slots")?.as_object()?;
    for (name,slot) in slots { if slot.get("target")?.as_str()?==source { return group.get("instances")?.get(root)?.get("slots")?.get(name)?.as_array().map(|v|v.iter().filter_map(Value::as_str).map(String::from).collect()); } }
    None
}
pub fn step_title(value: &str) -> Result<(), String> {
    let count = value.chars().count();
    if count == 0 || count > 60 { return Err("step title must be 1 to 60 characters".into()); }
    if value != value.trim() || value.contains("  ") { return Err("step title cannot start or end with a space or repeat spaces".into()); }
    if value.chars().any(|c| c.is_control() || matches!(c, '<' | '>' | '&' | '"' | '\u{2028}' | '\u{2029}')) { return Err("step title cannot contain control characters or the characters < > & \"".into()); }
    Ok(())
}
fn step_titles(site: &Site) -> Result<(), String> {
    for node in site.nodes.values() {
        if let Some(title) = node.attrs.get("data-fw-step-title") {
            if !node.attrs.contains_key("data-fw-step") { return Err("a step title needs a step".into()); }
            step_title(title)?;
        }
    }
    Ok(())
}
pub fn validate_extensions(site: &Site) -> Result<(), String> {
    if serde_json::to_vec(&site.extensions).map_err(|e|e.to_string())?.len()>4*1024*1024 { return Err("extensions exceed 4 MiB".into()); }
    step_titles(site)?;
    for collection in site.collections.values() {
        for field in collection.fields.iter().filter(|f|f.collection.is_some()) {
            let target=site.collections.get(field.collection.as_ref().unwrap()).ok_or("unknown reference collection")?;
            for item in &collection.items {
                let values:Vec<&str>=match item.values.get(&field.name) { Some(Value::String(id))=>vec![id],Some(Value::Array(ids))=>ids.iter().filter_map(Value::as_str).collect(),_=>vec![] };
                if values.iter().any(|id|!target.items.iter().any(|item|&item.id==id)) { return Err(format!("missing relation target in {}",field.name)); }
            }
        }
    }
    for (group,value) in &site.extensions {
        match group.as_str() {
            "design"=>design(site,value)?, "components"=>components(site,value)?, "libraries"=>libraries(site,value)?,
            "cms"=>cms(site,value)?, "localization"=>localization(site,value)?, "seo"=>seo(site,value)?,
            "behaviors"=>behaviors(site,value)?, "motion"=>crate::motion::validate(site,value)?, "forms"=>forms(site,value)?, "integrations"=>integrations(site,value)?, "code"=>code(site,value)?, "variables"=>crate::variables::validate(site,value)?,
            _=>return Err(format!("unknown extension group {group}")),
        }
    }
    Ok(())
}
pub fn digest(value:&str)->String { use sha2::{Digest,Sha256};Sha256::digest(value.as_bytes()).iter().map(|byte|format!("{byte:02x}")).collect() }
// Custom head and body code (FW-178): raw HTML written into exported pages, site-wide and per page, each slot capped at 50,000 bytes.
fn custom_code(value:Option<&Value>)->Result<(),String>{let Some(value)=value else{return Ok(())};object(value)?;keys(value,&["head","bodyStart","bodyEnd"])?;for key in ["head","bodyStart","bodyEnd"]{text(value,key,50000)?;}Ok(())}
fn owned_asset(path:&str,extensions:&[&str])->bool{path.strip_prefix("/api/assets/").and_then(|name|name.split_once('.')).map(|(hash,ext)|hash.len()==64&&hash.bytes().all(|c|c.is_ascii_hexdigit())&&extensions.contains(&ext)).unwrap_or(false)}
fn owned_image(path:&str)->bool{owned_asset(path,&["png","jpg","jpeg","webp","gif","svg"])}
fn code_sections(site:&Site,value:&Value)->Result<(),String>{boolean(value,"allowSections")?;let entries=maps(value,"sections")?;
    if !entries.is_empty()&&value.get("allowSections").and_then(Value::as_bool)!=Some(true){return Err("code sections need allowSections".into());}
    for(id,section)in entries{node(site,id)?;if !site.nodes[id].children.is_empty(){return Err("a code section host cannot have children".into());}keys(section,&["enabled","html","css","js","module","poster"])?;boolean(section,"enabled")?;boolean(section,"module")?;text(section,"html",512*1024)?;text(section,"css",256*1024)?;text(section,"js",512*1024)?;
        if let Some(poster)=section.get("poster"){if !poster.as_str().map(owned_image).unwrap_or(false){return Err("code section poster must be an owned image asset".into());}}}
    Ok(())}
fn code(site:&Site,value:&Value)->Result<(),String>{keys(value,&["components","instances","siteCode","pageCode","allowSections","sections"])?;code_sections(site,value)?;custom_code(value.get("siteCode"))?;for(id,data)in maps(value,"pageCode")?{page(site,id)?;custom_code(Some(data))?;}
    for(id,component)in maps(value,"components")?{if !identifier(id){return Err("invalid code component id".into());}keys(component,&["enabled","language","source","sourceDigest","builtDigest","javascript","props","mode","poster"])?;
        if component.get("enabled").and_then(Value::as_bool)!=Some(true)||!["typescript","javascript"].contains(&string(component,"language")?){return Err("code component requires explicit opt-in and supported language".into());}
        let source=string(component,"source")?;let js=string(component,"javascript")?;
        let page_mode=match component.get("mode"){None=>false,Some(mode)=>match mode.as_str(){Some("isolated")=>false,Some("page")=>true,_=>return Err("code component mode must be isolated or page".into())}};
        if let Some(poster)=component.get("poster"){if !poster.as_str().map(owned_image).unwrap_or(false){return Err("code component poster must be an owned image asset".into());}}
        let(source_cap,js_cap)=if page_mode{(256*1024,512*1024)}else{(128*1024,256*1024)};
        if source.len()>source_cap||js.len()>js_cap||digest(source)!=string(component,"sourceDigest")?||digest(js)!=string(component,"builtDigest")?{return Err("code size or digest mismatch".into());}
        if ["import ","import(","import\n","require(","export *"," from '"].iter().any(|bad|source.contains(bad)){return Err("code components cannot import dependencies".into());}
        for(name,prop)in maps(component,"props")?{if !identifier(name){return Err("invalid code prop name".into());}keys(prop,&["type","required","default"])?;boolean(prop,"required")?;if !["string","number","boolean","json","color","asset"].contains(&string(prop,"type")?){return Err("invalid code prop type".into());}if let Some(default)=prop.get("default"){if !code_prop(string(prop,"type")?,default){return Err("invalid code prop default".into());}}}
    }
    for(id,instance)in maps(value,"instances")?{node(site,id)?;keys(instance,&["component","props"])?;let definition=value.get("components").and_then(|v|v.get(string(instance,"component").ok()?)).ok_or("unknown code component")?;let props=object(instance.get("props").ok_or("code instance props required")?)?;
        for(name,prop)in props{let d=definition.get("props").and_then(|v|v.get(name)).ok_or("unknown code prop")?;if !code_prop(string(d,"type")?,prop){return Err("invalid code prop value".into());}}
        for(name,prop)in maps(definition,"props")?{if prop.get("required").and_then(Value::as_bool)==Some(true)&&!props.contains_key(name)&&prop.get("default").is_none(){return Err("required code prop missing".into());}}
    }Ok(())}
fn code_prop(kind:&str,value:&Value)->bool {match kind{"string"=>value.as_str().map(|v|v.len()<=10000).unwrap_or(false),"number"=>value.is_number(),"boolean"=>value.is_boolean(),"json"=>serde_json::to_vec(value).map(|v|v.len()<=65536).unwrap_or(false),"color"=>value.as_str().map(code_color).unwrap_or(false),"asset"=>value.as_str().map(|v|owned_asset(v,&["png","jpg","jpeg","webp","gif","svg","mp4","webm","woff2"])).unwrap_or(false),_=>false}}
fn code_color(value:&str)->bool{
    if let Some(hex)=value.strip_prefix('#'){return [3,4,6,8].contains(&hex.len())&&hex.bytes().all(|c|c.is_ascii_hexdigit());}
    if let Some(name)=value.strip_prefix("var(--").and_then(|rest|rest.strip_suffix(')')){return identifier(name);}
    ["rgb(","rgba(","hsl(","hsla("].iter().any(|prefix|value.strip_prefix(prefix).and_then(|rest|rest.strip_suffix(')')).map(|inner|!inner.is_empty()&&inner.bytes().all(|c|c.is_ascii_digit()||matches!(c,b','|b' '|b'.'|b'%'|b'/'))).unwrap_or(false))}
fn design_properties(value:&Value)->Result<(),String>{let entries=maps(value,"properties")?;if entries.len()>64{return Err("too many registered properties".into());}
    for(name,property)in entries{if !identifier(name){return Err("invalid registered property name".into());}keys(property,&["syntax","inherits","initial"])?;boolean(property,"inherits")?;let syntax=string(property,"syntax")?;if !["<number>","<integer>","<length>","<percentage>","<length-percentage>","<color>","<angle>","<time>","*"].contains(&syntax){return Err("invalid registered property syntax".into());}
        match property.get("initial"){Some(initial)=>{let initial=initial.as_str().ok_or("initial must be text")?;if initial.len()>200||!safe_css_value(initial)||(["<number>","<integer>"].contains(&syntax)&&initial.parse::<f64>().map(|n|!n.is_finite()).unwrap_or(true)){return Err("invalid registered property initial value".into());}},None=>if syntax!="*"{return Err("registered property needs an initial value".into());}}}
    Ok(())}
fn design_themes(site:&Site,value:&Value)->Result<(),String>{let Some(themes)=value.get("themes")else{return Ok(())};keys(themes,&["default","followSystem","values"])?;boolean(themes,"followSystem")?;if !["dark","light"].contains(&string(themes,"default")?){return Err("theme default must be dark or light".into());}
    for(mode,tokens)in maps(themes,"values")?{if !["dark","light"].contains(&mode.as_str()){return Err("theme modes are dark and light".into());}for(name,token)in object(tokens)?{let bare=name.trim_start_matches("--");if !identifier(bare)||!site.tokens.keys().any(|k|k.trim_start_matches("--")==bare){return Err(format!("theme value {name} is not a site token"));}if !token.as_str().map(safe_css_value).unwrap_or(false){return Err(format!("unsafe theme value {name}"));}}}
    Ok(())}
fn design_fonts(value:&Value)->Result<(),String>{let entries=maps(value,"fonts")?;if entries.len()>16{return Err("too many fonts".into());}
    for(id,font)in entries{if !identifier(id){return Err("invalid font id".into());}keys(font,&["family","src","weight","style","display"])?;let family=string(font,"family")?;if family.trim().is_empty()||family.chars().count()>64||family.chars().any(|c|c.is_control()||matches!(c,'"'|'\''|'{'|'}'|';'|'\\'|'<'|'>'|'@')){return Err("invalid font family".into());}
        let src=string(font,"src")?;let owned=src.strip_prefix("/api/assets/").and_then(|name|name.strip_suffix(".woff2")).map(|hash|hash.len()==64&&hash.bytes().all(|c|c.is_ascii_hexdigit())).unwrap_or(false);if !owned&&!(src.starts_with("https://")&&safe_url(src)&&src.len()<=2048&&!src.contains(['(',')',' '])){return Err("font src must be an owned woff2 asset or an https URL".into());}
        if let Some(weight)=font.get("weight"){let weight=weight.as_str().ok_or("weight must be text")?;let parts:Vec<&str>=weight.split(' ').collect();if parts.is_empty()||parts.len()>2||parts.iter().any(|p|!p.parse::<u32>().map(|n|(1..=1000).contains(&n)).unwrap_or(false)){return Err("invalid font weight".into());}}
        if let Some(style)=font.get("style"){if !style.as_str().map(|s|["normal","italic"].contains(&s)).unwrap_or(false){return Err("invalid font style".into());}}
        if let Some(display)=font.get("display"){if !display.as_str().map(|s|["swap","block","fallback","optional"].contains(&s)).unwrap_or(false){return Err("invalid font display".into());}}}
    Ok(())}
fn design(site:&Site,value:&Value)->Result<(),String> {
    keys(value,&["tokens","textPresets","applications","properties","themes","fonts"])?;
    design_properties(value)?;design_themes(site,value)?;design_fonts(value)?;
    for (name,token) in maps(value,"tokens")? {
        keys(token,&["type","value"])?;
        let kind=string(token,"type")?;let raw=string(token,"value")?;
        let typed=if kind=="number" { raw.parse::<f64>().ok().and_then(serde_json::Number::from_f64).map(Value::Number).unwrap_or(Value::Null) } else { Value::String(raw.into()) };
        if !identifier(name) || !safe_css_value(raw) || !typed_value(kind,&typed) || site.tokens.get(name).map(String::as_str)!=Some(raw) { return Err("typed token differs from its CSS value or type".into()); }
    }
    for (name,preset) in maps(value,"textPresets")? { if !identifier(name) { return Err("invalid text preset id".into()); } keys(preset,&["styles"])?;styles(preset.get("styles").ok_or("text preset needs styles")?)?; }
    for(id,application)in maps(value,"applications")? {node(site,id)?;keys(application,&["preset","overrides"])?;if value.get("textPresets").and_then(|m|m.get(string(application,"preset").ok()?)).is_none(){return Err("unknown applied text preset".into());}for field in application.get("overrides").map(|v|v.as_array().ok_or("preset overrides must be array")).transpose()?.into_iter().flatten(){if !field.as_str().map(|k|safe_style(k,"0")).unwrap_or(false){return Err("invalid text preset override".into());}}}
    Ok(())
}
fn components(site:&Site,value:&Value)->Result<(),String> {
    keys(value,&["definitions","instances"])?;
    for (id,def) in maps(value,"definitions")? {
        let component=site.components.get(id).ok_or("unknown component definition")?;let members=subtree(site,&component.root);
        keys(def,&["props","variants","slots"])?;
        for (name,prop) in maps(def,"props")? {
            keys(prop,&["type","default","target","field"])?;
            if !identifier(name) || !members.contains(string(prop,"target")?) || !typed_value(string(prop,"type")?,prop.get("default").ok_or("prop default required")?) { return Err("invalid component prop".into()); }
            let field=string(prop,"field")?;
            if field!="text" && !field.strip_prefix("styles.").map(|k|safe_style(k,"0")).unwrap_or(false) && !field.strip_prefix("attrs.").map(|k|["href","src","alt","title","aria-label","value","placeholder"].contains(&k)).unwrap_or(false) { return Err("invalid prop target field".into()); }
        }
        for (name,variant) in maps(def,"variants")? {
            if !identifier(name) { return Err("invalid variant id".into()); }keys(variant,&["nodes"])?;
            for (id,patch) in maps(variant,"nodes")? { if !members.contains(id) { return Err("variant outside component".into()); }keys(patch,&["text","attrs","styles"])?;text(patch,"text",100000)?;
                if let Some(v)=patch.get("styles") { styles(v)?; }if let Some(v)=patch.get("attrs") {if object(v)?.keys().any(|key|["id","for","aria-labelledby","aria-describedby"].contains(&key.as_str())){return Err("variant cannot change stable HTML identity or association attributes".into());}let mut n=site.nodes[id].clone();n.attrs=serde_json::from_value(v.clone()).map_err(|e|e.to_string())?;super::validate_node(&n,site)?; }
            }
        }
        for (name,slot) in maps(def,"slots")? { keys(slot,&["target","allowedTags"])?;if !identifier(name)||!members.contains(string(slot,"target")?)||super::void_tag(&site.nodes[string(slot,"target")?].tag) {return Err("invalid component slot".into());}if let Some(tags)=slot.get("allowedTags"){for tag in tags.as_array().ok_or("allowedTags must be array")?{let n=super::blank_node("slot-check",tag.as_str().ok_or("slot tag must be text")?,"","",&[]);super::validate_node(&n,site)?;}} }
    }
    for (id,instance) in maps(value,"instances")? {
        let n=site.nodes.get(id).ok_or("unknown component instance")?;let comp=n.component_id.as_ref().ok_or("instance data needs linked root")?;
        keys(instance,&["props","variant","slots","resetFields"])?;
        for field in instance.get("resetFields").map(|v|v.as_array().ok_or("resetFields must be array")).transpose()?.into_iter().flatten(){if !field.as_str().map(|f|["text","styles","attrs","breakpoints","interactions"].contains(&f)).unwrap_or(false){return Err("invalid reset field".into());}}
        let def=value.get("definitions").and_then(|defs|defs.get(comp)).ok_or("instance data needs a configured definition")?;
        for (name,prop) in maps(instance,"props")? { let definition=def.get("props").and_then(|p|p.get(name)).ok_or("unknown component prop")?;if !typed_value(string(definition,"type")?,prop) {return Err("wrong component prop type".into());} }
        if let Some(variant)=instance.get("variant") { if !variant.is_null() && !variant.as_str().map(|name|def.get("variants").and_then(|v|v.get(name)).is_some()).unwrap_or(false) {return Err("unknown variant".into());} }
        for (name,nodes) in maps(instance,"slots")? { let slot=def.get("slots").and_then(|s|s.get(name)).ok_or("unknown slot")?;let mut unique=BTreeSet::new();for id in nodes.as_array().ok_or("slot nodes must be an array")? {let id=id.as_str().ok_or("slot node id must be text")?;node(site,id)?;if !unique.insert(id){return Err("duplicate slot node".into());}if let Some(tags)=slot.get("allowedTags").and_then(Value::as_array){if !tags.iter().any(|t|t.as_str()==Some(&site.nodes[id].tag)){return Err("slot content tag is not allowed".into());}}} }
    }
    Ok(())
}
fn libraries(current:&Site,value:&Value)->Result<(),String> {
    keys(value,&["packages"])?;
    for (id,package) in maps(value,"packages")? {keys(package,&["name","version","site","components","imported","nodes","tokens","breakpoints"])?;if !identifier(id)||string(package,"version")?.is_empty()||string(package,"version")?.len()>80 {return Err("invalid library pin".into());}text(package,"name",200)?;
        let site:Site=serde_json::from_value(package.get("site").ok_or("library snapshot missing")?.clone()).map_err(|e|e.to_string())?;
        if site.extensions.contains_key("libraries") {return Err("library snapshots cannot embed nested libraries".into());}super::validate(&site)?;
        for id in package.get("components").and_then(Value::as_array).ok_or("library components array required")? {if !id.as_str().map(|id|site.components.contains_key(id)).unwrap_or(false) {return Err("library references missing component".into());}}
        for (source,id) in maps(package,"imported")? {if !site.components.contains_key(source)||!id.as_str().map(|id|current.components.contains_key(id)).unwrap_or(false) {return Err("invalid imported component reference".into());}}
        for(source,id)in maps(package,"nodes")?{if !site.nodes.contains_key(source)||!id.as_str().map(|id|current.nodes.contains_key(id)).unwrap_or(false){return Err("invalid library node provenance".into());}}
        for(source,id)in maps(package,"tokens")?{if !site.tokens.contains_key(source)||!id.as_str().map(|id|current.tokens.contains_key(id)).unwrap_or(false){return Err("invalid library token provenance".into());}}
        for(source,id)in maps(package,"breakpoints")?{if !site.breakpoints.iter().any(|b|b.id==*source)||!id.as_str().map(|id|current.breakpoints.iter().any(|b|b.id==id)).unwrap_or(false){return Err("invalid library breakpoint provenance".into());}}
    }Ok(())
}
pub fn field_exists(site:&Site,collection:&str,path:&str)->bool {
    let mut target=collection;let fields:Vec<_>=path.split('.').collect();
    for (i,name) in fields.iter().enumerate() {
        if ["id","slug","status"].contains(name) {return i+1==fields.len();}
        let Some(field)=site.collections.get(target).and_then(|c|c.fields.iter().find(|f|f.name==*name)) else{return false};
        if i+1==fields.len(){return true;}let Some(next)=field.collection.as_deref() else{return false};target=next;
    }false
}
pub fn field_kind<'a>(site:&'a Site,collection:&str,path:&str)->Option<&'a str>{let mut target=collection;let fields:Vec<_>=path.split('.').collect();for(i,name)in fields.iter().enumerate(){if ["id","slug","status"].contains(name){return (i+1==fields.len()).then_some("text");}let field=site.collections.get(target)?.fields.iter().find(|f|f.name==*name)?;if i+1==fields.len(){return Some(&field.kind);}target=field.collection.as_deref()?;}None}
pub fn field_multiple(site:&Site,collection:&str,path:&str)->bool{let mut target=collection;for name in path.split('.'){let Some(field)=site.collections.get(target).and_then(|c|c.fields.iter().find(|f|f.name==name))else{return false};if field.kind=="references"{return true;}if let Some(next)=field.collection.as_deref(){target=next;}}false}
fn field_value(kind:&str,value:&Value)->bool{match kind{"text"=>value.is_string(),"number"=>value.is_number(),"boolean"=>value.is_boolean(),"url"|"image"=>value.as_str().map(safe_url).unwrap_or(false),"date"=>value.as_str().map(super::valid_date).unwrap_or(false),"reference"=>value.as_str().map(identifier).unwrap_or(false),"references"=>value.as_array().map(|a|a.iter().all(|v|v.as_str().map(identifier).unwrap_or(false))).unwrap_or(false),_=>false}}
fn validate_relations(site:&Site,collection:&crate::Collection)->Result<(),String>{for field in collection.fields.iter().filter(|f|f.collection.is_some()){let target=site.collections.get(field.collection.as_ref().unwrap()).ok_or("unknown reference collection")?;for item in &collection.items{let values:Vec<&str>=match item.values.get(&field.name){Some(Value::String(id))=>vec![id],Some(Value::Array(ids))=>ids.iter().filter_map(Value::as_str).collect(),_=>vec![]};if values.iter().any(|id|!target.items.iter().any(|item|&item.id==id)){return Err("localized relation target is missing".into());}}}Ok(())}
fn cms(site:&Site,value:&Value)->Result<(),String> {
    keys(value,&["bindings","lists","templates","localized","folders"])?;crate::wishlist::validate(site,value)?;
    for (id,binding) in maps(value,"bindings")? {node(site,id)?;keys(binding,&["collection","field","target","item"])?;let collection=string(binding,"collection")?;
        let c=site.collections.get(collection).ok_or("unknown binding collection")?;
        if let Some(field)=binding.get("field") {if !field.as_str().map(|p|field_exists(site,collection,p)).unwrap_or(false){return Err("unknown binding field".into());}}
        let target=string(binding,"target")?;if !["text","src","href"].contains(&target){return Err("unsupported binding target".into());}
        if ["src","href"].contains(&target){let field=string(binding,"field")?;if field_multiple(site,collection,field)||!field_kind(site,collection,field).map(|k|["url","image"].contains(&k)).unwrap_or(false){return Err("URL bindings require a singular URL or image field".into());}if (target=="href"&&site.nodes[id].tag!="a")||(target=="src"&&!["img","video","audio","source"].contains(&site.nodes[id].tag.as_str())){return Err("URL binding target is incompatible with its element".into());}}
        if let Some(item)=binding.get("item"){if !item.as_str().map(|id|c.items.iter().any(|i|i.id==id)).unwrap_or(false){return Err("unknown selected item".into());}}
    }
    for (id,list) in maps(value,"lists")? {
        node(site,id)?;keys(list,&["collection","filter","sort","offset","limit","pageSize","emptyNode","facets","sortOptions","slider"])?;let collection=string(list,"collection")?;if !site.collections.contains_key(collection){return Err("unknown query collection".into());}
        for key in ["offset","limit","pageSize"]{number(list,key,10000)?;}
        if let Some(id)=list.get("emptyNode"){node(site,id.as_str().ok_or("emptyNode must be text")?)?;}
        let filters=list.get("filter").map(|v|v.as_array().ok_or("filter must be array")).transpose()?;if filters.map(|f|f.len()>32).unwrap_or(false){return Err("too many query filters".into());}
        for f in filters.into_iter().flatten(){keys(f,&["field","op","value"])?;let field=string(f,"field")?;let kind=field_kind(site,collection,field).ok_or("unknown filter field")?;let multiple=field_multiple(site,collection,field);let op=string(f,"op")?;let operand=f.get("value").ok_or("filter value required")?;if operand.as_str().map(|v|v.starts_with("{parent.")&&v.ends_with('}')&&identifier(&v[8..v.len()-1].replace('.',"_"))).unwrap_or(false){if !["eq","ne","contains"].contains(&op){return Err("a parent token works with eq, ne or contains".into());}continue;}let matches_type=|value:&Value|if multiple&&kind!="references"{value.as_array().map(|values|values.len()<=100&&values.iter().all(|v|field_value(kind,v))).unwrap_or(false)}else{field_value(kind,value)};
            let valid=match op{"eq"|"ne"=>matches_type(operand),"contains"=>if multiple{field_value(if kind=="references"{"reference"}else{kind},operand)}else{["text","url","image","date"].contains(&kind)&&operand.is_string()},"gt"|"lt"|"gte"|"lte"=>!multiple&&["number","date"].contains(&kind)&&field_value(kind,operand),"in"=>operand.as_array().map(|values|values.len()<=100&&values.iter().all(matches_type)).unwrap_or(false),_=>false};if !valid{return Err("query operator/value does not match field type".into());}
        }
        for s in list.get("sort").map(|v|v.as_array().ok_or("sort must be array")).transpose()?.into_iter().flatten(){keys(s,&["field","direction"])?;if !field_exists(site,collection,string(s,"field")?)||!["asc","desc"].contains(&string(s,"direction")?){return Err("invalid query sort".into());}}
    }
    for (id,template) in maps(value,"templates")? {page(site,id)?;keys(template,&["collection","slug","title","description"])?;let route=string(template,"slug")?;if !site.collections.contains_key(string(template,"collection")?)||!route.contains("{item.slug}")||!slug(&route.replace("{item.slug}","item")){return Err("invalid CMS route template".into());}for k in ["slug","title","description"]{text(template,k,4096)?;}}
    for (collection,items) in maps(value,"localized")? {let c=site.collections.get(collection).ok_or("unknown localized collection")?;let mut localized_collections=std::collections::BTreeMap::new();for (id,locales) in object(items)? {if !c.items.iter().any(|i|&i.id==id){return Err("unknown localized item".into());}for (locale,data) in object(locales)? {if !locale_code(locale){return Err("invalid item locale".into());}keys(data,&["values","slug","status"])?;let localized=localized_collections.entry(locale.clone()).or_insert_with(||c.clone());let item=localized.items.iter_mut().find(|i|&i.id==id).unwrap();for(k,v)in object(data.get("values").ok_or("localized values required")?)?{item.values.insert(k.clone(),v.clone());}if let Some(s)=data.get("slug"){item.slug=s.as_str().ok_or("localized slug must be string")?.into();}if let Some(s)=data.get("status"){item.status=s.as_str().ok_or("localized status must be string")?.into();}}}for localized in localized_collections.values(){validate_collection(localized)?;validate_relations(site,localized)?;}}
    Ok(())
}
fn localization(site:&Site,value:&Value)->Result<(),String>{keys(value,&["allLocales","pageSlugs","assets"])?;boolean(value,"allLocales")?;
    for (id,locales) in maps(value,"pageSlugs")? {page(site,id)?;for(locale,path)in object(locales)?{if !locale_code(locale)||!path.as_str().map(slug).unwrap_or(false){return Err("invalid localized route".into());}}}
    for (id,locales) in maps(value,"assets")? {node(site,id)?;if !["img","video","audio","source"].contains(&site.nodes[id].tag.as_str()){return Err("localized assets need a media element".into());}for(locale,url)in object(locales)?{if !locale_code(locale)||!url.as_str().map(safe_url).unwrap_or(false){return Err("invalid localized asset".into());}}}Ok(())}
fn seo(site:&Site,value:&Value)->Result<(),String>{keys(value,&["pages","robots","redirects"])?;for(id,data)in maps(value,"pages")?{page(site,id)?;keys(data,&["titleTemplate","descriptionTemplate","jsonLd"])?;text(data,"titleTemplate",4096)?;text(data,"descriptionTemplate",10000)?;if let Some(json)=data.get("jsonLd"){object(json)?;if serde_json::to_vec(json).unwrap_or_default().len()>65536{return Err("JSON-LD exceeds 64KiB".into());}}}if let Some(robots)=value.get("robots"){keys(robots,&["allow","disallow"])?;for key in ["allow","disallow"]{for path in robots.get(key).map(|v|v.as_array().ok_or("robots paths must be array")).transpose()?.into_iter().flatten(){if !path.as_str().map(|s|s.starts_with('/')&&!s.contains('\n')&&!s.contains('\r')&&s.len()<=1024).unwrap_or(false){return Err("invalid robots path".into());}}}}
    let redirects=maps(value,"redirects")?;if redirects.len()>1000{return Err("too many redirects".into());}let mut routes=std::collections::BTreeMap::new();for(path,entry)in redirects{let target=if let Some(target)=entry.as_str(){target}else{keys(entry,&["to","status"])?;if !entry.get("status").and_then(Value::as_u64).map(|status|[301,302,307,308].contains(&status)).unwrap_or(false){return Err("redirect status must be 301, 302, 307 or 308".into());}string(entry,"to")?};if !path.starts_with('/')||!slug(path)||!target.starts_with('/')||!slug(target)||path.trim_end_matches('/')==target.trim_end_matches('/'){return Err("invalid local redirect".into());}if routes.insert(path.trim_end_matches('/'),target.trim_end_matches('/')).is_some(){return Err("duplicate normalized redirect path".into());}}
    for path in routes.keys(){let mut seen=BTreeSet::new();let mut next=*path;while let Some(target)=routes.get(next){if !seen.insert(next){return Err("redirect cycle".into());}next=target;}}
    Ok(())}
fn conditions(value:&Value)->Result<(),String>{let conditions=value.as_array().ok_or("conditions must be array")?;if conditions.len()>32{return Err("too many conditions".into());}for c in conditions{keys(c,&["source","key","op","value"])?;let op=string(c,"op")?;if !["query","session"].contains(&string(c,"source")?)||!identifier(string(c,"key")?)||!["eq","ne","exists","contains"].contains(&op){return Err("invalid condition".into());}text(c,"value",1024)?;if op!="exists"&&c.get("value").and_then(Value::as_str).is_none(){return Err("condition value required".into());}}Ok(())}
fn easing(value:&Value)->Result<(),String>{if let Some(easing)=value.get("easing"){let s=easing.as_str().ok_or("easing must be text")?;if ["linear","ease","ease-in","ease-out","ease-in-out"].contains(&s){return Ok(());}let values=s.strip_prefix("cubic-bezier(").and_then(|s|s.strip_suffix(')')).ok_or("invalid easing")?.split(',').map(|v|v.trim().parse::<f64>()).collect::<Result<Vec<_>,_>>().map_err(|_|"invalid easing")?;if values.len()!=4||values.iter().any(|v|!v.is_finite())||!(0.0..=1.0).contains(&values[0])||!(0.0..=1.0).contains(&values[2]){return Err("invalid easing".into());}}Ok(())}
fn behaviors(site:&Site,value:&Value)->Result<(),String>{keys(value,&["nodes","timelines","overlays"])?;
    for(id,timeline)in maps(value,"timelines")?{if !identifier(id){return Err("invalid timeline id".into());}keys(timeline,&["tracks","repeat"])?;number(timeline,"repeat",100)?;if timeline.get("repeat").and_then(Value::as_u64)==Some(0){return Err("timeline repeat must be positive".into());}let tracks=timeline.get("tracks").and_then(Value::as_array).ok_or("timeline tracks required")?;if tracks.is_empty()||tracks.len()>100{return Err("timeline needs 1 to 100 tracks".into());}for track in tracks{keys(track,&["node","keyframes","duration","delay","at","easing"])?;node(site,string(track,"node")?)?;if track.get("duration").and_then(Value::as_u64).is_none(){return Err("timeline duration required".into());}for key in ["duration","delay","at"]{number(track,key,60000)?;}easing(track)?;let frames=track.get("keyframes").and_then(Value::as_array).ok_or("keyframes required")?;if frames.len()<2||frames.len()>100{return Err("timeline needs 2 to 100 keyframes".into());}for frame in frames{styles(frame)?;}}}
    for(id,overlay)in maps(value,"overlays")?{if !identifier(id){return Err("invalid overlay id".into());}keys(overlay,&["node","label","dismissible","initial","sessionKey"])?;node(site,string(overlay,"node")?)?;if string(overlay,"label")?.is_empty(){return Err("overlay label required".into());}text(overlay,"label",200)?;text(overlay,"sessionKey",128)?;if overlay.get("sessionKey").and_then(Value::as_str)==Some(""){return Err("sessionKey cannot be empty".into());}for k in ["dismissible","initial"]{boolean(overlay,k)?;}}
    for(id,data)in maps(value,"nodes")?{node(site,id)?;keys(data,&["states","actions","conditions"])?;if let Some(states)=data.get("states"){keys(states,&["hover","focus","press"])?;for s in object(states)?.values(){styles(s)?;}}if let Some(c)=data.get("conditions"){conditions(c)?;}
        let actions=data.get("actions").map(|v|v.as_array().ok_or("actions must be array")).transpose()?;if actions.map(|a|a.len()>100).unwrap_or(false){return Err("too many behavior actions".into());}
        for a in actions.into_iter().flatten(){keys(a,&["trigger","action","target","variant","timeline","overlay","className","url","duration","easing","once","conditions","event","experiment"])?;let action=string(a,"action")?;if !["click","hover","press","scroll","load"].contains(&string(a,"trigger")?)||!["toggle-class","navigate","fade-in","variant","timeline","overlay-open","overlay-close","analytics-event"].contains(&action){return Err("invalid behavior action".into());}number(a,"duration",60000)?;boolean(a,"once")?;easing(a)?;safe(a,"url")?;let target=a.get("target").map(|v|v.as_str().ok_or("target must be node id")).transpose()?.unwrap_or(id);node(site,target)?;if let Some(c)=a.get("conditions"){conditions(c)?;}
            for key in ["timeline","overlay"]{if let Some(reference)=a.get(key){let group=if key=="timeline"{"timelines"}else{"overlays"};if !reference.as_str().map(|id|value.get(group).and_then(|g|g.get(id)).is_some()).unwrap_or(false){return Err(format!("unknown {key}"));}}}
            match action{"navigate"=>{string(a,"url")?;},"toggle-class"=>{if !identifier(string(a,"className")?){return Err("invalid className".into());}},"timeline"=>{string(a,"timeline")?;},"overlay-open"|"overlay-close"=>{string(a,"overlay")?;},"variant"=>{let component=site.nodes[target].component_id.as_ref().ok_or("variant action needs linked component root")?;let name=string(a,"variant")?;if site.extensions.get("components").and_then(|g|g.get("definitions")).and_then(|d|d.get(component)).and_then(|d|d.get("variants")).and_then(|v|v.get(name)).is_none(){return Err("variant action references unknown variant".into());}},"analytics-event"=>{let event=string(a,"event")?;if !identifier(event)||event.len()>128{return Err("invalid analytics event".into());}if let Some(experiment)=a.get("experiment"){let experiment=experiment.as_str().ok_or("experiment must be text")?;if site.extensions.get("integrations").and_then(|g|g.get("experiments")).and_then(|e|e.get(experiment)).and_then(|e|e.get("event")).and_then(Value::as_str)!=Some(event){return Err("analytics event must match configured experiment goal".into());}}},_=>{}}
        }
    }Ok(())}
fn forms(site:&Site,value:&Value)->Result<(),String>{keys(value,&["forms"])?;for(id,data)in maps(value,"forms")?{node(site,id)?;if site.nodes[id].tag!="form"{return Err("form configuration needs form node".into());}keys(data,&["successRedirect","successMessage","errorMessage","tracking","constraints"])?;safe(data,"successRedirect")?;for k in ["successMessage","errorMessage"]{text(data,k,4096)?;}
    let members=subtree(site,id);let mut fields=std::collections::BTreeMap::new();for member in members{let n=&site.nodes[&member];if ["input","select","textarea"].contains(&n.tag.as_str())&&!n.attrs.contains_key("disabled"){if let Some(name)=n.attrs.get("name"){fields.insert(name.clone(),n);}}}
    for(field,query)in maps(data,"tracking")?{if !identifier(field)||!query.as_str().map(identifier).unwrap_or(false){return Err("invalid tracking field".into());}if let Some(control)=fields.get(field){if control.tag!="input"||control.attrs.get("type").map(String::as_str)!=Some("hidden"){return Err("tracking names may only match hidden inputs".into());}}}
    for(field,constraint)in maps(data,"constraints")?{if !identifier(field)||!fields.contains_key(field){return Err("constraint must reference an enabled form field".into());}keys(constraint,&["required","pattern","min","max","minLength","maxLength","preset","accept","maxSize"])?;crate::wishlist::constraint(constraint)?;boolean(constraint,"required")?;text(constraint,"pattern",256)?;if let Some(pattern)=constraint.get("pattern").and_then(Value::as_str){if pattern.contains('\n')||pattern.contains('\r')||pattern.contains("(?")||pattern.contains("\\1")||pattern.contains("\\2")||pattern.contains("++")||pattern.contains("**")||pattern.contains("+)")||pattern.contains("*)"){return Err("unsupported or unsafe form pattern".into());}}for k in ["minLength","maxLength"]{number(constraint,k,100000)?;}for k in ["min","max"]{if constraint.get(k).map(|v|!v.is_number()).unwrap_or(false){return Err("numeric constraint required".into());}}if let(Some(min),Some(max))=(constraint.get("min").and_then(Value::as_f64),constraint.get("max").and_then(Value::as_f64)){if min>max{return Err("minimum exceeds maximum".into());}}if let(Some(min),Some(max))=(constraint.get("minLength").and_then(Value::as_u64),constraint.get("maxLength").and_then(Value::as_u64)){if min>max{return Err("minimum length exceeds maximum".into());}}}
}Ok(())}
fn integrations(site:&Site,value:&Value)->Result<(),String>{keys(value,&["endpointBase","widgets","experiments","gates"])?;safe(value,"endpointBase")?;if let Some(base)=value.get("endpointBase").and_then(Value::as_str){let authority=base.split("://").nth(1).unwrap_or("").split(['/', '?', '#']).next().unwrap_or("");let host=authority.split(':').next().unwrap_or("");if base.len()>2048||authority.is_empty()||base.contains('@')||!(base.starts_with("https://")||(base.starts_with("http://")&&["127.0.0.1","localhost"].contains(&host))){return Err("provider endpoint must be HTTPS or exact loopback".into());}}
    let widgets=maps(value,"widgets")?;if widgets.len()>256{return Err("too many integration widgets".into());}for(id,widget)in widgets{node(site,id)?;keys(widget,&["type","source","product","group","field"])?;if !["fetch","product","cart","checkout","member-login","member-gate","analytics-consent"].contains(&string(widget,"type")?){return Err("invalid integration widget".into());}for k in ["source","product","group","field"]{text(widget,k,128)?;}}
    let experiments=maps(value,"experiments")?;if experiments.len()>32{return Err("too many experiments".into());}for(id,experiment)in experiments{if !identifier(id){return Err("invalid experiment id".into());}keys(experiment,&["variants","event"])?;if !identifier(string(experiment,"event")?){return Err("experiment goal event required".into());}let variants=experiment.get("variants").and_then(Value::as_array).ok_or("experiment variants required")?;if !(2..=8).contains(&variants.len()){return Err("experiment needs 2 to 8 variants".into());}let mut unique=BTreeSet::new();for variant in variants{keys(variant,&["id","weight"])?;if !identifier(string(variant,"id")?)||!unique.insert(string(variant,"id")?)||!variant.get("weight").and_then(Value::as_f64).map(|n|n>0.0&&n.is_finite()).unwrap_or(false){return Err("invalid experiment variant".into());}}}
    let gates=value.get("gates").map(|v|v.as_array().ok_or("gates must be array")).transpose()?;if gates.map(|g|g.len()>128).unwrap_or(false){return Err("too many route gates".into());}let mut routes=BTreeSet::new();for gate in gates.into_iter().flatten(){keys(gate,&["route","groups"])?;let route=string(gate,"route")?;if !route.starts_with('/')||!slug(route)||!routes.insert(route.trim_end_matches('/')){return Err("invalid or duplicate gate route".into());}let groups=gate.get("groups").and_then(Value::as_array).ok_or("gate groups required")?;if groups.is_empty()||groups.len()>16||groups.iter().any(|g|!g.as_str().map(|g|identifier(g)&&g.len()<=64).unwrap_or(false)){return Err("invalid gate groups".into());}}
    Ok(())}
