use formweb_model::{blank_node, component_attr_maps, identifier, instance_roots, linked_attrs, starter, validate, Collection, Component, Item, Node, Page, Seo, Site, Strings};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

mod advanced;
mod wishlist;

pub const COMMANDS: &[&str] = &["node.add", "node.update", "node.remove", "node.move", "page.add", "page.update", "page.remove", "token.set", "component.create", "component.insert", "collection.create", "collection.update", "cms.upsert", "cms.remove", "locale.set", "site.update", "history.undo", "history.redo", "page.duplicate", "node.duplicate", "breakpoint.set", "breakpoint.remove", "extension.set", "extension.remove", "token.define", "textpreset.set", "textpreset.apply", "component.detach", "component.configure", "component.props", "component.reset", "component.variant", "component.slot", "library.import", "library.update", "library.detach", "cms.query", "cms.binding", "cms.localize", "cms.replace", "site.replace", "page.bulk", "table.insert", "table.row.add", "table.row.remove", "table.col.add", "table.col.remove", "cms.reorder", "cms.move", "cms.folder", "cms.list", "slider.create", "layout.convert", "text.script", "form.steps", "motion.set", "motion.remove", "design.set", "motion.track", "variables.set", "variables.remove", "code.instance.set", "code.instance.remove", "code.section.set", "code.section.remove", "code.sections.allow", "node.paste", "page.move"];

pub struct Engine {
    pub site: Site,
    pub revision: u64,
    undo: Vec<Site>,
    redo: Vec<Site>,
}

impl Engine {
    pub fn new() -> Result<Self, String> {
        Ok(Self { site: fresh_site("Untitled website")?, revision: 0, undo: vec![], redo: vec![] })
    }

    pub fn checkpoint(&self) -> Value {
        json!({"schemaVersion":1,"site":self.site,"revision":self.revision,"undo":self.undo,"redo":self.redo})
    }

    pub fn restore(&mut self, checkpoint: &Value, expected: Option<u64>, restore_revision: Option<u64>) -> Result<Value, String> {
        self.check_revision(expected)?;
        if checkpoint.as_object().ok_or("checkpoint must be object")?.keys().any(|k|!["schemaVersion","site","revision","undo","redo"].contains(&k.as_str()))||checkpoint.get("schemaVersion").and_then(Value::as_u64)!=Some(1) || serde_json::to_vec(checkpoint).map_err(|e|e.to_string())?.len()>32*1024*1024 { return Err("invalid checkpoint schema or size".into()); }
        let site:Site=serde_json::from_value(checkpoint.get("site").ok_or("checkpoint site missing")?.clone()).map_err(|e|e.to_string())?;
        let undo:Vec<Site>=serde_json::from_value(checkpoint.get("undo").ok_or("checkpoint undo missing")?.clone()).map_err(|e|e.to_string())?;
        let redo:Vec<Site>=serde_json::from_value(checkpoint.get("redo").ok_or("checkpoint redo missing")?.clone()).map_err(|e|e.to_string())?;
        let revision=checkpoint.get("revision").and_then(Value::as_u64).ok_or("checkpoint revision missing")?;
        if undo.len()>100||redo.len()>100||revision==u64::MAX||restore_revision==Some(u64::MAX) {return Err("checkpoint history or revision exceeds limit".into());}
        validate(&site)?;for document in undo.iter().chain(&redo){validate(document)?;if document.id!=site.id{return Err("checkpoint history belongs to another site".into());}}
        self.site=site;self.undo=undo;self.redo=redo;self.revision=restore_revision.unwrap_or_else(||(self.revision+1).max(revision));
        Ok(self.state())
    }

