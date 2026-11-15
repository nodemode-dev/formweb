use super::{apply as base_apply, descendants, fresh_id, parent_of, string};
use formweb_model::{advanced::object, component_attr_maps, instance_roots, linked_attrs, validate, Breakpoint, Collection, Component, Item, Node, Site, Strings};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

fn group<'a>(site:&'a mut Site,name:&str)->&'a mut Value {site.extensions.entry(name.into()).or_insert_with(||json!({}))}
fn set_path(site:&mut Site,group_name:&str,map:&str,id:&str,value:Value)->Result<(),String>{let g=group(site,group_name).as_object_mut().ok_or("group must be object")?;let target=g.entry(map).or_insert_with(||json!({})).as_object_mut().ok_or("extension map must be object")?;target.insert(id.into(),value);Ok(())}
fn component_definition(site:&Site,component:&str)->Value{site.extensions.get("components").and_then(|g|g.get("definitions")).and_then(|m|m.get(component)).cloned().unwrap_or_else(||json!({}))}
fn instance_data(site:&Site,id:&str)->Value{site.extensions.get("components").and_then(|g|g.get("instances")).and_then(|m|m.get(id)).cloned().unwrap_or_else(||json!({}))}
fn component_id(site:&Site,id:&str)->Result<String,String>{site.nodes.get(id).and_then(|n|n.component_id.clone()).ok_or_else(||"command needs a linked component root".into())}
fn set_instance(site:&mut Site,id:&str,value:Value)->Result<(),String>{let component=component_id(site,id)?;if site.extensions.get("components").and_then(|g|g.get("definitions")).and_then(|d|d.get(&component)).is_none(){set_path(site,"components","definitions",&component,json!({}))?;}set_path(site,"components","instances",id,value)}