    fn trim_history(&mut self) {
        let mut total=serde_json::to_vec(&self.site).map(|v|v.len()).unwrap_or(0);
        total+=self.undo.iter().chain(&self.redo).map(|site|serde_json::to_vec(site).map(|v|v.len()).unwrap_or(0)).sum::<usize>();
        while total>31*1024*1024&&!self.undo.is_empty(){total-=serde_json::to_vec(&self.undo.remove(0)).map(|v|v.len()).unwrap_or(0);}
        while total>31*1024*1024&&!self.redo.is_empty(){total-=serde_json::to_vec(&self.redo.remove(0)).map(|v|v.len()).unwrap_or(0);}
    }

    /// Read-only: a self-contained fragment of one element's subtree (see `advanced::fragment`).
    pub fn fragment(&self, id: &str) -> Result<Value, String> {
        advanced::fragment(&self.site, id)
    }

    pub fn state(&self) -> Value {
        json!({"site": self.site, "revision": self.revision, "canUndo": !self.undo.is_empty(), "canRedo": !self.redo.is_empty()})
    }

    pub fn reset(&mut self, name: &str, blank: bool) -> Result<Value, String> {
        let mut candidate = fresh_site(name)?;
        if blank { let id = candidate.id.clone(); candidate = formweb_model::blank(name); candidate.id = id; }
        validate(&candidate)?;
        let revision=self.revision.checked_add(1).ok_or("revision exhausted")?;
        self.site = candidate;
        self.revision = revision;
        self.undo.clear();
        self.redo.clear();
        Ok(self.state())
    }

    pub fn load(&mut self, value: Value, restore_revision: Option<u64>) -> Result<Value, String> {
        let candidate: Site = serde_json::from_value(value).map_err(|e| format!("invalid document: {e}"))?;
        validate(&candidate)?;
        if restore_revision == Some(u64::MAX) { return Err("restoreRevision exceeds supported revision range".into()); }
        let revision=match restore_revision{Some(revision)=>revision,None=>self.revision.checked_add(1).ok_or("revision exhausted")?};
        self.site = candidate;
        self.revision = revision;
        self.undo.clear();
        self.redo.clear();
        Ok(self.state())
    }

    fn check_revision(&self, expected: Option<u64>) -> Result<(), String> {
        if self.revision==u64::MAX{return Err("revision exhausted".into());}
        if let Some(expected) = expected {
            if expected != self.revision { return Err(format!("revision conflict: expected {expected}, current {}", self.revision)); }
        }
        Ok(())
    }

    pub fn execute(&mut self, command: &str, params: &Value, expected: Option<u64>) -> Result<Value, String> {
        self.check_revision(expected)?;
        if command == "history.undo" {
            let previous = self.undo.last().ok_or("nothing to undo")?.clone();
            self.redo.push(self.site.clone());
            self.undo.pop();
            self.site = previous;
            self.revision += 1;
            return Ok(self.state());
        }
        if command == "history.redo" {
            let next = self.redo.last().ok_or("nothing to redo")?.clone();
            self.undo.push(self.site.clone());
            self.redo.pop();
            self.site = next;
            self.revision += 1;
            return Ok(self.state());
        }
        self.batch(&[json!({"command": command, "params": params})], expected)
    }

    pub fn batch(&mut self, commands: &[Value], expected: Option<u64>) -> Result<Value, String> {
        self.check_revision(expected)?;
        if commands.is_empty() || commands.len() > 4000 { return Err("batch needs 1 to 4000 commands".into()); }
        let mut candidate = self.site.clone();
        // Linked components need their instances materialized between commands; any other batch synchronizes once at
        // its end, which leaves the same document and keeps a whole starter site inside the engine's request limit.
        let stepwise = commands.iter().any(|entry| entry.get("command").and_then(Value::as_str).map(|c| c.starts_with("component.")).unwrap_or(false));
        advanced::clear_warnings();
        formweb_model::advanced::defer_extension_checks(true);
        let applied = (|| -> Result<(), String> {
            for entry in commands {
                let command = string(entry, "command")?;
                if command.starts_with("history.") { return Err("history commands cannot be batched".into()); }
                let params = entry.get("params").ok_or("command params are required")?;
                advanced::before_command(&mut candidate, command, params)?;
                apply(&mut candidate, command, params)?;
                if stepwise { advanced::synchronize(&mut candidate)?; }
            }
            if !stepwise { advanced::synchronize(&mut candidate)?; }
            Ok(())
        })();
        formweb_model::advanced::defer_extension_checks(false);
        applied?;
        formweb_model::advanced::validate_extensions_now(&candidate)?;
        validate(&candidate)?;
        if candidate != self.site {
            self.undo.push(self.site.clone());
            if self.undo.len() > 100 { self.undo.remove(0); }
            self.redo.clear();
            self.site = candidate;
            self.revision += 1;
        }
        self.trim_history();
        let mut state = self.state();
        let warnings = advanced::take_warnings();
        if !warnings.is_empty() { state["warnings"] = json!(warnings); }
        Ok(state)
    }
}

fn fresh_site(name: &str) -> Result<Site, String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|error| format!("cannot create a unique site identity: {error}"))?;
    let entropy = bytes.iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    let mut site = starter(name);
    site.id = format!("site-{entropy}");
    Ok(site)
}

fn string<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
    params.get(key).and_then(Value::as_str).ok_or_else(|| format!("{key} must be a string"))
}

fn object<'a>(params: &'a Value, key: &str) -> Result<&'a serde_json::Map<String, Value>, String> {
    params.get(key).and_then(Value::as_object).ok_or_else(|| format!("{key} must be an object"))
}

fn fresh_id(site: &Site, prefix: &str) -> String {
    for index in 1..100001 {
        let id = format!("{prefix}-{index}");
        if !site.nodes.contains_key(&id) && !site.components.contains_key(&id) && !site.collections.contains_key(&id) && !site.pages.iter().any(|p| p.id == id) { return id; }
    }
    "capacity-exceeded".into()
}

fn descendants(site: &Site, id: &str) -> Result<BTreeSet<String>, String> {
    let mut output = BTreeSet::new();
    let mut pending = vec![id.to_string()];
    while let Some(id) = pending.pop() {
        if !output.insert(id.clone()) { return Err("cycle or repeated child in subtree".into()); }
        let node = site.nodes.get(&id).ok_or_else(|| format!("unknown node {id}"))?;
        pending.extend(node.children.iter().cloned());
    }
    Ok(output)
}

fn parent_of(site: &Site, id: &str) -> Option<String> {
    site.nodes.values().find(|n| n.children.iter().any(|c| c == id)).map(|n| n.id.clone())
}

pub fn address_key(slug: &str) -> String {
    slug.trim_matches('/').to_lowercase()
}

fn address_free(site: &Site, slug: &str, except: Option<&str>) -> Result<(), String> {
    let key = address_key(slug);
    match site.pages.iter().find(|p| Some(p.id.as_str()) != except && address_key(&p.slug) == key) {
        Some(owner) if owner.slug.trim_matches('/') == slug.trim_matches('/') => Err(format!("/{} is already the address of {}. Choose another address.", slug.trim_matches('/'), owner.name)),
        Some(owner) => Err(format!("/{} is the same address as /{}, which {} uses: addresses that differ only in capital letters are the same folder on macOS and Windows. Choose another address.", slug.trim_matches('/'), owner.slug.trim_matches('/'), owner.name)),
        None => Ok(()),
    }
}

fn guard_structure(site: &Site, affected: &[&str]) -> Result<(), String> {
    for id in affected {
        if site.nodes.get(*id).and_then(|n| n.component_source_id.as_ref()).is_some() { return Err("detach is not available; linked instance structure cannot be edited".into()); }
    }
    Ok(())
}