pub fn before_command(site:&mut Site,command:&str,params:&Value)->Result<(),String>{
    if command=="node.update"{let id=string(params,"id")?;if let Some(styles)=params.get("patch").and_then(|p|p.get("styles")).and_then(Value::as_object){if let Some(application)=site.extensions.get_mut("design").and_then(|g|g.get_mut("applications")).and_then(|m|m.get_mut(id)){let overrides=application.as_object_mut().ok_or("preset application must be object")?.entry("overrides").or_insert_with(||json!([])).as_array_mut().ok_or("preset overrides must be array")?;for key in styles.keys(){let field=json!(key);if !overrides.contains(&field){overrides.push(field);}}}}}
    if command=="token.set"{let name=string(params,"name")?;if let Some(tokens)=site.extensions.get_mut("design").and_then(|g|g.get_mut("tokens")).and_then(Value::as_object_mut){if params.get("value")==Some(&Value::Null){tokens.remove(name);}else if let Some(token)=tokens.get_mut(name){token.as_object_mut().ok_or("typed token must be object")?.insert("value".into(),params.get("value").ok_or("value required")?.clone());}}}
    Ok(())
}
fn release_slots(site:&mut Site,root:&str,data:&Value)->Result<(),String>{let parent=parent_of(site,root).ok_or("instance root has no parent")?;if let Some(slots)=data.get("slots").and_then(Value::as_object){for nodes in slots.values(){for id in nodes.as_array().ok_or("slot nodes must be array")?{let id=id.as_str().ok_or("slot node must be text")?;if let Some(old)=parent_of(site,id){site.nodes.get_mut(&old).unwrap().children.retain(|child|child!=id);}if site.nodes.contains_key(id){site.nodes.get_mut(&parent).unwrap().children.push(id.into());}}}}Ok(())}
pub fn apply(site:&mut Site,command:&str,params:&Value)->Result<(),String>{
    match command {
        "extension.set"=>{let name=string(params,"group")?;site.extensions.insert(name.into(),params.get("value").ok_or("extension value required")?.clone());if name=="design" {if let Some(tokens)=site.extensions[name].get("tokens").and_then(Value::as_object){let values:Vec<_>=tokens.iter().map(|(k,v)|Ok((k.clone(),v.get("value").and_then(Value::as_str).ok_or("token value must be text")?.to_string()))).collect::<Result<_,String>>()?;for(k,v)in values{site.tokens.insert(k,v);}}}}
        "extension.remove"=>{site.extensions.remove(string(params,"group")?).ok_or("unknown extension group")?;}
        "site.replace"=>{let mut replacement:Site=serde_json::from_value(params.get("site").ok_or("site required")?.clone()).map_err(|e|e.to_string())?;replacement.id=site.id.clone();validate(&replacement)?;*site=replacement;}
        "page.duplicate"=>{
            let page=site.pages.iter().find(|p|p.id==string(params,"id").unwrap_or("")).ok_or("unknown page")?.clone();let slug=string(params,"slug")?.to_string();let id=fresh_id(site,"page");let mut map=BTreeMap::new();let root=clone_plain(site,&page.root,&mut map)?;
            let mut duplicate=page.clone();duplicate.id=id.clone();duplicate.root=root;duplicate.slug=slug;duplicate.name=params.get("name").and_then(Value::as_str).map(String::from).unwrap_or_else(||format!("{} copy",page.name));site.pages.push(duplicate);
            let made:BTreeSet<String>=[page.id.clone(),page.root.clone()].into_iter().collect();
            let html=remap_html_ids(site,&map,&id,&uniform(&map,&made))?;duplicate_extensions(site,&map,&page.id,&id,&html,&made)?;
        }
        "node.duplicate"=>{
            let id=string(params,"id")?.to_string();if !site.nodes.contains_key(&id){return Err("unknown node".into());}
            if site.pages.iter().any(|p|p.root==id){return Err("a page root cannot be duplicated; use page.duplicate".into());}
            let linked=|site:&Site,start:&str|{let mut at=Some(start.to_string());while let Some(n)=at{let node=&site.nodes[&n];if node.component_id.is_some()||node.component_source_id.is_some(){return true;}at=parent_of(site,&n);}false};
            if linked(site,&id){return Err("a node inside a linked component instance cannot be duplicated; detach the instance first".into());}
            let from=parent_of(site,&id).ok_or("node has no parent")?;
            let parent=match params.get("parent"){Some(p)=>p.as_str().ok_or("parent must be text")?.to_string(),None=>from.clone()};
            if !site.nodes.contains_key(&parent){return Err("unknown destination parent".into());}
            if linked(site,&parent){return Err("the copy cannot go inside a linked component instance".into());}
            if descendants(site,&id)?.len()>2000{return Err("subtree has more than 2000 nodes; duplicate smaller parts".into());}
            let at=site.nodes[&parent].children.len();
            let index=match params.get("index"){Some(v)=>usize::try_from(v.as_u64().ok_or("index must be a nonnegative integer")?).map_err(|_|"index is out of range")?,None if parent==from=>site.nodes[&parent].children.iter().position(|c|*c==id).map(|i|i+1).unwrap_or(at),None=>at};
            if index>at{return Err("index is outside destination children".into());}
            let mut map=BTreeMap::new();let root=clone_plain(site,&id,&mut map)?;
            site.nodes.get_mut(&parent).unwrap().children.insert(index,root.clone());
            let made=lineage(site,&id);
            let html=remap_html_ids(site,&map,&root,&uniform(&map,&made))?;duplicate_node_entries(site,&map,&root,&html,&made)?;
            formweb_model::advanced::validate_extensions(site)?;
        }
        "node.paste"=>paste_fragment(site,params)?,
        "page.bulk"=>{
            let template=string(params,"template")?.to_string();
            let rows=params.get("rows").and_then(Value::as_array).ok_or("rows must be an array")?;
            if rows.is_empty()||rows.len()>300{return Err("bulk create takes 1 to 300 rows".into());}
            for row in rows{
                let slug=row.get("slug").and_then(Value::as_str).ok_or("every row needs a slug")?;
                let values=row.get("values").and_then(Value::as_object).cloned().unwrap_or_default();
                let fill=|text:&str|->String{let mut out=text.to_string();for(k,v)in &values{if let Some(v)=v.as_str(){out=out.replace(&format!("{{{{{k}}}}}"),v);}}out};
                let name=row.get("name").and_then(Value::as_str).map(String::from).unwrap_or_else(||fill(&site.pages.iter().find(|p|p.id==template).map(|p|p.name.clone()).unwrap_or_default()));
                apply(site,"page.duplicate",&json!({"id":template,"slug":slug,"name":name}))?;
                let page=site.pages.last_mut().ok_or("bulk page missing")?;
                page.seo.title=fill(&page.seo.title);page.seo.description=fill(&page.seo.description);
                let root=page.root.clone();
                let mut stack=vec![root];
                while let Some(id)=stack.pop(){let node=site.nodes.get_mut(&id).ok_or("bulk node missing")?;node.text=fill(&node.text);for value in node.attrs.values_mut(){*value=fill(value);}stack.extend(node.children.clone());}
            }
        }
        "breakpoint.set"=>{let id=string(params,"id")?;let width=params.get("maxWidth").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or("maxWidth must be integer")?;let breakpoint=Breakpoint{id:id.into(),name:string(params,"name")?.into(),max_width:width};if let Some(old)=site.breakpoints.iter_mut().find(|bp|bp.id==id){*old=breakpoint;}else{site.breakpoints.push(breakpoint);}}
        "breakpoint.remove"=>{let id=string(params,"id")?;if !site.breakpoints.iter().any(|bp|bp.id==id){return Err("unknown breakpoint".into());}site.breakpoints.retain(|bp|bp.id!=id);for n in site.nodes.values_mut(){n.breakpoints.remove(id);}}
        "token.define"=>{let name=string(params,"name")?;let value=string(params,"value")?;site.tokens.insert(name.into(),value.into());set_path(site,"design","tokens",name,json!({"type":string(params,"type")?,"value":value}))?;}
        "textpreset.set"=>{let name=string(params,"name")?;let styles=params.get("styles").ok_or("styles required")?;let old=site.extensions.get("design").and_then(|g|g.get("textPresets")).and_then(|p|p.get(name)).and_then(|p|p.get("styles")).and_then(Value::as_object).cloned().unwrap_or_default();let new=object(styles)?;let applications=site.extensions.get("design").and_then(|g|g.get("applications")).and_then(Value::as_object).cloned().unwrap_or_default();for(id,application)in applications{if application.get("preset").and_then(Value::as_str)==Some(name){let removed:serde_json::Map<_,_>=old.keys().filter(|key|!new.contains_key(*key)&&!application.get("overrides").and_then(Value::as_array).map(|a|a.contains(&json!(key))).unwrap_or(false)).map(|key|(key.clone(),Value::Null)).collect();if !removed.is_empty(){base_apply(site,"node.update",&json!({"id":id,"patch":{"styles":removed}}))?;}}}set_path(site,"design","textPresets",name,json!({"styles":styles}))?;}
        "textpreset.apply"=>{let name=string(params,"name")?;let styles=site.extensions.get("design").and_then(|v|v.get("textPresets")).and_then(|v|v.get(name)).and_then(|v|v.get("styles")).ok_or("unknown text preset")?.clone();set_path(site,"design","applications",string(params,"id")?,json!({"preset":name,"overrides":[]}))?;base_apply(site,"node.update",&json!({"id":string(params,"id")?,"patch":{"styles":styles}}))?;}
        "component.detach"=>{let id=string(params,"id")?;component_id(site,id)?;for child in descendants(site,id)?{let n=site.nodes.get_mut(&child).unwrap();n.component_id=None;n.component_source_id=None;n.overrides.clear();}if let Some(map)=site.extensions.get_mut("components").and_then(|v|v.get_mut("instances")).and_then(Value::as_object_mut){map.remove(id);}}
        "component.configure"=>{let id=string(params,"component")?;if !site.components.contains_key(id){return Err("unknown component".into());}let old=component_definition(site,id);let instances:Vec<_>=site.nodes.values().filter(|n|n.component_id.as_deref()==Some(id)).map(|n|n.id.clone()).collect();for root in instances{clear_managed(site,&root,&old,&instance_data(site,&root))?;}set_path(site,"components","definitions",id,params.get("definition").ok_or("definition required")?.clone())?;}
        "component.props"=>{let id=string(params,"id")?;let component=component_id(site,id)?;let definition=component_definition(site,&component);let mut data=instance_data(site,id);clear_managed(site,id,&definition,&data)?;let updates=object(params.get("props").ok_or("props required")?)?;let fields:BTreeSet<_>=updates.keys().filter_map(|name|definition.get("props").and_then(|p|p.get(name)).and_then(|p|p.get("field")).and_then(Value::as_str).map(|f|f.split('.').next().unwrap_or(f).to_string())).collect();if let Some(reset)=data.get_mut("resetFields").and_then(Value::as_array_mut){reset.retain(|field|!field.as_str().map(|f|fields.contains(f)).unwrap_or(false));}let map=data.as_object_mut().ok_or("instance must be object")?.entry("props").or_insert_with(||json!({})).as_object_mut().ok_or("props must be object")?;for(k,v)in updates{if v.is_null(){map.remove(k);}else{map.insert(k.clone(),v.clone());}}set_instance(site,id,data)?;}
        "component.variant"=>{let id=string(params,"id")?;let component=component_id(site,id)?;let definition=component_definition(site,&component);let mut data=instance_data(site,id);clear_managed(site,id,&definition,&data)?;data.as_object_mut().ok_or("instance must be object")?.remove("resetFields");data.as_object_mut().unwrap().insert("variant".into(),params.get("variant").ok_or("variant required")?.clone());set_instance(site,id,data)?;}
        "component.reset"=>{let id=string(params,"id")?;component_id(site,id)?;let fields:Vec<String>=params.get("fields").map(|v|serde_json::from_value(v.clone()).map_err(|e|e.to_string())).transpose()?.unwrap_or_else(||vec!["text".into(),"styles".into(),"attrs".into(),"breakpoints".into(),"interactions".into()]);if fields.iter().any(|f|!["text","styles","attrs","breakpoints","interactions"].contains(&f.as_str())){return Err("invalid reset field".into());}for child in descendants(site,id)?{if let Some(n)=site.nodes.get_mut(&child){n.overrides.retain(|v|!fields.contains(v));}}let mut data=instance_data(site,id);if params.get("fields").is_none(){release_slots(site,id,&data)?;data=json!({});}else{data.as_object_mut().ok_or("invalid instance data")?.insert("resetFields".into(),json!(fields));}set_instance(site,id,data)?;}
        "component.slot"=>{let id=string(params,"id")?;let comp=component_id(site,id)?;let slot=string(params,"slot")?;let def=component_definition(site,&comp);let source=def.get("slots").and_then(|s|s.get(slot)).and_then(|s|s.get("target")).and_then(Value::as_str).ok_or("unknown slot")?.to_string();let target=descendants(site,id)?.into_iter().find(|n|site.nodes[n].component_source_id.as_deref()==Some(&source)).ok_or("slot target missing")?;let nodes:Vec<String>=serde_json::from_value(params.get("nodes").ok_or("slot nodes required")?.clone()).map_err(|e|e.to_string())?;let mut unique=BTreeSet::new();for node in &nodes{if !unique.insert(node)||!site.nodes.contains_key(node)||site.nodes[node].component_source_id.is_some()||site.pages.iter().any(|p|p.root==*node)||descendants(site,node)?.contains(id){return Err("slot content must be independent non-root nodes without cycles".into());}if let Some(parent)=parent_of(site,node){site.nodes.get_mut(&parent).unwrap().children.retain(|c|c!=node);}}
            let mut data=instance_data(site,id);if let Some(previous)=data.get("slots").and_then(|s|s.get(slot)).cloned(){let mut release=json!({"slots":{}});release.get_mut("slots").unwrap().as_object_mut().unwrap().insert(slot.into(),previous);release_slots(site,id,&release)?;for node in &nodes{if let Some(parent)=parent_of(site,node){site.nodes.get_mut(&parent).unwrap().children.retain(|child|child!=node);}}}data.as_object_mut().ok_or("instance must be object")?.entry("slots").or_insert_with(||json!({})).as_object_mut().ok_or("slots must be object")?.insert(slot.into(),json!(nodes));set_instance(site,id,data)?;let _=target;
        }
        "collection.update"=>{let collection=site.collections.get_mut(string(params,"id")?).ok_or("unknown collection")?;for(key,value)in object(params.get("patch").ok_or("patch required")?)?{match key.as_str(){"name"=>collection.name=value.as_str().ok_or("collection name must be text")?.into(),"fields"=>collection.fields=serde_json::from_value(value.clone()).map_err(|e|e.to_string())?,_=>return Err("unknown collection patch field".into())}}}
        "cms.query"=>set_path(site,"cms","lists",string(params,"node")?,params.get("query").ok_or("query required")?.clone())?,
        "cms.binding"=>set_path(site,"cms","bindings",string(params,"node")?,params.get("binding").ok_or("binding required")?.clone())?,
        "cms.localize"=>{let collection=string(params,"collection")?;let item=string(params,"item")?;let locale=string(params,"locale")?;let mut localized=site.extensions.get("cms").and_then(|v|v.get("localized")).cloned().unwrap_or_else(||json!({}));let collection_data=localized.as_object_mut().ok_or("localized map must be object")?.entry(collection).or_insert_with(||json!({}));let locales=collection_data.as_object_mut().ok_or("localized items must be object")?.entry(item).or_insert_with(||json!({}));let mut data=json!({"values":params.get("values").ok_or("localized values required")?});for k in ["slug","status"]{if let Some(v)=params.get(k){data.as_object_mut().unwrap().insert(k.into(),v.clone());}}locales.as_object_mut().ok_or("locales must be object")?.insert(locale.into(),data);group(site,"cms").as_object_mut().ok_or("cms must be object")?.insert("localized".into(),localized);}
        "cms.replace"=>{let id=string(params,"collection")?;let items:Vec<Item>=serde_json::from_value(params.get("items").ok_or("items required")?.clone()).map_err(|e|e.to_string())?;site.collections.get_mut(id).ok_or("unknown collection")?.items=items;}
        "motion.set"=>{let kind=string(params,"kind")?;let id=string(params,"node")?;if !formweb_model::motion::KINDS.contains(&kind){return Err("unknown motion kind".into());}if !site.nodes.contains_key(id){return Err("motion references unknown node".into());}set_path(site,"motion",kind,id,params.get("value").ok_or("motion value required")?.clone())?;formweb_model::motion::validate(site,&site.extensions["motion"])?;}
        "motion.remove"=>{let kind=string(params,"kind")?;let id=string(params,"node")?;if !formweb_model::motion::KINDS.contains(&kind){return Err("unknown motion kind".into());}let group=site.extensions.get_mut("motion").and_then(Value::as_object_mut).ok_or("no motion group")?;let map=group.get_mut(kind).and_then(Value::as_object_mut).ok_or("unknown motion entry")?;map.remove(id).ok_or("unknown motion entry")?;if map.is_empty(){group.remove(kind);}if group.is_empty(){site.extensions.remove("motion");}}
        "design.set"=>{let key=string(params,"key")?;if !["properties","themes","fonts"].contains(&key){return Err("design.set key must be properties, themes or fonts".into());}let value=params.get("value").ok_or("design value required")?.clone();if value.is_null(){if let Some(design)=site.extensions.get_mut("design").and_then(Value::as_object_mut){design.remove(key);}}else{group(site,"design").as_object_mut().ok_or("design must be object")?.insert(key.into(),value);}formweb_model::advanced::validate_extensions(site)?;}
        "motion.track"=>motion_track(site,params)?,
        "variables.set"=>{let kind=string(params,"kind")?;if !VARIABLE_KINDS.contains(&kind){return Err("unknown variables kind".into());}set_path(site,"variables",kind,string(params,"name")?,params.get("value").ok_or("variables value required")?.clone())?;formweb_model::advanced::validate_extensions(site)?;}
        "variables.remove"=>{let kind=string(params,"kind")?;if !VARIABLE_KINDS.contains(&kind){return Err("unknown variables kind".into());}drop_entry(site,"variables",kind,string(params,"name")?)?;formweb_model::advanced::validate_extensions(site)?;}
        "code.instance.set"=>{set_path(site,"code","instances",string(params,"node")?,params.get("value").ok_or("code instance value required")?.clone())?;formweb_model::advanced::validate_extensions(site)?;}
        "code.instance.remove"=>{drop_entry(site,"code","instances",string(params,"node")?)?;formweb_model::advanced::validate_extensions(site)?;}
        "code.section.set"=>{set_path(site,"code","sections",string(params,"node")?,params.get("value").ok_or("code section value required")?.clone())?;formweb_model::advanced::validate_extensions(site)?;}
        "code.section.remove"=>{drop_entry(site,"code","sections",string(params,"node")?)?;formweb_model::advanced::validate_extensions(site)?;}
        "code.sections.allow"=>{let enabled=params.get("enabled").and_then(Value::as_bool).ok_or("enabled must be a boolean")?;group(site,"code").as_object_mut().ok_or("code must be object")?.insert("allowSections".into(),json!(enabled));formweb_model::advanced::validate_extensions(site)?;}
        "library.import"=>library_import(site,params)?,"library.update"=>library_update(site,params)?,
        "library.detach"=>{let id=string(params,"id")?;group(site,"libraries").get_mut("packages").and_then(Value::as_object_mut).ok_or("no library pins")?.remove(id).ok_or("unknown library pin")?;}
        _=>crate::wishlist::apply(site,command,params)?,
    }Ok(())
}