fn apply(site: &mut Site, command: &str, params: &Value) -> Result<(), String> {
    if !params.is_object() { return Err("command params must be an object".into()); }
    match command {
        "node.add" => {
            let parent = string(params, "parent")?.to_string();
            guard_structure(site, &[&parent])?;
            let value = params.get("node").ok_or("node is required")?.clone();
            let mut raw = value.as_object().ok_or("node must be an object")?.clone();
            if !raw.contains_key("id") { raw.insert("id".into(), Value::String(fresh_id(site, "node"))); }
            let node: Node = serde_json::from_value(Value::Object(raw)).map_err(|e| format!("invalid node: {e}"))?;
            if site.nodes.contains_key(&node.id) || !node.children.is_empty() || node.component_id.is_some() || node.component_source_id.is_some() || !node.overrides.is_empty() { return Err("new node must have a unique id, no children and no instance metadata".into()); }
            site.nodes.get_mut(&parent).ok_or("unknown parent")?.children.push(node.id.clone());
            site.nodes.insert(node.id.clone(), node);
        }
        "node.update" => {
            let id = string(params, "id")?.to_string();
            let patch = object(params, "patch")?;
            let mut node = site.nodes.get(&id).ok_or("unknown node")?.clone();
            if patch.keys().any(|k| !["tag", "name", "text", "attrs", "styles", "breakpoints", "binding", "interactions"].contains(&k.as_str())) { return Err("node patch contains immutable or unknown field".into()); }
            let instance = node.component_source_id.is_some();
            for (key, value) in patch {
                match key.as_str() {
                    "tag" => {
                        if instance { return Err("linked instance tag cannot be changed".into()); }
                        node.tag = value.as_str().ok_or("tag must be a string")?.into();
                    }
                    "name" => node.name = value.as_str().ok_or("name must be a string")?.into(),
                    "text" => node.text = value.as_str().ok_or("text must be a string")?.into(),
                    "attrs" => merge_strings(&mut node.attrs, value)?,
                    "styles" => merge_strings(&mut node.styles, value)?,
                    "breakpoints" => {
                        for (bp, values) in value.as_object().ok_or("breakpoints must be an object")? {
                            if values.is_null() { node.breakpoints.remove(bp); }
                            else { merge_strings(node.breakpoints.entry(bp.clone()).or_default(), values)?; }
                        }
                    }
                    "binding" => node.binding = if value.is_null() { None } else { Some(serde_json::from_value(value.clone()).map_err(|e| e.to_string())?) },
                    "interactions" => node.interactions = serde_json::from_value(value.clone()).map_err(|e| e.to_string())?,
                    _ => unreachable!(),
                }
                if instance && ["text", "attrs", "styles", "breakpoints", "interactions"].contains(&key.as_str()) && !node.overrides.contains(key) { node.overrides.push(key.clone()); }
                if instance && key == "binding" { return Err("linked instance binding cannot be changed".into()); }
            }
            site.nodes.insert(id.clone(), node.clone());
            if !instance {
                let roots = instance_roots(site);
                let attr_maps = component_attr_maps(site);
                let attrs_by_id: BTreeMap<_, _> = site.nodes.values().filter(|n|n.component_source_id.as_ref() == Some(&id)).map(|n|(n.id.clone(), linked_attrs(&node, &attr_maps[&roots[&n.id]]))).collect();
                for linked in site.nodes.values_mut().filter(|n| n.component_source_id.as_ref() == Some(&id)) {
                    if patch.contains_key("tag") { linked.tag = node.tag.clone(); }
                    if patch.contains_key("text") && !linked.overrides.iter().any(|k| k == "text") { linked.text = node.text.clone(); }
                    if patch.contains_key("attrs") && !linked.overrides.iter().any(|k| k == "attrs") { linked.attrs = attrs_by_id[&linked.id].clone(); }
                    if patch.contains_key("styles") && !linked.overrides.iter().any(|k| k == "styles") { linked.styles = node.styles.clone(); }
                    if patch.contains_key("breakpoints") && !linked.overrides.iter().any(|k| k == "breakpoints") { linked.breakpoints = node.breakpoints.clone(); }
                    if patch.contains_key("interactions") && !linked.overrides.iter().any(|k| k == "interactions") { linked.interactions = node.interactions.clone(); }
                    if patch.contains_key("binding") { linked.binding = node.binding.clone(); }
                }
            }
        }
        "node.remove" => {
            let id = string(params, "id")?;
            if site.pages.iter().any(|p| p.root == id) { return Err("use page.remove to remove a page root".into()); }
            let ids = descendants(site, id)?;
            let parent = parent_of(site, id).ok_or("node has no parent")?;
            guard_structure(site, &[&parent])?;
            if site.components.values().any(|c| ids.contains(&c.root)) { return Err("component source cannot be removed".into()); }
            site.nodes.get_mut(&parent).unwrap().children.retain(|c| c != id);
            for id in ids { site.nodes.remove(&id); }
        }
        "node.move" => {
            let id = string(params, "id")?.to_string();
            let parent = string(params, "parent")?.to_string();
            let old_parent = parent_of(site, &id).ok_or("page roots cannot be moved")?;
            guard_structure(site, &[&old_parent, &parent])?;
            if descendants(site, &id)?.contains(&parent) { return Err("cannot move a node into its own descendant".into()); }
            if !site.nodes.contains_key(&parent) { return Err("unknown destination parent".into()); }
            let index = params.get("index").map(|v| v.as_u64().ok_or("index must be a nonnegative integer")).transpose()?.unwrap_or(u64::MAX);
            site.nodes.get_mut(&old_parent).unwrap().children.retain(|c| c != &id);
            let children = &mut site.nodes.get_mut(&parent).unwrap().children;
            let target = if index == u64::MAX { children.len() } else { usize::try_from(index).map_err(|_| "index is out of range")? };
            if target > children.len() { return Err("index is outside destination children".into()); }
            children.insert(target, id);
        }
        "page.add" => {
            let name = string(params, "name")?;
            let slug = string(params, "slug")?;
            address_free(site, slug, None)?;
            // Optional caller-chosen ids let one batch add a page and then fill its root (generated sites, one undo step).
            let taken = |site: &Site, v: &str| site.nodes.contains_key(v) || site.components.contains_key(v) || site.collections.contains_key(v) || site.pages.iter().any(|p| p.id == v);
            let id = match params.get("id").and_then(Value::as_str) {
                Some(v) if identifier(v) && !taken(site, v) => v.to_string(),
                Some(_) => return Err("page id must be a new identifier".into()),
                None => fresh_id(site, "page"),
            };
            let root = match params.get("root").and_then(Value::as_str) {
                Some(v) if identifier(v) && v != id && !taken(site, v) => v.to_string(),
                Some(_) => return Err("page root id must be a new identifier".into()),
                None => fresh_id(site, "page-root"),
            };
            site.nodes.insert(root.clone(), blank_node(&root, "main", name, "", &[("min-height", "100vh"), ("padding", "64px"), ("font-family", "Arial, Helvetica, sans-serif")]));
            site.pages.push(Page { id, name: name.into(), slug: slug.into(), root, seo: Seo { title: name.into(), description: String::new(), noindex: false } });
        }
        "page.update" => {
            let id = string(params, "id")?;
            let patch = object(params, "patch")?;
            if let Some(slug) = patch.get("slug").and_then(Value::as_str) {
                let old = site.pages.iter().find(|p| p.id == id).ok_or("unknown page")?;
                if old.slug.trim_matches('/') != slug.trim_matches('/') { address_free(site, slug, Some(id))?; }
            }
            let page = site.pages.iter_mut().find(|p| p.id == id).ok_or("unknown page")?;
            for (key, value) in patch {
                match key.as_str() {
                    "name" => page.name = value.as_str().ok_or("name must be a string")?.into(),
                    "slug" => page.slug = value.as_str().ok_or("slug must be a string")?.into(),
                    "seo" => {
                        for (key, value) in value.as_object().ok_or("seo must be an object")? {
                            match key.as_str() {
                                "title" => page.seo.title = value.as_str().ok_or("title must be a string")?.into(),
                                "description" => page.seo.description = value.as_str().ok_or("description must be a string")?.into(),
                                "noindex" => page.seo.noindex = value.as_bool().ok_or("noindex must be a boolean")?,
                                _ => return Err("unknown SEO field".into()),
                            }
                        }
                    }
                    _ => return Err("page patch contains immutable or unknown field".into()),
                }
            }
        }
        "page.remove" => {
            let id = string(params, "id")?;
            if site.pages.len() < 2 { return Err("the final page cannot be removed".into()); }
            let page = site.pages.iter().find(|p| p.id == id).ok_or("unknown page")?;
            let ids = descendants(site, &page.root)?;
            if site.components.values().any(|c| ids.contains(&c.root)) { return Err("page contains a component source".into()); }
            site.pages.retain(|p| p.id != id);
            for id in ids { site.nodes.remove(&id); }
        }
        "page.move" => {
            let id = string(params, "id")?;
            let from = site.pages.iter().position(|p| p.id == id).ok_or("unknown page")?;
            let index = params.get("index").ok_or("index is required")?.as_u64().ok_or("index must be a nonnegative integer")?;
            let target = usize::try_from(index).map_err(|_| "index is out of range")?;
            if target >= site.pages.len() { return Err("index is outside the page list".into()); }
            if target == from { return Err("the page is already at that index".into()); }
            let page = site.pages.remove(from);
            site.pages.insert(target, page);
        }
        "token.set" => {
            let name = string(params, "name")?;
            let value = params.get("value").ok_or("value is required")?;
            if value.is_null() { site.tokens.remove(name); }
            else { site.tokens.insert(name.into(), value.as_str().ok_or("value must be a string or null")?.into()); }
        }
        "component.create" => {
            let id = params.get("id").and_then(Value::as_str).map(String::from).unwrap_or_else(|| fresh_id(site, "component"));
            let name = string(params, "name")?;
            let root = string(params, "root")?;
            if !identifier(&id) || site.components.contains_key(&id) || !site.nodes.contains_key(root) { return Err("component needs a unique id and existing root".into()); }
            let ids = descendants(site, root)?;
            if ids.iter().any(|id| site.nodes[id].component_source_id.is_some()) { return Err("nested linked component sources are not supported".into()); }
            site.components.insert(id.clone(), Component { id, name: name.into(), root: root.into() });
        }
        "component.insert" => {
            let id = string(params, "component")?;
            let parent = string(params, "parent")?.to_string();
            guard_structure(site, &[&parent])?;
            let component = site.components.get(id).ok_or("unknown component")?.clone();
            if descendants(site, &component.root)?.contains(&parent) { return Err("a component cannot contain its own instance".into()); }
            if !site.nodes.contains_key(&parent) { return Err("unknown instance parent".into()); }
            let root = clone_instance(site, &component.root, &component.id, true)?;
            site.nodes.get_mut(&parent).unwrap().children.push(root.clone());
            let attr_maps = component_attr_maps(site);
            let updates: Vec<_> = descendants(site, &root)?.iter().map(|id| {
                let node = &site.nodes[id];
                (id.clone(), linked_attrs(&site.nodes[node.component_source_id.as_ref().unwrap()], &attr_maps[&root]))
            }).collect();
            for (id, attrs) in updates { site.nodes.get_mut(&id).unwrap().attrs = attrs; }
        }
        "collection.create" => {
            let id = params.get("id").and_then(Value::as_str).map(String::from).unwrap_or_else(|| fresh_id(site, "collection"));
            if site.collections.contains_key(&id) { return Err("collection id already exists".into()); }
            let fields = serde_json::from_value(params.get("fields").ok_or("fields are required")?.clone()).map_err(|e| e.to_string())?;
            site.collections.insert(id.clone(), Collection { id, name: string(params, "name")?.into(), fields, items: vec![] });
        }
        "cms.upsert" => {
            let id = string(params, "collection")?;
            let item: Item = serde_json::from_value(params.get("item").ok_or("item is required")?.clone()).map_err(|e| e.to_string())?;
            let collection = site.collections.get_mut(id).ok_or("unknown collection")?;
            if collection.items.iter().find(|i| i.id == item.id).map(|i| i.slug != item.slug).unwrap_or(true) {
                if let Some(other) = collection.items.iter().find(|i| i.id != item.id && i.slug.to_lowercase() == item.slug.to_lowercase()) {
                    return Err(format!("The item slug {} is already used by the item {} in {}; slugs that differ only in capital letters are the same address. Choose another slug.", item.slug, other.id, collection.name));
                }
            }
            if let Some(existing) = collection.items.iter_mut().find(|i| i.id == item.id) { *existing = item; }
            else { collection.items.push(item); }
        }
        "cms.remove" => {
            let collection = string(params, "collection")?;
            let id = string(params, "id")?;
            let collection = site.collections.get_mut(collection).ok_or("unknown collection")?;
            if !collection.items.iter().any(|i| i.id == id) { return Err("unknown CMS item".into()); }
            collection.items.retain(|i| i.id != id);
        }
        "locale.set" => {
            let locale = string(params, "locale")?;
            let translations: Strings = serde_json::from_value(params.get("translations").ok_or("translations are required")?.clone()).map_err(|e| e.to_string())?;
            site.locales.insert(locale.into(), translations);
        }
        "site.update" => {
            let patch = object(params, "patch")?;
            for (key, value) in patch {
                match key.as_str() {
                    "name" => site.name = value.as_str().ok_or("name must be a string")?.into(),
                    "defaultLocale" => site.default_locale = value.as_str().ok_or("defaultLocale must be a string")?.into(),
                    "settings" => merge_strings(&mut site.settings, value)?,
                    "breakpoints" => site.breakpoints = serde_json::from_value(value.clone()).map_err(|e| e.to_string())?,
                    _ => return Err("site patch contains immutable or unknown field".into()),
                }
            }
        }
        _ => advanced::apply(site, command, params)?,
    }
    Ok(())
}

fn merge_strings(target: &mut Strings, patch: &Value) -> Result<(), String> {
    for (key, value) in patch.as_object().ok_or("string map patch must be an object")? {
        if value.is_null() { target.remove(key); }
        else { target.insert(key.clone(), value.as_str().ok_or("map values must be strings or null")?.into()); }
    }
    Ok(())
}

fn clone_instance(site: &mut Site, source: &str, component: &str, root: bool) -> Result<String, String> {
    let mut node = site.nodes.get(source).ok_or("missing component node")?.clone();
    if node.component_source_id.is_some() { return Err("nested linked components are not supported".into()); }
    let id = fresh_id(site, "instance");
    let original_children = node.children.clone();
    node.id = id.clone();
    node.children.clear();
    node.attrs.remove("id");
    node.component_source_id = Some(source.into());
    node.component_id = if root { Some(component.into()) } else { None };
    node.overrides.clear();
    site.nodes.insert(id.clone(), node);
    for child in original_children {
        let child_id = clone_instance(site, &child, component, false)?;
        site.nodes.get_mut(&id).unwrap().children.push(child_id);
    }
    Ok(id)
}

pub fn audit(site: &Site) -> Value {
    let mut issues = vec![];
    let mut html_ids = BTreeMap::new();
    for page in &site.pages {
        if page.seo.title.trim().is_empty() { issues.push(json!({"severity":"warning","code":"seo.title","page":page.id,"message":format!("{} needs a page title", page.name)})); }
        if page.seo.description.trim().is_empty() { issues.push(json!({"severity":"warning","code":"seo.description","page":page.id,"message":format!("{} needs a meta description", page.name)})); }
        if let Ok(ids) = descendants(site, &page.root) {
            let headings = ids.iter().filter(|id| site.nodes[*id].tag == "h1").count();
            if headings != 1 { issues.push(json!({"severity":"warning","code":"a11y.h1","node":page.root,"message":format!("{} has {headings} h1 headings; prefer one", page.name)})); }
            for id in ids {
                if let Some(html_id) = site.nodes[&id].attrs.get("id") {
                    if html_ids.insert((page.id.clone(), html_id.clone()), id.clone()).is_some() { issues.push(json!({"severity":"warning","code":"a11y.duplicate-id","node":id,"message":"HTML id is duplicated on this page"})); }
                }
            }
        }
    }
    let mut addresses: BTreeMap<String, &Page> = BTreeMap::new();
    for page in &site.pages {
        match addresses.get(&address_key(&page.slug)) {
            Some(first) => issues.push(json!({"severity":"warning","code":"page.address-case","page":page.id,"message":format!("{} and {} use the addresses /{} and /{}, which differ only in capital letters and are the same folder on macOS and Windows. Give {} another address.", first.name, page.name, first.slug.trim_matches('/'), page.slug.trim_matches('/'), page.name)})),
            None => { addresses.insert(address_key(&page.slug), page); }
        }
    }
    for node in site.nodes.values() {
        if node.tag == "img" && !node.attrs.contains_key("alt") { issues.push(json!({"severity":"warning","code":"a11y.alt","node":node.id,"message":"Image needs alt text (empty alt is valid for decoration)"})); }
        if node.tag == "a" && node.attrs.get("data-fw-slot").map(String::as_str) != Some("link") && node.attrs.get("href").map(|s| s.is_empty() || s == "#").unwrap_or(true) { issues.push(json!({"severity":"warning","code":"link.placeholder","node":node.id,"message":"Link needs a destination"})); }
        if ["input", "select", "textarea"].contains(&node.tag.as_str()) && node.attrs.get("type").map(String::as_str) != Some("hidden") {
            let has_label = node.attrs.contains_key("aria-label") || node.attrs.contains_key("aria-labelledby") || node.attrs.get("id").map(|id| site.nodes.values().any(|n| n.tag == "label" && n.attrs.get("for") == Some(id))).unwrap_or(false) || parent_of(site, &node.id).map(|id| site.nodes[&id].tag == "label").unwrap_or(false);
            if !has_label { issues.push(json!({"severity":"warning","code":"a11y.form-label","node":node.id,"message":"Form control needs an associated label"})); }
        }
        if let Some(src) = node.attrs.get("src") {
            if src.starts_with("https://") || src.starts_with("http://") { issues.push(json!({"severity":"info","code":"asset.remote","node":node.id,"message":"Export refers to a remote asset; asset is not downloaded into the ZIP"})); }
        }
        if node.interactions.iter().any(|i| i.trigger == "hover") { issues.push(json!({"severity":"info","code":"interaction.hover","node":node.id,"message":"Verify hover interactions also have an accessible keyboard/touch path"})); }
    }
    if site.settings.get("baseUrl").map(|v| v.trim_end_matches('/')).unwrap_or("https://example.com") == "https://example.com" { issues.push(json!({"severity":"warning","code":"seo.base-url","message":"Set the real public base URL before deployment"})); }
    if site.settings.get("baseUrl").map(|v| v.trim_end_matches('/')).unwrap_or("https://example.com") == "https://example.com" && site.pages.iter().any(|p| p.slug.trim_matches('/') == "404") { issues.push(json!({"severity":"warning","code":"seo.base-url-404","message":"The 404 page links its styles and pages from / because the base URL is still example.com. Set the base URL to the site's public address before you deploy it under a path."})); }
    wishlist::audit(site, &mut issues);
    json!({"issues": issues, "counts": {"pages": site.pages.len(), "nodes": site.nodes.len(), "components":site.components.len(), "collections":site.collections.len(), "cmsItems":site.collections.values().map(|c|c.items.len()).sum::<usize>(), "locales":site.locales.len()}})
}