fn clone_plain(site:&mut Site,id:&str,map:&mut BTreeMap<String,String>)->Result<String,String>{let source=site.nodes.get(id).ok_or("missing source node")?.clone();let new=fresh_id(site,"copy");let mut node=source.clone();node.id=new.clone();node.children.clear();map.insert(id.into(),new.clone());site.nodes.insert(new.clone(),node);for child in source.children{let cloned=clone_plain(site,&child,map)?;site.nodes.get_mut(&new).unwrap().children.push(cloned);}Ok(new)}
// The ending a copy added to an HTML id is "-copy-N" (element copies) or "-page-N" (page copies); a copy of a copy swaps that ending for its own instead of stacking another.
// Only an ending that names the copied element or one of its ancestors (`made`) counts as made by a copy; an author's own "x-copy-5" is appended to.
fn copy_base<'a>(text:&'a str,made:&BTreeSet<String>)->Option<&'a str>{let mut parts=text.rsplitn(3,'-');let digits=parts.next()?;let word=parts.next()?;let rest=parts.next()?;(!rest.is_empty()&&!digits.is_empty()&&digits.bytes().all(|b|b.is_ascii_digit())&&(word=="copy"||word=="page")&&made.contains(&format!("{word}-{digits}"))).then_some(rest)}
// The ids that can have made an ending: the node itself and every ancestor above it.
fn lineage(site:&Site,id:&str)->BTreeSet<String>{let mut out=BTreeSet::new();let mut at=Some(id.to_string());while let Some(n)=at{at=parent_of(site,&n);out.insert(n);}out}
fn uniform(map:&BTreeMap<String,String>,made:&BTreeSet<String>)->BTreeMap<String,BTreeSet<String>>{map.keys().map(|k|(k.clone(),made.clone())).collect()}
// Behavior timeline and overlay ids carry the same marker in front: "copy-N-<id>".
fn copy_rest<'a>(text:&'a str,made:&BTreeSet<String>)->Option<&'a str>{let mut parts=text.splitn(3,'-');let word=parts.next()?;let digits=parts.next()?;let rest=parts.next()?;(!rest.is_empty()&&!digits.is_empty()&&digits.bytes().all(|b|b.is_ascii_digit())&&(word=="copy"||word=="page")&&made.contains(&format!("{word}-{digits}"))).then_some(rest)}
fn remap_html_ids(site:&mut Site,map:&BTreeMap<String,String>,suffix:&str,made:&BTreeMap<String,BTreeSet<String>>)->Result<Strings,String>{
    let none=BTreeSet::new();
    let roots=instance_roots(site);let attrs=component_attr_maps(site);
    let fresh:BTreeSet<&String>=map.values().collect();
    let mut taken:BTreeSet<String>=site.nodes.iter().filter(|(id,_)|!fresh.contains(id)).filter_map(|(_,n)|n.attrs.get("id").cloned()).collect();
    let mut ids=Strings::new();
    for(old,new)in map{if let Some(html)=site.nodes[old].attrs.get("id"){
        let target=&site.nodes[new];
        let inherited=target.component_source_id.as_ref().filter(|_|!target.overrides.iter().any(|k|k=="attrs")).and_then(|source|site.nodes[source].attrs.get("id")).and_then(|html|roots.get(new).and_then(|root|attrs.get(root)).and_then(|map|map.get(html))).cloned();
        let value=match inherited{Some(value)=>value,None=>{let short=copy_base(html,made.get(old).unwrap_or(&none)).map(|base|format!("{base}-{suffix}")).filter(|short|!taken.contains(short));short.unwrap_or_else(||format!("{html}-{suffix}"))}};
        taken.insert(value.clone());ids.insert(html.clone(),value);
    }}
    for new in map.values(){let mut n=site.nodes[new].clone();n.attrs=linked_attrs(&n,&ids);for interaction in &mut n.interactions{if let Some(href)=interaction.url.as_mut(){if let Some(mapped)=href.strip_prefix('#').and_then(|id|ids.get(id)){*href=format!("#{mapped}");}}}let node=site.nodes.get_mut(new).unwrap();node.attrs=n.attrs;node.interactions=n.interactions;}
    Ok(ids)
}
// Reference values only: object keys are field names and are never renamed, so a node called `stage` keeps the scene's `stage` field.
fn remap_json(value:&mut Value,map:&BTreeMap<String,String>){match value{Value::String(s)=>{if let Some(n)=map.get(s){*s=n.clone();}},Value::Array(a)=>for v in a{remap_json(v,map)},Value::Object(o)=>for v in o.values_mut(){remap_json(v,map)},_=>{}}}
// A component definition is the one place node ids are object keys (variants.<name>.nodes.<source node>), so library import and update rename those keys too.
fn remap_definition(value:&mut Value,map:&BTreeMap<String,String>){remap_json(value,map);if let Some(variants)=value.get_mut("variants").and_then(Value::as_object_mut){for variant in variants.values_mut(){if let Some(nodes)=variant.get_mut("nodes").and_then(Value::as_object_mut){let old=std::mem::take(nodes);for(k,v)in old{nodes.insert(map.get(&k).cloned().unwrap_or(k),v);}}}}}
// The one list of node-keyed extension entries. Page copies, element copies and fragments all read and write it.
const NODE_KEYED:&[(&str,&str)]=&[("cms","bindings"),("cms","lists"),("behaviors","nodes"),("forms","forms"),("code","instances"),("integrations","widgets"),("components","instances"),("design","applications"),("localization","assets"),("motion","reveals"),("motion","scenes"),("motion","loops"),("motion","counters"),("motion","text"),("motion","drag"),("motion","pointer"),("motion","disclosure"),("motion","actions"),("motion","scripts"),("code","sections"),("variables","inputs"),("variables","outputs")];
type Entry=(String,String,String,Value);
// Every entry the given nodes own: the node-keyed entries, plus the timelines and overlays whose tracks or node are among them.
fn collect_entries(site:&Site,ids:&BTreeSet<String>)->Vec<Entry>{
    let mut out=vec![];let behaviors=site.extensions.get("behaviors").cloned().unwrap_or_else(||json!({}));
    for field in ["timelines","overlays"]{let entries=behaviors.get(field).and_then(Value::as_object).cloned().unwrap_or_default();for(id,value)in entries{let owned=if field=="overlays"{value.get("node").and_then(Value::as_str).map(|id|ids.contains(id)).unwrap_or(false)}else{value.get("tracks").and_then(Value::as_array).map(|tracks|tracks.iter().any(|t|t.get("node").and_then(Value::as_str).map(|id|ids.contains(id)).unwrap_or(false))).unwrap_or(false)};if owned{out.push(("behaviors".into(),field.into(),id,value));}}}
    for(group_name,field)in NODE_KEYED{if let Some(entries)=site.extensions.get(*group_name).and_then(|v|v.get(*field)).and_then(Value::as_object){for(id,value)in entries{if ids.contains(id){out.push(((*group_name).into(),(*field).into(),id.clone(),value.clone()));}}}}
    out
}
fn collect_locales(site:&Site,ids:&BTreeSet<String>)->BTreeMap<String,Strings>{site.locales.iter().filter_map(|(locale,translations)|{let own:Strings=translations.iter().filter(|(id,_)|ids.contains(*id)).map(|(k,v)|(k.clone(),v.clone())).collect();(!own.is_empty()).then(||(locale.clone(),own))}).collect()}
fn place_locales(site:&mut Site,locales:&BTreeMap<String,Strings>,map:&BTreeMap<String,String>){for(locale,translations)in site.locales.iter_mut(){if let Some(own)=locales.get(locale){for(old,text)in own{if let Some(new)=map.get(old){translations.insert(new.clone(),text.clone());}}}}}
// Shared by page copies and element copies: every node-keyed entry of the copied nodes gets its own entry under the new id, with node references and behavior ids remapped.
fn duplicate_node_entries(site:&mut Site,map:&BTreeMap<String,String>,prefix:&str,html:&Strings,made:&BTreeSet<String>)->Result<(),String>{
    let ids:BTreeSet<String>=map.keys().cloned().collect();let entries=collect_entries(site,&ids);let locales=collect_locales(site,&ids);
    place_entries(site,&entries,map,prefix,html,made)?;place_locales(site,&locales,map);Ok(())
}
// Writes entries under the new node ids; timelines and overlays become "<prefix>-<id>" and every reference to them follows.
fn place_entries(site:&mut Site,entries:&[Entry],map:&BTreeMap<String,String>,prefix:&str,html:&Strings,made:&BTreeSet<String>)->Result<(),String>{
    let mut refs=map.clone();
    let mut taken:BTreeSet<String>=["timelines","overlays"].iter().filter_map(|f|site.extensions.get("behaviors").and_then(|b|b.get(*f)).and_then(Value::as_object)).flat_map(|m|m.keys().cloned()).collect();
    let own_id=|g:&str,f:&str|g=="behaviors"&&(f=="timelines"||f=="overlays");
    for(group_name,field,id,_)in entries{if own_id(group_name,field){let short=copy_rest(id,made).map(|rest|format!("{prefix}-{rest}")).filter(|short|formweb_model::identifier(short)&&!taken.contains(short));let new=short.unwrap_or_else(||format!("{prefix}-{id}"));if !formweb_model::identifier(&new){return Err("duplicated behavior id exceeds limit".into());}taken.insert(new.clone());refs.insert(id.clone(),new);}}
    for(group_name,field,id,value)in entries{let new=if own_id(group_name,field){refs[id].clone()}else{map.get(id).ok_or("entry names a node outside the copy")?.clone()};let mut value=value.clone();if group_name!="variables"&&field!="sections"{remap_json(&mut value,&refs);}if group_name=="behaviors"&&field=="nodes"{if let Some(actions)=value.get_mut("actions").and_then(Value::as_array_mut){for action in actions{if let Some(url)=action.get_mut("url"){if let Some(mapped)=url.as_str().and_then(|u|u.strip_prefix('#')).and_then(|id|html.get(id)){*url=json!(format!("#{mapped}"));}}}}}set_path(site,group_name,field,&new,value)?;}
    Ok(())
}
fn duplicate_extensions(site:&mut Site,map:&BTreeMap<String,String>,old_page:&str,new_page:&str,html:&Strings,made:&BTreeSet<String>)->Result<(),String>{
    duplicate_node_entries(site,map,new_page,html,made)?;
    let new_slug=site.pages.iter().find(|p|p.id==new_page).ok_or("duplicate page missing")?.slug.trim_end_matches('/').to_string();
    for(group_name,field)in [("cms","templates"),("seo","pages"),("localization","pageSlugs"),("code","pageCode")] {if let Some(mut value)=site.extensions.get(group_name).and_then(|v|v.get(field)).and_then(|v|v.get(old_page)).cloned(){if group_name=="cms"{let route=string(&value,"slug")?.to_string();value.as_object_mut().unwrap().insert("slug".into(),json!(format!("{new_slug}/{}",route.trim_start_matches('/'))));}if group_name=="localization"{for path in value.as_object_mut().ok_or("localized routes must be map")?.values_mut(){*path=json!(format!("{new_slug}/{}",path.as_str().ok_or("localized route must be text")?.trim_start_matches('/')));}}set_path(site,group_name,field,new_page,value)?;}}
    for translations in site.locales.values_mut(){let mut copies:Vec<(String,String)>=vec![];for key in ["title","description"]{if let Some(text)=translations.get(&format!("{old_page}.{key}")){copies.push((format!("{new_page}.{key}"),text.clone()));}}for(k,v)in copies{translations.insert(k,v);}}
    Ok(())
}

const FRAGMENT_FORMAT:&str="com.nodemode.formweb.fragment";
thread_local!{static WARNINGS:std::cell::RefCell<Vec<String>>=std::cell::RefCell::new(vec![]);}
// Warnings a command raised (a kept code component definition): the engine clears them before a batch and returns them with its state.
pub fn clear_warnings(){WARNINGS.with(|w|w.borrow_mut().clear());}
pub fn take_warnings()->Vec<String>{WARNINGS.with(|w|std::mem::take(&mut *w.borrow_mut()))}
fn warn(message:String){WARNINGS.with(|w|w.borrow_mut().push(message));}
fn linked_at(site:&Site,start:&str)->bool{let mut at=Some(start.to_string());while let Some(n)=at{let Some(node)=site.nodes.get(&n)else{return false};if node.component_id.is_some()||node.component_source_id.is_some(){return true;}at=parent_of(site,&n);}false}
fn asset_ids(text:&str,out:&mut BTreeSet<String>){let mut rest=text;while let Some(at)=rest.find("/api/assets/"){rest=&rest[at+12..];let end=rest.find(|c:char|!(c.is_ascii_alphanumeric()||c=='.'||c=='_'||c=='-')).unwrap_or(rest.len());let id=rest[..end].trim_end_matches('.');if !id.is_empty(){out.insert(id.to_string());}}}
const VALUE_KINDS:&[&str]=&["values","tables","formulas"];
fn variable_of(site:&Site,name:&str)->Option<(&'static str,Value)>{VALUE_KINDS.iter().find_map(|kind|site.extensions.get("variables").and_then(|g|g.get(*kind)).and_then(|m|m.get(name)).map(|v|(*kind,v.clone())))}
// Every variable a set-variable action names, anywhere inside a motion entry (action lists, scene markers, script steps), with the words of its formula.
fn set_variable_names(value:&Value,out:&mut Vec<String>){match value{Value::Object(o)=>{if o.get("action").and_then(Value::as_str)==Some("set-variable"){if let Some(name)=o.get("variable").and_then(Value::as_str){out.push(name.to_string());}if let Some(text)=o.get("formula").and_then(Value::as_str){for word in text.split(|c:char|!(c.is_ascii_alphanumeric()||c=='_')).filter(|w|!w.is_empty()){out.push(word.to_string());}}}for v in o.values(){set_variable_names(v,out);}},Value::Array(a)=>for v in a{set_variable_names(v,out)},_=>{}}}
// The values, tables and formulas the copied inputs and outputs bind, with every name their formulas read.
fn fragment_variables(site:&Site,entries:&[Entry])->serde_json::Map<String,Value>{
    let mut out=serde_json::Map::new();let mut queue:Vec<String>=vec![];let mut seen=BTreeSet::new();
    for(g,f,_,v)in entries{if g=="variables"{if let Some(name)=v.get(if f=="inputs"{"variable"}else{"from"}).and_then(Value::as_str){queue.push(name.to_string());}}if g=="motion"{set_variable_names(v,&mut queue);}}
    while let Some(name)=queue.pop(){if !seen.insert(name.clone()){continue;}let Some((kind,value))=variable_of(site,&name)else{continue};if kind=="formulas"{if let Some(text)=value.as_str(){for word in text.split(|c:char|!(c.is_ascii_alphanumeric()||c=='_')).filter(|w|!w.is_empty()){queue.push(word.to_string());}}}out.entry(kind).or_insert_with(||json!({})).as_object_mut().unwrap().insert(name,value);}
    out
}
const COLLECTION_ITEM_CAP:usize=500;
// Names used as var(--name) anywhere in a piece of serialized JSON or CSS text.
fn var_names(text:&str,out:&mut BTreeSet<String>){let mut rest=text;while let Some(at)=rest.find("var(--"){rest=&rest[at+6..];let end=rest.find(|c:char|!(c.is_ascii_alphanumeric()||c=='_'||c=='-')).unwrap_or(rest.len());if end>0{out.insert(rest[..end].to_string());}}}
fn token_key(site:&Site,name:&str)->Option<String>{let bare=name.trim_start_matches("--");site.tokens.keys().find(|k|k.trim_start_matches("--")==bare).cloned()}
// The design values the copied nodes use: every token named by var(--name) (following tokens that use other tokens, and their theme values), and the text presets their applications name.
fn fragment_design(site:&Site,text:&str,entries:&[Entry])->Value{
    let design=site.extensions.get("design");
    let mut queue:BTreeSet<String>=BTreeSet::new();var_names(text,&mut queue);
    let mut queue:Vec<String>=queue.into_iter().collect();let mut seen=BTreeSet::new();
    let mut tokens=serde_json::Map::new();let mut modes=serde_json::Map::new();
    let theme_values=design.and_then(|d|d.get("themes")).and_then(|t|t.get("values")).and_then(Value::as_object);
    while let Some(name)=queue.pop(){
        if !seen.insert(name.clone()){continue;}
        let Some(key)=token_key(site,&name)else{continue};let value=site.tokens[&key].clone();
        let mut more=BTreeSet::new();var_names(&value,&mut more);
        let mut definition=json!({"value":value});
        if let Some(kind)=design.and_then(|d|d.get("tokens")).and_then(|t|t.get(&key)).and_then(|t|t.get("type")).and_then(Value::as_str){definition["type"]=json!(kind);}
        tokens.insert(key.clone(),definition);
        if let Some(values)=theme_values{for(mode,map)in values{if let Some(map)=map.as_object(){for(k,v)in map{if k.trim_start_matches("--")==name{if let Some(s)=v.as_str(){var_names(s,&mut more);}modes.entry(mode.clone()).or_insert_with(||json!({})).as_object_mut().unwrap().insert(k.clone(),v.clone());}}}}}
        queue.extend(more);
    }
    let mut presets=serde_json::Map::new();
    for(g,f,_,v)in entries{if g=="design"&&f=="applications"{if let Some(name)=v.get("preset").and_then(Value::as_str){if let Some(preset)=design.and_then(|d|d.get("textPresets")).and_then(|p|p.get(name)){presets.insert(name.into(),preset.clone());}}}}
    let themes=if modes.is_empty(){json!({})}else{json!({"default":design.and_then(|d|d.get("themes")).and_then(|t|t.get("default")).cloned().unwrap_or(json!("dark")),"followSystem":design.and_then(|d|d.get("themes")).and_then(|t|t.get("followSystem")).cloned().unwrap_or(json!(false)),"values":modes})};
    json!({"tokens":tokens,"textPresets":presets,"themes":themes})
}
fn font_strings(value:&Value,all:bool,out:&mut Vec<String>){match value{Value::Object(m)=>for(k,v)in m{match v.as_str(){Some(s) if all||k=="font-family"||k=="font"=>out.push(s.to_string()),_=>font_strings(v,all,out)}},Value::Array(a)=>for v in a{font_strings(v,all,out)},_=>{}}}
fn names_family(value:&str,family:&str)->bool{value.split(',').any(|part|{let p=part.trim().trim_end_matches(['"','\'']);p.trim_start_matches(['"','\''])==family||p.ends_with(&format!("\"{family}"))||p.ends_with(&format!("'{family}"))||p.ends_with(&format!(" {family}"))})}
// The site's font faces whose family the copied nodes, entries, inherited font or carried design values name.
fn fragment_fonts(site:&Site,out:&Value)->serde_json::Map<String,Value>{
    let mut values=vec![];font_strings(&out["nodes"],false,&mut values);font_strings(&out["entries"],false,&mut values);font_strings(&out["design"],true,&mut values);
    if let Some(font)=out.get("inheritedFont").and_then(Value::as_str){values.push(font.to_string());}
    let mut found=serde_json::Map::new();
    if let Some(fonts)=site.extensions.get("design").and_then(|d|d.get("fonts")).and_then(Value::as_object){for(id,font)in fonts{if let Some(family)=font.get("family").and_then(Value::as_str){if values.iter().any(|v|names_family(v,family)){found.insert(id.clone(),font.clone());}}}}
    found
}
// The CMS collections the copied bindings and lists name, and those their reference fields point at, with their items; past the cap a collection carries its first items and every item named by id, and the rest are reported.
fn fragment_collections(site:&Site,ids:&BTreeSet<String>,entries:&[Entry])->(Value,Vec<String>){
    let mut out=serde_json::Map::new();let mut warnings:Vec<String>=vec![];
    let mut named:Vec<String>=ids.iter().filter_map(|n|site.nodes[n].binding.as_ref().map(|b|b.collection.clone())).collect();
    for(g,f,_,v)in entries{if g=="cms"&&(f=="bindings"||f=="lists"){if let Some(id)=v.get("collection").and_then(Value::as_str){named.push(id.to_string());}}}
    let mut picked=BTreeSet::new();
    for(g,f,_,v)in entries{if g=="cms"&&f=="bindings"{if let Some(item)=v.get("item").and_then(Value::as_str){picked.insert(item.to_string());}}if g=="cms"&&f=="lists"{if let Some(filter)=v.get("filter"){json_strings(filter,&mut picked);}}}
    let mut order:Vec<String>=vec![];
    for id in named{if site.collections.contains_key(&id)&&!order.contains(&id){order.push(id);}}
    let mut required:BTreeMap<String,BTreeSet<String>>=BTreeMap::new();let mut kept:BTreeMap<String,Vec<usize>>=BTreeMap::new();
    // Fixpoint: a carried item's references pull in their target collections, and (past the cap) the target items themselves.
    loop{
        let mut changed=false;let mut at=0;
        while at<order.len(){
            let id=order[at].clone();at+=1;let c=&site.collections[&id];
            let keep:Vec<usize>={let need=required.get(&id);c.items.iter().enumerate().filter(|(i,item)|c.items.len()<=COLLECTION_ITEM_CAP||*i<COLLECTION_ITEM_CAP||picked.contains(&item.id)||need.map(|n|n.contains(&item.id)).unwrap_or(false)).map(|(i,_)|i).collect()};
            for field in c.fields.iter(){let Some(target)=field.collection.as_ref()else{continue};if !site.collections.contains_key(target){continue;}if !order.contains(target){order.push(target.clone());changed=true;}
                for i in &keep{let ids:Vec<&str>=match c.items[*i].values.get(&field.name){Some(Value::String(s))=>vec![s.as_str()],Some(Value::Array(a))=>a.iter().filter_map(Value::as_str).collect(),_=>vec![]};for r in ids{if required.entry(target.clone()).or_default().insert(r.to_string()){changed=true;}}}}
            if kept.get(&id)!=Some(&keep){kept.insert(id,keep);changed=true;}
        }
        if !changed{break;}
    }
    for id in &order{let mut c=site.collections[id].clone();let total=c.items.len();let keep=&kept[id];if keep.len()<total{let left=total-keep.len();warnings.push(format!("collection {id} has {total} items, more than {COLLECTION_ITEM_CAP}; the first {COLLECTION_ITEM_CAP} and {} more named by a binding, list or reference travel, and {left} were left out",keep.len().saturating_sub(COLLECTION_ITEM_CAP)));c.items=keep.iter().map(|i|c.items[*i].clone()).collect();}if let Ok(value)=serde_json::to_value(&c){out.insert(id.clone(),value);}}
    (Value::Object(out),warnings)
}
fn json_strings(value:&Value,out:&mut BTreeSet<String>){match value{Value::String(s)=>{out.insert(s.clone());},Value::Array(a)=>for v in a{json_strings(v,out)},Value::Object(o)=>for v in o.values(){json_strings(v,out)},_=>{}}}
// A self-contained copy of an element's subtree: nodes, the entries they own, the code component definitions their instances use, and every asset they name.
pub fn fragment(site:&Site,id:&str)->Result<Value,String>{
    if !site.nodes.contains_key(id){return Err("unknown node".into());}
    if site.pages.iter().any(|p|p.root==id){return Err("a page root cannot be copied; use page.duplicate".into());}
    if linked_at(site,id){return Err("a node inside a linked component instance cannot be copied; detach the instance first".into());}
    let ids=descendants(site,id)?;
    if ids.len()>2000{return Err("subtree has more than 2000 nodes; copy smaller parts".into());}
    if ids.iter().any(|n|site.nodes[n].component_id.is_some()||site.nodes[n].component_source_id.is_some()){return Err("the subtree holds a linked component instance; detach it before copying".into());}
    let entries=collect_entries(site,&ids);
    let mut grouped=serde_json::Map::new();
    for(g,f,i,v)in &entries{grouped.entry(g.clone()).or_insert_with(||json!({})).as_object_mut().unwrap().entry(f.clone()).or_insert_with(||json!({})).as_object_mut().unwrap().insert(i.clone(),v.clone());}
    let mut components=serde_json::Map::new();
    for(g,f,_,v)in &entries{if g=="code"&&f=="instances"{if let Some(c)=v.get("component").and_then(Value::as_str){if let Some(def)=site.extensions.get("code").and_then(|g|g.get("components")).and_then(|m|m.get(c)){components.insert(c.into(),def.clone());}}}}
    let mut nodes=serde_json::Map::new();
    for n in &ids{nodes.insert(n.clone(),serde_json::to_value(&site.nodes[n]).map_err(|e|e.to_string())?);}
    let mut top=id.to_string();while let Some(p)=parent_of(site,&top){top=p;}
    let page=site.pages.iter().find(|p|p.root==top).map(|p|p.id.clone());
    let mut out=json!({"format":FRAGMENT_FORMAT,"version":1,"root":id,"nodes":nodes,"entries":grouped,"codeComponents":components,"variables":fragment_variables(site,&entries),"locales":collect_locales(site,&ids),"source":{"site":site.id,"page":page}});
    let inherited=if site.nodes[id].styles.contains_key("font-family"){None}else{let mut up=parent_of(site,id);let mut found=None;while let Some(p)=up{if let Some(font)=site.nodes[&p].styles.get("font-family"){found=Some(font.clone());break;}up=parent_of(site,&p);}found};
    if let Some(font)=&inherited{out.as_object_mut().unwrap().insert("inheritedFont".into(),json!(font));}
    let used=format!("{}{}{}",out["nodes"],out["entries"],inherited.as_deref().unwrap_or(""));let (collections,collection_warnings)=fragment_collections(site,&ids,&entries);
    let mut above_ids=vec![];let mut up=parent_of(site,id);while let Some(p)=up{above_ids.push(p.clone());up=parent_of(site,&p);}
    if !above_ids.is_empty(){out.as_object_mut().unwrap().insert("ancestors".into(),json!(above_ids));}
    out.as_object_mut().unwrap().insert("design".into(),fragment_design(site,&used,&entries));
    let fonts=fragment_fonts(site,&out);if !fonts.is_empty(){out["design"].as_object_mut().unwrap().insert("fonts".into(),Value::Object(fonts));}
    out.as_object_mut().unwrap().insert("collections".into(),collections);
    if !collection_warnings.is_empty(){out.as_object_mut().unwrap().insert("warnings".into(),json!(collection_warnings));}
    let mut found=BTreeSet::new();asset_ids(&out.to_string(),&mut found);
    out.as_object_mut().unwrap().insert("assets".into(),json!(found));
    Ok(out)
}
fn import_node(site:&mut Site,source:&BTreeMap<String,Node>,id:&str,map:&mut BTreeMap<String,String>)->Result<String,String>{let mut node=source[id].clone();let children=std::mem::take(&mut node.children);let new=fresh_id(site,"copy");node.id=new.clone();node.overrides.clear();map.insert(id.into(),new.clone());site.nodes.insert(new.clone(),node);for child in children{let c=import_node(site,source,&child,map)?;site.nodes.get_mut(&new).unwrap().children.push(c);}Ok(new)}
// Adds the tokens, theme values and text presets the destination lacks; a name that exists with a different value keeps the destination's and warns.
fn paste_design(site:&mut Site,design:Option<&Value>)->Result<(),String>{
    let Some(design)=design else{return Ok(())};let design=design.as_object().ok_or("fragment design must be an object")?;
    let mut eligible=BTreeSet::new();
    if let Some(tokens)=design.get("tokens"){for(name,definition)in tokens.as_object().ok_or("fragment design tokens must be an object")?{
        let value=definition.get("value").and_then(Value::as_str).ok_or("fragment design token needs a value")?;
        match token_key(site,name){
            None=>{site.tokens.insert(name.clone(),value.into());if let Some(kind)=definition.get("type").and_then(Value::as_str){set_path(site,"design","tokens",name,json!({"type":kind,"value":value}))?;}eligible.insert(name.trim_start_matches("--").to_string());}
            Some(have)=>if site.tokens[&have]==value{eligible.insert(name.trim_start_matches("--").to_string());}else{warn(format!("design token {name} already exists here with a different value; the pasted elements use this site's"));}
        }
    }}
    if let Some(themes)=design.get("themes"){if let Some(values)=themes.get("values").and_then(Value::as_object){for(mode,map)in values{
        if mode!="dark"&&mode!="light"{continue;}
        for(key,value)in map.as_object().ok_or("fragment theme values must be an object")?{
            let Some(text)=value.as_str()else{continue};if !eligible.contains(key.trim_start_matches("--")){continue;}
            let dest=group(site,"design").as_object_mut().ok_or("design must be object")?;
            let themes_dest=dest.entry("themes").or_insert_with(||json!({"default":themes.get("default").cloned().unwrap_or(json!("dark")),"followSystem":themes.get("followSystem").cloned().unwrap_or(json!(false)),"values":{}}));
            let modes=themes_dest.as_object_mut().ok_or("design themes must be object")?.entry("values").or_insert_with(||json!({})).as_object_mut().ok_or("theme values must be object")?;
            let table=modes.entry(mode.clone()).or_insert_with(||json!({})).as_object_mut().ok_or("theme mode must be object")?;
            match table.iter().find(|(k,_)|k.trim_start_matches("--")==key.trim_start_matches("--")).map(|(_,v)|v.clone()){
                None=>{table.insert(key.clone(),json!(text));}
                Some(have)=>if have!=json!(text){warn(format!("the {mode} theme value of {key} already exists here with a different value; this site's is kept"));}
            }
        }
    }}}
    if let Some(presets)=design.get("textPresets"){for(name,definition)in presets.as_object().ok_or("fragment text presets must be an object")?{
        let existing=site.extensions.get("design").and_then(|g|g.get("textPresets")).and_then(|m|m.get(name)).cloned();
        match existing{None=>set_path(site,"design","textPresets",name,definition.clone())?,Some(have)=>if &have!=definition{warn(format!("text preset {name} already exists here with a different definition; the pasted elements use this site's"));}}
    }}
    if let Some(fonts)=design.get("fonts"){for(id,font)in fonts.as_object().ok_or("fragment fonts must be an object")?{
        let have=site.extensions.get("design").and_then(|g|g.get("fonts")).and_then(Value::as_object).cloned().unwrap_or_default();
        if have.values().any(|f|f==font){continue;}
        if have.contains_key(id){warn(format!("font {id} already exists here with a different definition; this site's is kept"));continue;}
        if have.len()>=16{warn(format!("font {id} was not added: this site already has 16 fonts"));continue;}
        set_path(site,"design","fonts",id,font.clone())?;
    }}
    Ok(())
}
// Adds the collections (with items) the destination lacks; an existing collection keeps its own definition, gains only items it lacks, and warns on a difference.
fn paste_collections(site:&mut Site,collections:Option<&Value>)->Result<(),String>{
    let Some(collections)=collections else{return Ok(())};
    for(id,value)in collections.as_object().ok_or("fragment collections must be an object")?{
        let incoming:Collection=serde_json::from_value(value.clone()).map_err(|e|format!("invalid fragment collection: {e}"))?;
        if &incoming.id!=id{return Err("fragment collection id does not match its key".into());}
        formweb_model::validate_collection(&incoming)?;
        match site.collections.get_mut(id){
            None=>{site.collections.insert(id.clone(),incoming);}
            Some(have)=>{
                if have.name!=incoming.name||have.fields!=incoming.fields{warn(format!("collection {id} already exists here with different fields; this site's is kept and no items were added"));continue;}
                let mut clash=false;
                for item in incoming.items{match have.items.iter().find(|i|i.id==item.id){None=>have.items.push(item),Some(mine)=>if mine!=&item{clash=true;}}}
                if clash{warn(format!("collection {id} already holds items with the same ids and different content; this site's were kept"));}
            }
        }
    }
    Ok(())
}
// Inserts a fragment under fresh ids: default last under `parent` (the first page's root when none is given), or at `index`.
fn paste_fragment(site:&mut Site,params:&Value)->Result<(),String>{
    let fragment=params.get("fragment").and_then(Value::as_object).ok_or("fragment must be an object")?;
    if fragment.get("format").and_then(Value::as_str)!=Some(FRAGMENT_FORMAT){return Err("not a FormWeb fragment".into());}
    if fragment.get("version").and_then(Value::as_u64)!=Some(1){return Err("unsupported fragment version".into());}
    let root=fragment.get("root").and_then(Value::as_str).ok_or("fragment root must be text")?.to_string();
    let raw=fragment.get("nodes").and_then(Value::as_object).ok_or("fragment nodes must be an object")?;
    if raw.is_empty(){return Err("fragment has no nodes".into());}
    if raw.len()>2000{return Err("fragment has more than 2000 nodes; copy smaller parts".into());}
    let mut source:BTreeMap<String,Node>=BTreeMap::new();
    for(key,value)in raw{let node:Node=serde_json::from_value(value.clone()).map_err(|e|format!("invalid fragment node: {e}"))?;if &node.id!=key{return Err("fragment node id does not match its key".into());}if node.component_id.is_some()||node.component_source_id.is_some(){return Err("a fragment cannot carry linked component instances; detach them before copying".into());}source.insert(key.clone(),node);}
    let mut seen=BTreeSet::new();let mut stack=vec![root.clone()];
    while let Some(id)=stack.pop(){let node=source.get(&id).ok_or("fragment root or child is missing from its nodes")?;if !seen.insert(id.clone()){return Err("fragment repeats a node".into());}stack.extend(node.children.iter().cloned());}
    if seen.len()!=source.len(){return Err("fragment has nodes outside its tree".into());}
    let parent=match params.get("parent"){Some(p)=>p.as_str().ok_or("parent must be text")?.to_string(),None=>site.pages.first().ok_or("site has no page")?.root.clone()};
    if !site.nodes.contains_key(&parent){return Err("unknown destination parent".into());}
    if linked_at(site,&parent){return Err("the paste cannot go inside a linked component instance".into());}
    let at=site.nodes[&parent].children.len();
    let index=match params.get("index"){Some(v)=>usize::try_from(v.as_u64().ok_or("index must be a nonnegative integer")?).map_err(|_|"index is out of range")?,None=>at};
    if index>at{return Err("index is outside destination children".into());}
    let mut entries:Vec<Entry>=vec![];
    if let Some(groups)=fragment.get("entries"){for(g,fields)in groups.as_object().ok_or("fragment entries must be an object")?{for(f,found)in fields.as_object().ok_or("fragment entry group must be an object")?{
        let known=(g=="behaviors"&&(f=="timelines"||f=="overlays"))||NODE_KEYED.iter().any(|(a,b)|*a==g.as_str()&&*b==f.as_str());
        if !known{return Err(format!("fragment holds unknown entries {g}.{f}"));}
        for(id,value)in found.as_object().ok_or("fragment entries must map ids to values")?{if g!="behaviors"&&!source.contains_key(id){return Err(format!("fragment entry {g}.{f} names a node outside the fragment"));}entries.push((g.clone(),f.clone(),id.clone(),value.clone()));}
    }}}
    if entries.iter().any(|(g,f,_,_)|g=="code"&&f=="sections")&&site.extensions.get("code").and_then(|c|c.get("allowSections")).and_then(Value::as_bool)!=Some(true){return Err("the destination site does not allow code sections; enable them first".into());}
    let locales:BTreeMap<String,Strings>=match fragment.get("locales"){Some(v)=>serde_json::from_value(v.clone()).map_err(|e|format!("invalid fragment locales: {e}"))?,None=>BTreeMap::new()};
    if let Some(defs)=fragment.get("codeComponents"){for(id,definition)in defs.as_object().ok_or("fragment codeComponents must be an object")?{let existing=site.extensions.get("code").and_then(|g|g.get("components")).and_then(|m|m.get(id)).cloned();match existing{None=>set_path(site,"code","components",id,definition.clone())?,Some(existing)=>if &existing!=definition{warn(format!("code component {id} already exists here with a different definition; the pasted instances use this site's"));}}}}
    if let Some(kinds)=fragment.get("variables"){for(kind,found)in kinds.as_object().ok_or("fragment variables must be an object")?{if !VALUE_KINDS.contains(&kind.as_str()){return Err(format!("fragment variables hold unknown kind {kind}"));}for(name,definition)in found.as_object().ok_or("fragment variables must map names to definitions")?{match variable_of(site,name){None=>set_path(site,"variables",kind,name,definition.clone())?,Some((have,existing))=>if have!=kind||&existing!=definition{warn(format!("variable {name} already exists here with a different definition; the pasted inputs and outputs use this site's"));}}}}}
    paste_design(site,fragment.get("design"))?;paste_collections(site,fragment.get("collections"))?;
    let mut map=BTreeMap::new();let new_root=import_node(site,&source,&root,&mut map)?;
    site.nodes.get_mut(&parent).unwrap().children.insert(index,new_root.clone());
    if let Some(font)=fragment.get("inheritedFont").and_then(Value::as_str){
        let mut here=None;let mut up=Some(parent.clone());while let Some(p)=up{if let Some(f)=site.nodes[&p].styles.get("font-family"){here=Some(f.clone());break;}up=parent_of(site,&p);}
        if here.as_deref()!=Some(font)&&!site.nodes[&new_root].styles.contains_key("font-family"){site.nodes.get_mut(&new_root).unwrap().styles.insert("font-family".into(),font.to_string());}
    }
    let own:BTreeMap<String,String>=map.values().map(|n|(n.clone(),n.clone())).collect();
    let mut above:BTreeMap<&str,&str>=BTreeMap::new();for node in source.values(){for child in &node.children{above.insert(child.as_str(),node.id.as_str());}}
    let carried:BTreeSet<String>=fragment.get("ancestors").and_then(Value::as_array).map(|list|list.iter().take(256).filter_map(Value::as_str).filter(|s|s.len()<=128).map(String::from).collect()).unwrap_or_default();
    let mut made:BTreeMap<String,BTreeSet<String>>=BTreeMap::new();let mut every=carried.clone();
    for(from,to)in &map{let mut chain=carried.clone();let mut at=Some(from.as_str());while let Some(n)=at{chain.insert(n.to_string());at=above.get(n).copied();}every.extend(chain.iter().cloned());made.insert(to.clone(),chain);}
    let html=remap_html_ids(site,&own,&new_root,&made)?;place_entries(site,&entries,&map,&new_root,&html,&every)?;place_locales(site,&locales,&map);
    formweb_model::advanced::validate_extensions(site)
}

fn clear_managed(site:&mut Site,root:&str,definition:&Value,data:&Value)->Result<(),String>{let mut fields=vec![];if let Some(variant)=data.get("variant").and_then(Value::as_str).and_then(|name|definition.get("variants").and_then(|v|v.get(name))).and_then(|v|v.get("nodes")).and_then(Value::as_object){for(source,patch)in variant{if patch.get("text").is_some(){fields.push((source.clone(),"text".into()));}for group in ["attrs","styles"]{if let Some(map)=patch.get(group).and_then(Value::as_object){for key in map.keys(){fields.push((source.clone(),format!("{group}.{key}")));}}}}}if let Some(props)=definition.get("props").and_then(Value::as_object){for prop in props.values(){fields.push((string(prop,"target")?.into(),string(prop,"field")?.into()));}}let ids=descendants(site,root)?;let maps=component_attr_maps(site);for(source,field)in fields{let Some(id)=ids.iter().find(|id|site.nodes[*id].component_source_id.as_deref()==Some(&source)).cloned()else{continue};let original=site.nodes.get(&source).ok_or("prop source missing")?.clone();let attrs=linked_attrs(&original,&maps[root]);let n=site.nodes.get_mut(&id).unwrap();if field=="text"{n.text=original.text;n.overrides.retain(|k|k!="text");}else if let Some(key)=field.strip_prefix("styles."){if let Some(value)=original.styles.get(key){n.styles.insert(key.into(),value.clone());}else{n.styles.remove(key);}if n.styles==original.styles{n.overrides.retain(|k|k!="styles");}}else if let Some(key)=field.strip_prefix("attrs."){if let Some(value)=attrs.get(key){n.attrs.insert(key.into(),value.clone());}else{n.attrs.remove(key);}if n.attrs==attrs{n.overrides.retain(|k|k!="attrs");}}}Ok(())}
fn patch_instance(site:&mut Site,root:&str,source:&str,patch:&Value)->Result<(),String>{let id=descendants(site,root)?.into_iter().find(|id|site.nodes[id].component_source_id.as_deref()==Some(source)).ok_or("configured target missing in instance")?;let mut patch=patch.clone();if let Some(fields)=instance_data(site,root).get("resetFields").and_then(Value::as_array){for field in fields{if let Some(field)=field.as_str(){patch.as_object_mut().ok_or("component patch must be object")?.remove(field);}}}if let Some(attrs)=patch.get_mut("attrs"){let mut n=site.nodes[source].clone();n.attrs=serde_json::from_value(attrs.clone()).map_err(|e|e.to_string())?;let maps=component_attr_maps(site);*attrs=json!(linked_attrs(&n,maps.get(root).ok_or("missing instance identity map")?));}if object(&patch)?.is_empty(){return Ok(());}base_apply(site,"node.update",&json!({"id":id,"patch":patch}))}
fn materialize(site:&mut Site,root:&str)->Result<(),String>{let component=component_id(site,root)?;let definition=component_definition(site,&component);let data=instance_data(site,root);if let Some(name)=data.get("variant").and_then(Value::as_str){let variant=definition.get("variants").and_then(|v|v.get(name)).ok_or("unknown component variant")?;if let Some(nodes)=variant.get("nodes").and_then(Value::as_object){for(source,patch)in nodes{patch_instance(site,root,source,patch)?;}}}if let Some(props)=definition.get("props").and_then(Value::as_object){for(name,prop)in props{let value=data.get("props").and_then(|p|p.get(name)).or_else(||prop.get("default")).ok_or("prop default required")?;if !formweb_model::advanced::typed_value(string(prop,"type")?,value){return Err("wrong component prop type".into());}let text=value.as_str().map(String::from).unwrap_or_else(||value.to_string());let field=string(prop,"field")?;let patch=if field=="text"{json!({"text":text})}else{let(group,key)=field.split_once('.').ok_or("invalid prop field")?;let mut inner=serde_json::Map::new();inner.insert(key.into(),Value::String(text));let mut outer=serde_json::Map::new();outer.insert(group.into(),Value::Object(inner));Value::Object(outer)};patch_instance(site,root,string(prop,"target")?,&patch)?;}}Ok(())}

pub fn synchronize(site:&mut Site)->Result<(),String>{
    let applications=site.extensions.get("design").and_then(|g|g.get("applications")).and_then(Value::as_object).cloned().unwrap_or_default();
    for(id,application)in applications{if !site.nodes.contains_key(&id){continue;}let name=string(&application,"preset")?;let mut preset=site.extensions.get("design").and_then(|g|g.get("textPresets")).and_then(|m|m.get(name)).and_then(|p|p.get("styles")).ok_or("applied preset missing")?.clone();if let Some(overrides)=application.get("overrides").and_then(Value::as_array){for key in overrides.iter().filter_map(Value::as_str){preset.as_object_mut().ok_or("preset styles must be object")?.remove(key);}}base_apply(site,"node.update",&json!({"id":id,"patch":{"styles":preset}}))?;}
    let roots:Vec<_>=site.nodes.values().filter(|n|n.component_id.is_some()).map(|n|n.id.clone()).collect();
    for root in &roots{if !site.nodes.contains_key(root){continue;}let component=component_id(site,root)?;let source=site.components.get(&component).ok_or("unknown linked component")?.root.clone();let old=descendants(site,root)?;let mut mapping:BTreeMap<_,_>=old.iter().filter_map(|id|site.nodes[id].component_source_id.clone().map(|source|(source,id.clone()))).collect();mapping.insert(source.clone(),root.clone());let mut kept=BTreeSet::new();sync_node(site,&source,root,&component,&mut mapping,&mut kept)?;for obsolete in old.difference(&kept){site.nodes.remove(obsolete);}}
    prune(site);prune_motion(site);
    let roots_map=instance_roots(site);let attrs=component_attr_maps(site);let ids:Vec<_>=site.nodes.values().filter(|n|n.component_source_id.is_some()).map(|n|n.id.clone()).collect();
    for id in ids{let n=site.nodes[&id].clone();let source=site.nodes.get(n.component_source_id.as_ref().unwrap()).ok_or("missing linked source")?.clone();let map=attrs.get(&roots_map[&id]).ok_or("missing instance map")?;let target=site.nodes.get_mut(&id).unwrap();target.tag=source.tag.clone();target.binding=source.binding.clone();if !target.overrides.iter().any(|v|v=="attrs"){target.attrs=linked_attrs(&source,map);}if !target.overrides.iter().any(|v|v=="text"){target.text=source.text.clone();}if !target.overrides.iter().any(|v|v=="styles"){target.styles=source.styles.clone();}if !target.overrides.iter().any(|v|v=="breakpoints"){target.breakpoints=source.breakpoints.clone();}if !target.overrides.iter().any(|v|v=="interactions"){target.interactions=source.interactions.clone();}}
    for root in roots{if site.nodes.contains_key(&root){materialize(site,&root)?;}}Ok(())
}
fn sync_node(site:&mut Site,source:&str,root:&str,component:&str,map:&mut BTreeMap<String,String>,kept:&mut BTreeSet<String>)->Result<String,String>{let original=site.nodes.get(source).ok_or("missing component source")?.clone();if original.component_source_id.is_some(){return Err("nested linked source requires explicit detach before configuring outer source".into());}let id=if let Some(id)=map.get(source){id.clone()}else{let id=fresh_id(site,"instance");let mut n=original.clone();n.id=id.clone();n.children.clear();n.component_source_id=Some(source.into());n.component_id=None;n.overrides.clear();site.nodes.insert(id.clone(),n);map.insert(source.into(),id.clone());id};kept.insert(id.clone());let children=if let Some(slotted)=formweb_model::advanced::slot_nodes(site,root,source){for node in &slotted{kept.extend(descendants(site,node)?);}slotted}else{let mut children=vec![];for child in original.children{children.push(sync_node(site,&child,root,component,map,kept)?);}children};let n=site.nodes.get_mut(&id).unwrap();n.children=children;n.component_source_id=Some(source.into());n.component_id=if id==root{Some(component.into())}else{None};Ok(id)}
fn prune(site:&mut Site){let node_ids:BTreeSet<_>=site.nodes.keys().cloned().collect();let page_ids:BTreeSet<_>=site.pages.iter().map(|p|p.id.clone()).collect();for(group_name,field)in [("cms","bindings"),("cms","lists"),("behaviors","nodes"),("forms","forms"),("code","instances"),("integrations","widgets"),("components","instances"),("design","applications"),("localization","assets"),("variables","inputs"),("variables","outputs"),("code","sections")] {if let Some(map)=site.extensions.get_mut(group_name).and_then(|g|g.get_mut(field)).and_then(Value::as_object_mut){map.retain(|id,_|node_ids.contains(id));}}for(group_name,field)in [("cms","templates"),("seo","pages"),("localization","pageSlugs"),("code","pageCode")] {if let Some(map)=site.extensions.get_mut(group_name).and_then(|g|g.get_mut(field)).and_then(Value::as_object_mut){map.retain(|id,_|page_ids.contains(id));}}}
fn prune_motion(site:&mut Site){
    let Some(mut data)=site.extensions.get("motion").cloned() else{return};
    let has=|id:&str|site.nodes.contains_key(id);
    let ok=|v:Option<&Value>|v.and_then(Value::as_str).map(has).unwrap_or(false);
    let action_ok=|a:Option<&Value>|a.map(|a|["from","to","target","input","results","template","empty"].iter().all(|k|a.get(*k).map(|v|ok(Some(v))).unwrap_or(true))).unwrap_or(false);
    let Some(groups)=data.as_object_mut() else{return};
    for kind in formweb_model::motion::KINDS{if let Some(map)=groups.get_mut(*kind).and_then(Value::as_object_mut){map.retain(|id,_|has(id));}}
    if let Some(map)=groups.get_mut("scenes").and_then(Value::as_object_mut){
        let mut dead=vec![];
        for(id,scene)in map.iter_mut(){
            let members=formweb_model::advanced::subtree(site,id);
            let inside=|v:Option<&Value>|v.and_then(Value::as_str).map(|id|members.contains(id)&&has(id)).unwrap_or(false);
            if !inside(scene.get("stage")){dead.push(id.clone());continue;}
            for(field,reference)in [("tracks","node"),("distribute","parent")]{if let Some(list)=scene.get_mut(field).and_then(Value::as_array_mut){list.retain(|entry|inside(entry.get(reference)));}}
            if let Some(list)=scene.get_mut("markers").and_then(Value::as_array_mut){list.retain(|marker|action_ok(marker.get("action")));}
            if scene.get("tracks").and_then(Value::as_array).map(|t|t.is_empty()).unwrap_or(true){dead.push(id.clone());}
        }
        for id in dead{map.remove(&id);}
    }
    if let Some(map)=groups.get_mut("drag").and_then(Value::as_object_mut){for entry in map.values_mut(){let Some(fields)=entry.as_object_mut()else{continue};if fields.get("flip").map(|f|!ok(f.get("back"))).unwrap_or(false){fields.remove("flip");}if fields.get("bounds").and_then(Value::as_str).map(|b|!["parent","window","none"].contains(&b)&&!has(b)).unwrap_or(false){fields.remove("bounds");}}}
    if let Some(map)=groups.get_mut("pointer").and_then(Value::as_object_mut){map.retain(|_,entry|entry.get("type").and_then(Value::as_str)!=Some("follow")||ok(entry.get("within")));}
    if let Some(map)=groups.get_mut("disclosure").and_then(Value::as_object_mut){
        let mut dead=vec![];
        for(id,entry)in map.iter_mut(){
            let filter=entry.get("type").and_then(Value::as_str)==Some("filter");
            if filter{
                if let Some(chips)=entry.get_mut("chips").and_then(Value::as_array_mut){chips.retain(|chip|ok(chip.get("trigger")));}
                let values:Vec<String>=entry.get("chips").and_then(Value::as_array).map(|c|c.iter().filter_map(|chip|chip.get("value").and_then(Value::as_str).map(String::from)).collect()).unwrap_or_default();
                if !ok(entry.get("items"))||values.is_empty(){dead.push(id.clone());continue;}
                if entry.get("initial").and_then(Value::as_str).map(|i|!values.iter().any(|v|v==i)).unwrap_or(false){entry.as_object_mut().unwrap().remove("initial");}
            }else{
                if let Some(items)=entry.get_mut("items").and_then(Value::as_array_mut){items.retain(|item|ok(item.get("trigger"))&&ok(item.get("panel")));}
                let count=entry.get("items").and_then(Value::as_array).map(Vec::len).unwrap_or(0);
                if count==0{dead.push(id.clone());continue;}
                let fields=entry.as_object_mut().unwrap();
                if fields.get("initial").and_then(Value::as_u64).map(|i|i as usize>=count).unwrap_or(false){fields.remove("initial");}
                if fields.get("indicator").map(|i|!ok(Some(i))).unwrap_or(false){fields.remove("indicator");}
            }
        }
        for id in dead{map.remove(&id);}
    }
    if let Some(map)=groups.get_mut("actions").and_then(Value::as_object_mut){for list in map.values_mut(){if let Some(list)=list.as_array_mut(){list.retain(|a|action_ok(Some(a)));}}map.retain(|_,list|list.as_array().map(|l|!l.is_empty()).unwrap_or(false));}
    if let Some(map)=groups.get_mut("scripts").and_then(Value::as_object_mut){
        map.retain(|id,script|has(id)&&!script.get("steps").and_then(Value::as_array).map(|steps|steps.iter().any(|step|names_removed(site,step))).unwrap_or(false));
    }
    site.extensions.insert("motion".into(),data);
}

const VARIABLE_KINDS:&[&str]=&["values","tables","formulas","inputs","outputs"];
fn drop_entry(site:&mut Site,group_name:&str,map:&str,id:&str)->Result<(),String>{
    let g=site.extensions.get_mut(group_name).and_then(Value::as_object_mut).ok_or("unknown entry")?;
    let m=g.get_mut(map).and_then(Value::as_object_mut).ok_or("unknown entry")?;
    m.remove(id).ok_or("unknown entry")?;
    if m.is_empty(){g.remove(map);}
    if g.is_empty(){site.extensions.remove(group_name);}
    Ok(())
}
fn motion_track(site:&mut Site,params:&Value)->Result<(),String>{
    let scene=string(params,"scene")?;
    let list=match params.get("list"){None|Some(Value::Null)=>"tracks",Some(v)=>v.as_str().ok_or("list must be tracks or distribute")?};
    if !["tracks","distribute"].contains(&list){return Err("list must be tracks or distribute".into());}
    let index=params.get("index").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or("index must be a nonnegative integer")?;
    let track=params.get("track").ok_or("track is required")?.clone();
    if !track.is_null()&&!track.is_object(){return Err("track must be an object or null".into());}
    let entry=site.extensions.get_mut("motion").and_then(|g|g.get_mut("scenes")).and_then(|m|m.get_mut(scene)).and_then(Value::as_object_mut).ok_or("unknown scene")?;
    let items=entry.entry(list).or_insert_with(||json!([])).as_array_mut().ok_or("scene list must be an array")?;
    if index>items.len(){return Err("index is outside the list".into());}
    if track.is_null(){if index==items.len(){return Err("index is outside the list".into());}items.remove(index);}
    else if index==items.len(){items.push(track);}
    else{items[index]=track;}
    if items.is_empty()&&list=="distribute"{entry.remove(list);}
    formweb_model::motion::validate(site,&site.extensions["motion"])
}
fn names_removed(site:&Site,step:&Value)->bool{
    let missing=|v:Option<&Value>|v.and_then(Value::as_str).map(|id|!id.starts_with('@')&&!site.nodes.contains_key(id)).unwrap_or(false);
    let step_type=step.get("type").and_then(Value::as_str).unwrap_or("");
    for key in ["target","template","into","from","input","results","empty"]{if missing(step.get(key)){return true;}}
    if step_type=="pointer"&&missing(step.get("to")){return true;}
    if step_type=="scroll"&&step.get("to").and_then(Value::as_str).map(|to|!["start","end"].contains(&to)&&missing(step.get("to"))).unwrap_or(false){return true;}
    if let Some(text)=step.get("text").and_then(Value::as_str){let mut rest=text;while let Some(at)=rest.find("{input:"){rest=&rest[at+7..];if let Some(end)=rest.find('}'){if !site.nodes.contains_key(&rest[..end]){return true;}}}}
    if let Some(action)=step.get("action").filter(|a|a.is_object()){
        for key in ["from","to","target","input","results","template","empty"]{if missing(action.get(key)){return true;}}
    }
    false
}
fn namespace(pin:&str,name:&str)->Result<String,String>{let value=format!("lib-{pin}-{}",name.trim_start_matches("--"));if !formweb_model::identifier(&value){return Err("library namespace exceeds identifier limit".into());}Ok(value)}
fn rewrite_tokens(value:&mut Value,tokens:&Strings){match value{Value::String(s)=>for(old,new)in tokens{*s=s.replace(&format!("var(--{})",old.trim_start_matches("--")),&format!("var(--{new})")).replace(&format!("var(--{},",old.trim_start_matches("--")),&format!("var(--{new},"));},Value::Array(values)=>for value in values{rewrite_tokens(value,tokens)},Value::Object(values)=>for value in values.values_mut(){rewrite_tokens(value,tokens)},_=>{}}}
fn prepare_library(document:&Site,pin:&str,chosen:&[String])->Result<(Site,Strings,Strings),String>{validate(document)?;if document.extensions.contains_key("libraries"){return Err("nested library snapshots unsupported".into());}if chosen.is_empty()||chosen.len()>100{return Err("library import needs 1 to 100 components".into());}let mut owned=BTreeSet::new();for component in chosen{let component=document.components.get(component).ok_or("unknown library component")?;for node in descendants(document,&component.root)?{if !owned.insert(node){return Err("library components cannot have overlapping source trees".into());}}}
    for id in &owned{if document.nodes[id].component_source_id.is_some(){return Err("library source must detach nested linked content before import".into());}if document.nodes[id].binding.is_some(){return Err("library CMS dependencies require explicit local collection authoring before import".into());}for(group,field)in [("cms","bindings"),("cms","lists"),("code","instances"),("integrations","widgets"),("behaviors","nodes"),("design","applications"),("localization","assets")]{if document.extensions.get(group).and_then(|g|g.get(field)).and_then(|m|m.get(id)).is_some(){return Err(format!("library {group} dependencies require explicit local authoring before import"));}}}
    let tokens:Strings=document.tokens.keys().map(|name|Ok((name.clone(),namespace(pin,name)?))).collect::<Result<_,String>>()?;let breakpoints:Strings=document.breakpoints.iter().map(|bp|Ok((bp.id.clone(),namespace(pin,&bp.id)?))).collect::<Result<_,String>>()?;let html:Strings=owned.iter().filter_map(|id|document.nodes[id].attrs.get("id").map(|html|(html.clone(),format!("{html}-{pin}")))).collect();let mut prepared=document.clone();
    for id in &owned{let n=prepared.nodes.get_mut(id).unwrap();n.attrs=linked_attrs(n,&html);for interaction in &mut n.interactions{if let Some(href)=interaction.url.as_mut(){if let Some(mapped)=href.strip_prefix('#').and_then(|id|html.get(id)){*href=format!("#{mapped}");}}}let mut styles=json!(n.styles);rewrite_tokens(&mut styles,&tokens);n.styles=serde_json::from_value(styles).map_err(|e|e.to_string())?;let old=std::mem::take(&mut n.breakpoints);for(bp,styles)in old{let mut styles=json!(styles);rewrite_tokens(&mut styles,&tokens);n.breakpoints.insert(breakpoints[&bp].clone(),serde_json::from_value(styles).map_err(|e|e.to_string())?);}}
    for component in chosen{if let Some(def)=prepared.extensions.get_mut("components").and_then(|g|g.get_mut("definitions")).and_then(|d|d.get_mut(component)){rewrite_tokens(def,&tokens);if let Some(variants)=def.get_mut("variants").and_then(Value::as_object_mut){for variant in variants.values_mut(){if let Some(nodes)=variant.get_mut("nodes").and_then(Value::as_object_mut){for(source,patch)in nodes{if let Some(attrs)=patch.get_mut("attrs"){let mut n=document.nodes[source].clone();n.attrs=serde_json::from_value(attrs.clone()).map_err(|e|e.to_string())?;*attrs=json!(linked_attrs(&n,&html));}}}}}if let Some(props)=def.get_mut("props").and_then(Value::as_object_mut){for prop in props.values_mut(){if prop.get("field").and_then(Value::as_str)==Some("attrs.href"){if let Some(href)=prop.get_mut("default"){if let Some(mapped)=href.as_str().and_then(|s|s.strip_prefix('#')).and_then(|id|html.get(id)){*href=json!(format!("#{mapped}"));}}}}}}}
    Ok((prepared,tokens,breakpoints))
}
fn install_library_design(site:&mut Site,document:&Site,pin:&str,old:Option<&Site>,tokens:&Strings,breakpoints:&Strings)->Result<(),String>{for(source,local)in tokens{let mut value=json!(document.tokens[source]);rewrite_tokens(&mut value,tokens);if let Some(current)=site.tokens.get(local){let mut expected=old.and_then(|d|d.tokens.get(source)).map(|s|json!(s)).unwrap_or(Value::Null);rewrite_tokens(&mut expected,tokens);if expected.as_str()!=Some(current){return Err(format!("library token conflict at {local}; detach or resolve local edits"));}}site.tokens.insert(local.clone(),value.as_str().unwrap().into());if let Some(token)=document.extensions.get("design").and_then(|g|g.get("tokens")).and_then(|m|m.get(source)){set_path(site,"design","tokens",local,token.clone())?;}}
    for bp in &document.breakpoints{let local=&breakpoints[&bp.id];let mut replacement=bp.clone();replacement.id=local.clone();if let Some(current)=site.breakpoints.iter_mut().find(|bp|&bp.id==local){let mut expected=old.and_then(|d|d.breakpoints.iter().find(|b|b.id==bp.id)).cloned().ok_or("library breakpoint namespace collision")?;expected.id=local.clone();if *current!=expected{return Err(format!("library breakpoint conflict at {local}"));}*current=replacement;}else{site.breakpoints.push(replacement);}}let _=pin;Ok(())}
fn library_definition(site:&mut Site,document:&Site,source:&str,local:&str,map:&Strings)->Result<(),String>{let definition=document.extensions.get("components").and_then(|g|g.get("definitions")).and_then(|d|d.get(source)).cloned();if let Some(mut definition)=definition{remap_definition(&mut definition,map);set_path(site,"components","definitions",local,definition)?;}else if let Some(defs)=site.extensions.get_mut("components").and_then(|g|g.get_mut("definitions")).and_then(Value::as_object_mut){defs.remove(local);}Ok(())}
fn library_metadata(site:&mut Site,document:&Site,map:&Strings)->Result<(),String>{for(source,local)in map{if let Some(mut form)=document.extensions.get("forms").and_then(|g|g.get("forms")).and_then(|m|m.get(source)).cloned(){remap_json(&mut form,map);set_path(site,"forms","forms",local,form)?;}}for(locale,translations)in &document.locales{let target=site.locales.entry(locale.clone()).or_default();for(source,local)in map{if let Some(value)=translations.get(source){target.insert(local.clone(),value.clone());}}}Ok(())}
fn library_fragments(site:&Site,document:&Site,chosen:&[String])->Result<(),String>{let owned:BTreeSet<_>=chosen.iter().flat_map(|id|formweb_model::advanced::subtree(document,&document.components[id].root)).collect();let html:BTreeSet<_>=site.nodes.values().filter_map(|n|n.attrs.get("id").cloned()).chain(owned.iter().filter_map(|id|document.nodes[id].attrs.get("id").cloned())).collect();for id in owned{let n=&document.nodes[&id];let references:Vec<_>=n.attrs.get("href").and_then(|s|s.strip_prefix('#')).into_iter().chain(n.attrs.get("for").map(String::as_str)).chain(n.attrs.get("aria-labelledby").into_iter().chain(n.attrs.get("aria-describedby")).flat_map(|s|s.split_whitespace())).chain(n.interactions.iter().filter_map(|i|i.url.as_deref().and_then(|u|u.strip_prefix('#')))).collect();for reference in references{if !reference.is_empty()&&!html.contains(reference){return Err(format!("library fragment target #{reference} is absent from component and destination"));}}}Ok(())}
fn library_import(site:&mut Site,params:&Value)->Result<(),String>{let id=string(params,"id")?;if site.extensions.get("libraries").and_then(|g|g.get("packages")).and_then(|p|p.get(id)).is_some(){return Err("library pin already exists; use library.update for reviewed new version".into());}let document:Site=serde_json::from_value(params.get("site").ok_or("library site required")?.clone()).map_err(|e|e.to_string())?;let parent=string(params,"parent")?;if !site.nodes.contains_key(parent)||site.nodes[parent].component_source_id.is_some(){return Err("library parent must be independent node".into());}let chosen:Vec<String>=params.get("components").map(|v|serde_json::from_value(v.clone()).map_err(|e|e.to_string())).transpose()?.unwrap_or_else(||document.components.keys().cloned().collect());let(prepared,tokens,breakpoints)=prepare_library(&document,id,&chosen)?;library_fragments(site,&prepared,&chosen)?;install_library_design(site,&document,id,None,&tokens,&breakpoints)?;let mut imported=serde_json::Map::new();let mut map=BTreeMap::new();for component in &chosen{let c=&prepared.components[component];let root=copy_from(site,&prepared,&c.root,None,&mut map)?;site.nodes.get_mut(parent).unwrap().children.push(root.clone());let local=fresh_id(site,"library-component");site.components.insert(local.clone(),Component{id:local.clone(),name:c.name.clone(),root});imported.insert(component.clone(),json!(local));library_definition(site,&prepared,component,&local,&map)?;}library_metadata(site,&document,&map)?;
    set_path(site,"libraries","packages",id,json!({"name":string(params,"name")?,"version":string(params,"version")?,"site":document,"components":chosen,"imported":imported,"nodes":map,"tokens":tokens,"breakpoints":breakpoints}))?;Ok(())}
fn copy_from(site:&mut Site,source:&Site,id:&str,force:Option<&str>,map:&mut BTreeMap<String,String>)->Result<String,String>{let mut n=source.nodes.get(id).ok_or("missing library node")?.clone();let children=n.children.clone();let new=force.map(String::from).or_else(||map.get(id).cloned()).unwrap_or_else(||fresh_id(site,"library-node"));n.id=new.clone();n.children.clear();n.component_id=None;n.component_source_id=None;n.overrides.clear();map.insert(id.into(),new.clone());site.nodes.insert(new.clone(),n);for child in children{let child=copy_from(site,source,&child,None,map)?;site.nodes.get_mut(&new).unwrap().children.push(child);}Ok(new)}
fn library_update(site:&mut Site,params:&Value)->Result<(),String>{let id=string(params,"id")?;let old=site.extensions.get("libraries").and_then(|g|g.get("packages")).and_then(|p|p.get(id)).ok_or("unknown library pin")?.clone();let version=string(params,"version")?;if old.get("version").and_then(Value::as_str)==Some(version){return Err("library update requires a new pinned version".into());}let document:Site=serde_json::from_value(params.get("site").ok_or("library site required")?.clone()).map_err(|e|e.to_string())?;let previous:Site=serde_json::from_value(old.get("site").ok_or("pin site missing")?.clone()).map_err(|e|e.to_string())?;let chosen:Vec<String>=serde_json::from_value(old.get("components").ok_or("pin components missing")?.clone()).map_err(|e|e.to_string())?;let imported=object(old.get("imported").ok_or("pin imported map missing")?)?.clone();let(mut expected,_,_)=prepare_library(&previous,id,&chosen)?;let mut map:Strings=serde_json::from_value(old.get("nodes").ok_or("legacy library pin requires detach and reimport before update")?.clone()).map_err(|e|e.to_string())?;
    for(source,local)in &map{let n=expected.nodes.get_mut(source).ok_or("library provenance missing source")?;n.id=local.clone();n.children=n.children.iter().map(|child|map.get(child).cloned().ok_or("library provenance child missing")).collect::<Result<_,_>>()?;n.component_id=None;n.component_source_id=None;n.overrides.clear();if site.nodes.get(local)!=Some(n){return Err(format!("library source conflict at {local}; detach or resolve local edits"));}}
    for(source,local)in &imported{let local=local.as_str().ok_or("local component must be text")?;let mut definition=component_definition(&expected,source);remap_definition(&mut definition,&map);if component_definition(site,local)!=definition{return Err(format!("library definition conflict at {local}"));}}
    let(prepared,tokens,breakpoints)=prepare_library(&document,id,&chosen)?;library_fragments(site,&prepared,&chosen)?;install_library_design(site,&document,id,Some(&previous),&tokens,&breakpoints)?;let obsolete:BTreeSet<_>=map.values().cloned().collect();map.retain(|source,_|chosen.iter().any(|component|document.components.get(component).map(|c|formweb_model::advanced::subtree(&document,&c.root).contains(source)).unwrap_or(false)));
    for(source,local)in &imported{let source_component=prepared.components.get(source).ok_or("new library version removed imported component; explicit detach required")?;let local=local.as_str().ok_or("local component must be string")?;let root=site.components.get(local).ok_or("local library component missing")?.root.clone();copy_from(site,&prepared,&source_component.root,Some(&root),&mut map)?;site.components.get_mut(local).unwrap().name=source_component.name.clone();library_definition(site,&prepared,source,local,&map)?;}
    let kept:BTreeSet<_>=map.values().cloned().collect();for node in obsolete.difference(&kept){site.nodes.remove(node);}library_metadata(site,&document,&map)?;
    let mut updated=old;let package=updated.as_object_mut().unwrap();package.insert("version".into(),json!(version));package.insert("site".into(),json!(document));package.insert("nodes".into(),json!(map));package.insert("tokens".into(),json!(tokens));package.insert("breakpoints".into(),json!(breakpoints));set_path(site,"libraries","packages",id,updated)?;Ok(())}
