use crate::{cms, code, escape, routing, subtree_ids, RenderContext, Renderer};
use formweb_model::{safe_url, Node, Site, Strings};
use serde_json::{json, Value};
use std::collections::{BTreeMap,BTreeSet};

pub fn json_script(value: &Value) -> String { value.to_string().replace('<', "\\u003c").replace('>', "\\u003e").replace('&', "\\u0026") }
/// Custom code (FW-178) for one page: [head, body start, body end], site-wide code first, then the page's own. Written verbatim, as the author typed it.
fn custom_code(site:&Site,page:&str)->[String;3] { let group=site.extensions.get("code");let mut out=[String::new(),String::new(),String::new()];for scope in [group.and_then(|g|g.get("siteCode")),group.and_then(|g|g.get("pageCode")).and_then(|p|p.get(page))].into_iter().flatten(){for(i,key)in ["head","bodyStart","bodyEnd"].iter().enumerate(){if let Some(text)=scope.get(*key).and_then(Value::as_str){out[i].push_str(text);}}}out }
pub fn export(site: &Site, params: &Value) -> Result<Value, String> {
    let locale = params.get("locale").and_then(Value::as_str).unwrap_or(&site.default_locale);
    if locale != site.default_locale && !site.locales.contains_key(locale) { return Err("unknown locale".into()); }
    let all = params.get("allLocales").and_then(Value::as_bool).unwrap_or_else(|| site.extensions.get("localization").and_then(|v| v.get("allLocales")).and_then(Value::as_bool).unwrap_or(false));
    let base = params.get("baseUrl").and_then(Value::as_str).or_else(|| site.settings.get("baseUrl").map(String::as_str)).unwrap_or("https://example.com").trim_end_matches('/');
    let forms = params.get("formsEndpoint").and_then(Value::as_str).unwrap_or("").trim_end_matches('/');
    if !safe_url(base) || !(base.starts_with("https://") || base.starts_with("http://")) { return Err("baseUrl must be an http(s) URL".into()); }
    if !forms.is_empty() && (!safe_url(forms) || !(forms.starts_with("https://") || forms.starts_with("http://"))) { return Err("formsEndpoint must be an http(s) URL".into()); }
    let gated = site.extensions.get("integrations").and_then(|v| v.get("gates")).and_then(Value::as_array).map(|v| !v.is_empty()).unwrap_or(false);
    if gated && params.get("privateMembers").and_then(Value::as_bool) != Some(true) { return Err("Gated sites require an authenticated backend publication; public static export would expose private content".into()); }
    let routes = routing::plan(site, locale, all)?;
    let mut warnings = BTreeSet::new();
    if base == "https://example.com" { warnings.insert("Set the public base URL before deploying canonical URLs and sitemap".to_string()); }
    if gated { warnings.insert("Private routes require backend membership authorization before serving; editable source JSON is omitted".into()); }
    let mut files = vec![json!({"path":"assets/site.css","content":crate::route_styles::base(site)}),json!({"path":"assets/runtime.js","content":format!("{}{}{}{}{}",include_str!("runtime.js"),crate::wishlist::SCRIPT,crate::embed::GATE_RUNTIME,crate::EFFECTS_RUNTIME,motion_runtime(site))})];
    files.extend(code::files(site)?);
    files.extend(crate::sections::files(site));
    let mut asset_access:BTreeMap<String,BTreeSet<String>>=BTreeMap::new();
    let mut sitemap = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\">\n");
    for (route_index,route) in routes.iter().enumerate() {
        let prefix = route.prefix();
        let css_path=format!("assets/pages/{route_index}.css");
        files.push(json!({"path":css_path,"content":crate::route_styles::render(site,&route.page.root)}));
        let links = routing::links(site, route, &routes);
        let mut records = vec![];
        let mut renderer = Renderer { site, locale:&route.locale,forms,prefix:&prefix,warnings:&mut warnings,interactions:&mut records,budget:250000,links:Some(&links) };
        let ids = subtree_ids(site, &route.page.root);
        let suffix = route.item.as_ref().map(|i| format!("-{}-{}", route.collection.as_deref().unwrap_or("item"),i.id)).unwrap_or_default();
        let ids: Strings = ids.into_iter().map(|id| { let mapped = format!("{id}{suffix}"); (id,mapped) }).collect();
        let context = route.collection.as_deref().zip(route.item.as_ref()).map(|(collection,item)|RenderContext { collection,item,ids:&ids,suffix:&suffix });
        let body = format!("{}{}", renderer.foreign_symbols(&route.page.root)?, renderer.node(&route.page.root,context,None)?);
        let (title,description,json_ld) = routing::metadata(site,route);
        let canonical = route.canonical(base);
        let alternates = routing::alternates(route,&routes,base);
        let json_ld = json_ld.map(|v|format!("<script type=\"application/ld+json\">{}</script>",json_script(&v))).unwrap_or_default();
        let robots = if route.page.seo.noindex { "<meta name=\"robots\" content=\"noindex,nofollow\">" } else { "" };
        let mut context = json!({"site":site.id});
        if let Some(path) = forms.split("/published/").nth(1) { let mut segments = path.split('/');context["slug"]=json!(segments.next().unwrap_or(""));context["version"]=json!(segments.next().unwrap_or("")); }
        if let Some(token) = forms.split("/preview/").nth(1) { context["previewToken"]=json!(token.split('/').next().unwrap_or("")); }
        let config = crate::scope::configuration(site,&route.page.root,records,context,&links,&prefix);
        let code = custom_code(site,&route.page.id);
        let boot = boot_script(site);
        let html = format!("<!doctype html>\n<html lang=\"{}\"><head><meta charset=\"utf-8\">{}<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{}</title><meta name=\"description\" content=\"{}\"><link rel=\"canonical\" href=\"{}\"><meta property=\"og:title\" content=\"{}\"><meta property=\"og:description\" content=\"{}\"><meta property=\"og:url\" content=\"{}\"><meta property=\"og:type\" content=\"website\">{}{}{}{}<link rel=\"stylesheet\" href=\"{}{}\"><script src=\"{}assets/runtime.js\" defer></script>{}</head><body>{}<a class=\"fw-skip\" href=\"#fw-main\">Skip to content</a><div id=\"fw-main\" tabindex=\"-1\">{}</div><script type=\"application/json\" id=\"fw-config\">{}</script>{}</body></html>\n",escape(&route.locale),boot,escape(&title),escape(&description),escape(&canonical),escape(&title),escape(&description),escape(&canonical),robots,alternates,json_ld,crate::icons(site,&prefix),prefix,css_path,prefix,code[0],code[1],body,json_script(&config),code[2]);
        asset_access.entry(css_path.clone()).or_default().insert(route.page.id.clone());
        if let Some(components)=site.extensions.get("code").and_then(|v|v.get("components")).and_then(Value::as_object){for id in components.keys(){if body.contains(&format!("data-fw-code=\"{id}\"")){asset_access.entry(format!("assets/components/{id}.html")).or_default().insert(route.page.id.clone());}if body.contains(&format!("data-fw-component=\"{id}\"")){asset_access.entry(format!("assets/components/{id}.js")).or_default().insert(route.page.id.clone());}}}
        for node in crate::sections::used(site){if body.contains(&format!("assets/sections/{node}.js")){asset_access.entry(format!("assets/sections/{node}.js")).or_default().insert(route.page.id.clone());}}
        files.push(json!({"path":route.path(),"content":html}));
        if !route.page.seo.noindex {
            sitemap.push_str(&format!("<url><loc>{}</loc>",escape(&canonical)));
            for alternate in routes.iter().filter(|r|r.page.id==route.page.id&&r.item.as_ref().map(|i|&i.id)==route.item.as_ref().map(|i|&i.id)) { sitemap.push_str(&format!("<xhtml:link rel=\"alternate\" hreflang=\"{}\" href=\"{}\"/>",escape(&alternate.locale),escape(&alternate.canonical(base)))); }
            sitemap.push_str("</url>\n");
        }
    }
    sitemap.push_str("</urlset>\n");
    files.push(json!({"path":"sitemap.xml","content":sitemap}));
    let mut robots = String::from("User-agent: *\n");
    let rules = site.extensions.get("seo").and_then(|v|v.get("robots"));
    let allow = rules.and_then(|v|v.get("allow")).and_then(Value::as_array);
    if let Some(allow)=allow { for path in allow.iter().filter_map(Value::as_str) { robots.push_str(&format!("Allow: {path}\n")); } } else { robots.push_str("Allow: /\n"); }
    if let Some(disallow)=rules.and_then(|v|v.get("disallow")).and_then(Value::as_array) { for path in disallow.iter().filter_map(Value::as_str) { robots.push_str(&format!("Disallow: {path}\n")); } }
    robots.push_str(&format!("Sitemap: {base}/sitemap.xml\n"));
    files.push(json!({"path":"robots.txt","content":robots}));
    if !gated { files.push(json!({"path":"site.formweb.json","content":serde_json::to_string_pretty(site).map_err(|e|e.to_string())?})); }
    if let Some(manifest)=crate::web_manifest(site) { files.push(manifest); }
    if let Some(redirects)=site.extensions.get("seo").and_then(|v|v.get("redirects")) { files.push(json!({"path":"redirects.json","content":redirects.to_string()})); }
    let route_manifest: Vec<_> = routes.iter().enumerate().map(|(index,r)|json!({"path":r.path(),"page":r.page.id,"locale":r.locale,"item":r.item.as_ref().map(|i|&i.id),"stylesheet":format!("assets/pages/{index}.css")})).collect();
    files.push(json!({"path":"routes.json","content":serde_json::to_string(&route_manifest).map_err(|e|e.to_string())?}));
    if let Some(index)=crate::search::index(site,&routes) { files.push(json!({"path":"search-index.json","content":index})); }
    files.push(json!({"path":"asset-access.json","content":json!({"schemaVersion":1,"assets":asset_access}).to_string()}));
    files.push(json!({"path":"README.txt","content":"FormWeb static output. Serve over HTTP. Owned assets are bundled by the backend. Browser integrations require the configured backend and do not embed credentials. Isolated code frames cannot access the parent or network. Gated output must be served by an authorizing backend. Keep native .fweb source separately."}));
    Ok(json!({"files":files,"warnings":warnings.into_iter().collect::<Vec<_>>(),"routes":route_manifest}))
}
pub fn styles(site:&Site)->String {
    let mut css=String::from(":root{--fw-layer-dialog:300}.fw-widget{min-height:96px}.fw-widget-status,.fw-field-error{display:block;min-height:1.5em}.fw-pagination{display:flex;align-items:center;gap:12px;min-height:44px}.fw-pagination-output{min-width:8ch;font-variant-numeric:tabular-nums}dialog[data-fw-overlay]{position:fixed;z-index:var(--fw-layer-dialog);max-width:min(90vw,680px);max-height:90vh;overflow:auto;border:0;border-radius:12px;padding:24px}dialog::backdrop{background:rgb(0 0 0 / .5)}[data-fw-list]>[hidden]{display:none!important}\n");
    css.push_str("[data-fw-widget=fetch]{height:160px;overflow:auto}[data-fw-widget=product]{height:300px;overflow:auto}[data-fw-product-title]{min-height:2.5em}[data-fw-price]{min-height:1.5em}[data-fw-widget=member-login]{height:240px;overflow:auto}.fw-widget-status{height:3em;overflow:auto}\n");
    css.push_str(&crate::wishlist::css(site));
    if let Some(nodes)=site.extensions.get("behaviors").and_then(|v|v.get("nodes")).and_then(Value::as_object) {
        for(id,node)in nodes { if let Some(states)=node.get("states").and_then(Value::as_object) { for(state,styles)in states { let pseudo=match state.as_str(){"hover"=>":hover","focus"=>":focus-within","press"=>"[data-fw-press]",_=>continue};css.push_str(&format!("[data-fw-node=\"{id}\"]{pseudo}{{"));if let Some(styles)=styles.as_object(){for(key,value)in styles{if let Some(value)=value.as_str(){css.push_str(&format!("{key}:{value};"));}}}css.push_str("}\n"); } } }
    }
    css.push_str(&design_css(site));
    css.push_str(&motion_css(site));
    css
}
pub fn motion_runtime(site:&Site)->String {
    let motion=site.extensions.get("motion");let variables=site.extensions.contains_key("variables");
    let mut out=String::new();
    if motion.is_some() { out.push_str(include_str!("motion.js")); }
    if motion.is_some()||variables { out.push_str(include_str!("interact.js")); }
    if variables { out.push_str(include_str!("variables.js")); }
    let plays=|a:&Value|a.as_array().map(|a|a.iter().any(|x|matches!(x.get("action").and_then(Value::as_str),Some("search"|"play")))).unwrap_or(false);
    // Search and play actions live in motion.actions (0.19.1) as well as in behaviors; either one needs play.js.
    let played=site.nodes.keys().any(|id|site.extensions.get("behaviors").and_then(|v|v.get("nodes")).and_then(|v|v.get(id)).and_then(|n|n.get("actions")).map(plays).unwrap_or(false))
        ||motion.and_then(|g|g.get("actions")).and_then(Value::as_object).map(|m|m.values().any(plays)).unwrap_or(false);
    if motion.and_then(|g|g.get("scripts")).is_some()||played { out.push_str(include_str!("play.js")); }
    if code::uses_page(site) { out.push_str(include_str!("components.js")); }
    out
}
pub fn boot_script(site:&Site)->String {
    let themes=site.extensions.get("design").and_then(|v|v.get("themes"));let motion=site.extensions.contains_key("motion");
    let preload:String=site.extensions.get("design").and_then(|d|d.get("fonts")).and_then(Value::as_object).map(|fonts|fonts.values().filter_map(|f|f.get("src").and_then(Value::as_str)).filter(|s|s.ends_with(".woff2")&&safe_url(s)).map(|s|format!("<link rel=\"preload\" as=\"font\" type=\"font/woff2\" href=\"{}\" crossorigin>",escape(s))).collect()).unwrap_or_default();
    let variables=crate::variables::boot(site);
    if themes.is_none()&&!motion&&variables.is_empty() { return preload; }
    let mut script=String::from("<script>(function(){var d=document.documentElement;");
    if let Some(themes)=themes {
        let default=themes.get("default").and_then(Value::as_str).unwrap_or("dark");let follow=themes.get("followSystem").and_then(Value::as_bool).unwrap_or(false);
        script.push_str(&format!("var t=\"{default}\",s=null;try{{s=localStorage.getItem(\"fw-theme-{}\")}}catch(e){{}}if(s===\"dark\"||s===\"light\"){{t=s}}else if({follow}&&window.matchMedia){{t=matchMedia(\"(prefers-color-scheme: light)\").matches?\"light\":\"dark\"}}d.setAttribute(\"data-theme\",t);",site.id));
    }
    if motion { script.push_str("d.classList.add(window.matchMedia&&matchMedia(\"(prefers-reduced-motion: reduce)\").matches?\"fw-r\":\"fw-m\");"); }
    script.push_str(&variables);
    script.push_str("})();</script>");
    script.push_str(&preload);
    script
}
fn design_css(site:&Site)->String {
    let mut css=String::new();
    let Some(design)=site.extensions.get("design") else{return css};
    if let Some(properties)=design.get("properties").and_then(Value::as_object) { for(name,property)in properties {
        let syntax=property.get("syntax").and_then(Value::as_str).unwrap_or("*");let initial=property.get("initial").and_then(Value::as_str).map(|v|format!(";initial-value:{v}")).unwrap_or_default();
        css.push_str(&format!("@property --{name}{{syntax:'{syntax}';inherits:{}{initial}}}\n",property.get("inherits").and_then(Value::as_bool).unwrap_or(false)));
    } }
    let themes=design.get("themes");
    if let Some(themes)=themes {
        let default=themes.get("default").and_then(Value::as_str).unwrap_or("dark");let other=if default=="dark"{"light"}else{"dark"};
        if let Some(values)=themes.get("values").and_then(|v|v.get(other)).and_then(Value::as_object) {
            let kept:String=values.iter().filter(|(name,_)|site.tokens.keys().any(|k|k.trim_start_matches("--")==name.trim_start_matches("--"))).filter_map(|(name,value)|value.as_str().map(|v|format!("--{}:{v};",name.trim_start_matches("--")))).collect();
            if !kept.is_empty() { css.push_str(&format!("html[data-theme=\"{other}\"]{{{kept}}}\n")); }
        }
    }
    if themes.is_some()||site.nodes.values().any(|n|n.attrs.contains_key("data-fw-theme-only"))||crate::code::has_light_posters(site) {
        let default=themes.and_then(|t|t.get("default")).and_then(Value::as_str).unwrap_or("dark");
        css.push_str(&format!("html[data-theme=\"dark\"] [data-fw-theme-only=\"light\"],html[data-theme=\"light\"] [data-fw-theme-only=\"dark\"]{{display:none!important}}html:not([data-theme]) [data-fw-theme-only]:not([data-fw-theme-only=\"{default}\"]){{display:none!important}}\n"));
    }
    if let Some(fonts)=design.get("fonts").and_then(Value::as_object) { for font in fonts.values() {
        let text=|key:&str,fallback:&'static str|font.get(key).and_then(Value::as_str).unwrap_or(fallback).to_string();
        css.push_str(&format!("@font-face{{font-family:\"{}\";src:url(\"{}\") format(\"woff2\");font-weight:{};font-style:{};font-display:{}}}\n",text("family",""),text("src",""),text("weight","400"),text("style","normal"),text("display","optional")));
    } }
    css
}
fn motion_entries<'a>(site:&'a Site,kind:&str)->Vec<(&'a String,&'a Value)> { site.extensions.get("motion").and_then(|g|g.get(kind)).and_then(Value::as_object).map(|m|m.iter().filter(|(id,_)|site.nodes.contains_key(*id)).collect()).unwrap_or_default() }
fn declarations(styles:Option<&Value>)->String { styles.and_then(Value::as_object).map(|m|m.iter().filter_map(|(k,v)|v.as_str().map(|v|format!("{k}:{v};"))).collect()).unwrap_or_default() }
fn frame_state(frames:Option<&Value>,at:f64)->String {
    let list=frames.and_then(Value::as_array);
    let best=list.into_iter().flatten().filter_map(|f|Some((f.get("at")?.as_f64()?,f))).min_by(|a,b|(a.0-at).abs().partial_cmp(&(b.0-at).abs()).unwrap_or(std::cmp::Ordering::Equal).then(b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal)));
    declarations(best.and_then(|(_,f)|f.get("styles")))
}
fn motion_css(site:&Site)->String {
    let mut css=String::new();
    for(id,reveal)in motion_entries(site,"reveals") {
        let rule=declarations(reveal.get("from"));
        if !rule.is_empty() { css.push_str(&format!("html.fw-m [data-fw-node=\"{id}\"]{}:not([data-fw-in]){{{rule}}}\n",if reveal.get("children").and_then(Value::as_bool)==Some(true){">*"}else{""})); }
    }
    for(id,scene)in motion_entries(site,"scenes") {
        let offset=scene.get("offset").and_then(Value::as_str).map(|o|if o=="0"{"0px"}else{o}).unwrap_or("0px");let length=scene.get("length").and_then(Value::as_f64).unwrap_or(300.0);let reduced=scene.get("reducedAt").and_then(Value::as_f64).unwrap_or(1.0);
        css.push_str(&format!("[data-fw-node=\"{id}\"]{{position:relative;height:{length}svh}}\n"));
        if let Some(stage)=scene.get("stage").and_then(Value::as_str) { css.push_str(&format!("[data-fw-node=\"{stage}\"]{{position:sticky;top:{offset};height:calc(100svh - {offset});overflow:clip}}\n")); }
        let targets:Vec<(String,&Value)>=scene.get("tracks").and_then(Value::as_array).into_iter().flatten().filter_map(|t|Some((format!("[data-fw-node=\"{}\"]",t.get("node")?.as_str()?),t.get("keyframes")?))).chain(scene.get("distribute").and_then(Value::as_array).into_iter().flatten().filter_map(|d|Some((format!("[data-fw-node=\"{}\"]>*",d.get("parent")?.as_str()?),d.get("keyframes")?)))).collect();
        for(selector,frames)in targets {
            let start=frame_state(Some(frames),0.0);let end=frame_state(Some(frames),reduced);
            if !start.is_empty() { css.push_str(&format!("html.fw-m {selector}{{{start}}}\n")); }
            if !end.is_empty() { css.push_str(&format!("html.fw-r {selector}{{{end}}}\n")); }
        }
    }
    for(id,entry)in motion_entries(site,"loops") { if entry.get("type").and_then(Value::as_str)==Some("marquee") { css.push_str(&format!("[data-fw-node=\"{id}\"]{{overflow:clip}}\n")); } }
    for(id,_)in motion_entries(site,"drag") { css.push_str(&format!("[data-fw-node=\"{id}\"]{{touch-action:none}}\n")); }
    for(id,_)in motion_entries(site,"counters") { css.push_str(&format!("[data-fw-node=\"{id}\"]{{font-variant-numeric:tabular-nums}}\n")); }
    for panel in accordion_panels(site).keys() {
        css.push_str(&format!("[data-fw-node=\"{panel}\"]{{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s ease}}\n[data-fw-node=\"{panel}\"]>*{{min-height:0;overflow:hidden}}\n[data-fw-node=\"{panel}\"][data-fw-open]{{grid-template-rows:1fr}}\nhtml.fw-r [data-fw-node=\"{panel}\"]{{transition:none}}\n"));
    }
    css
}
fn accordion_panels(site:&Site)->BTreeMap<String,bool> {
    let mut panels=BTreeMap::new();
    for(_,entry)in motion_entries(site,"disclosure") {
        if entry.get("type").and_then(Value::as_str)!=Some("accordion") { continue; }
        let initial=entry.get("initial").and_then(Value::as_u64);
        for(index,item)in entry.get("items").and_then(Value::as_array).into_iter().flatten().enumerate() { if let Some(panel)=item.get("panel").and_then(Value::as_str).filter(|p|site.nodes.contains_key(*p)) { panels.insert(panel.to_string(),initial==Some(index as u64)); } }
    }
    panels
}
pub fn initially_open(site:&Site,node:&Node)->bool { accordion_panels(site).get(&node.id).copied().unwrap_or(false) }
pub fn wraps_panel(site:&Site,node:&Node)->bool { site.extensions.contains_key("motion")&&accordion_panels(site).contains_key(&node.id) }
pub fn script_form(site:&Site,node:&Node)->bool { node.tag=="form"&&site.extensions.get("forms").and_then(|g|g.get("forms")).and_then(|f|f.get(&node.id)).is_none()&&site.extensions.get("motion").and_then(|m|m.get("scripts")).and_then(|s|s.get(&node.id)).and_then(|s|s.get("trigger")).and_then(Value::as_str)==Some("submit") }
pub fn initially_hidden(site:&Site,node:&Node)->bool { motion_entries(site,"disclosure").into_iter().filter(|(_,e)|e.get("type").and_then(Value::as_str)==Some("tabs")).any(|(_,e)|{let initial=e.get("initial").and_then(Value::as_u64).unwrap_or(0);e.get("items").and_then(Value::as_array).into_iter().flatten().enumerate().any(|(i,item)|i as u64!=initial&&item.get("panel").and_then(Value::as_str)==Some(node.id.as_str()))}) }
pub fn wraps_track(site:&Site,node:&Node)->bool { site.extensions.get("motion").and_then(|g|g.get("loops")).and_then(|l|l.get(&node.id)).and_then(|l|l.get("type")).and_then(Value::as_str)==Some("marquee") }
pub fn text_html(site:&Site,node:&Node,text:&str)->String {
    let kind=site.extensions.get("motion").and_then(|g|g.get("text")).and_then(|t|t.get(&node.id));
    let Some(kind)=kind else{return escape(text)};
    let ty=kind.get("type").and_then(Value::as_str).unwrap_or("");
    if !["split","typewriter"].contains(&ty)||text.is_empty() { return escape(text); }
    let chars=ty=="typewriter"||kind.get("by").and_then(Value::as_str)==Some("chars");
    let mut out=String::new();let mut word=String::new();
    let flush=|word:&mut String,out:&mut String|{ if word.is_empty(){return;} out.push_str("<span class=\"fw-w\" style=\"display:inline-block\">"); if chars { for c in word.chars() { out.push_str(&format!("<span class=\"fw-c\" style=\"display:inline-block\">{}</span>",escape(&c.to_string()))); } } else { out.push_str(&escape(word)); } out.push_str("</span>"); word.clear(); };
    for c in text.chars() { if c.is_whitespace() { flush(&mut word,&mut out); out.push_str(&escape(&c.to_string())); } else { word.push(c); } }
    flush(&mut word,&mut out);
    out
}
pub fn attrs(site:&Site,node:&Node,locale:&str,attrs:&mut Strings) {
    if let Some(url)=site.extensions.get("localization").and_then(|v|v.get("assets")).and_then(|v|v.get(&node.id)).and_then(|v|v.get(locale)).and_then(Value::as_str) { attrs.insert(if node.tag=="video"{"poster"}else{"src"}.into(),url.into()); }
    if let Some(name)=attrs.get("name").cloned() { if let Some(forms)=site.extensions.get("forms").and_then(|v|v.get("forms")).and_then(Value::as_object) {
        for(form,config)in forms { if descendant(site,form,&node.id) { if let Some(key)=config.get("tracking").and_then(|v|v.get(&name)).and_then(Value::as_str) { attrs.insert("data-fw-track".into(),key.into()); } if let Some(constraint)=config.get("constraints").and_then(|v|v.get(&name)).and_then(Value::as_object) { for(key,value)in constraint { if matches!(key.as_str(),"preset"|"maxSize"){continue;} let attr=match key.as_str(){"minLength"=>"minlength","maxLength"=>"maxlength",other=>other};if attr=="required"{if value.as_bool()==Some(true){attrs.insert(attr.into(),String::new());}else{attrs.remove(attr);}}else{attrs.insert(attr.into(),cms::display(value));} } } } }
    } }
}
fn descendant(site:&Site,root:&str,target:&str)->bool { let mut pending=vec![root];while let Some(id)=pending.pop(){if id==target{return true;}if let Some(node)=site.nodes.get(id){pending.extend(node.children.iter().map(String::as_str));}}false }
pub fn record(site:&Site,node:&Node,id:&str,scope:&str)->Option<Value> {
    let config=site.extensions.get("behaviors").and_then(|v|v.get("nodes")).and_then(|v|v.get(&node.id));
    config.map(|config|json!({"id":id,"scope":scope,"actions":config.get("actions"),"conditions":config.get("conditions")}))
}
pub fn form_extra(site:&Site,node:&Node)->String {
    let mut output=crate::wishlist::form_steps(site,node);
    if let Some(tracking)=site.extensions.get("forms").and_then(|v|v.get("forms")).and_then(|v|v.get(&node.id)).and_then(|v|v.get("tracking")).and_then(Value::as_object) { for(name,key)in tracking{if let Some(key)=key.as_str(){let authored=site.nodes.values().any(|field|field.tag=="input"&&field.attrs.get("type").map(String::as_str)==Some("hidden")&&!field.attrs.contains_key("disabled")&&field.attrs.get("name")==Some(name)&&descendant(site,&node.id,&field.id));if !authored{output.push_str(&format!("<input type=\"hidden\" name=\"{}\" data-fw-track=\"{}\" value=\"\">",escape(name),escape(key)));}}} }
    output
}
pub fn overlay(site:&Site,node:&Node,scope:&str,body:String)->String {
    if let Some(overlays)=site.extensions.get("behaviors").and_then(|v|v.get("overlays")).and_then(Value::as_object) {
        for(id,config)in overlays { if config.get("node").and_then(Value::as_str)==Some(node.id.as_str()){let dismissible=config.get("dismissible").and_then(Value::as_bool).unwrap_or(true);let close=if dismissible{"<button type=\"button\" data-fw-close aria-label=\"Close dialog\">Close</button>"}else{""};return format!("<dialog data-fw-overlay=\"{}{}\" data-fw-overlay-key=\"{}\" data-fw-session-key=\"{}\" aria-label=\"{}\" data-fw-dismissible=\"{}\">{}{}</dialog>",escape(id),escape(scope),escape(id),escape(config.get("sessionKey").and_then(Value::as_str).unwrap_or("")),escape(config.get("label").and_then(Value::as_str).unwrap_or("Dialog")),dismissible,close,body); } }
    }
    body
}
pub fn widget(site:&Site,node:&Node)->String {
    let Some(config)=site.extensions.get("integrations").and_then(|v|v.get("widgets")).and_then(|v|v.get(&node.id))else{return String::new();};
    let kind=config.get("type").and_then(Value::as_str).unwrap_or("");
    let controls=match kind {
        "fetch"=>"<span data-fw-output></span>",
        "product"=>"<h3 data-fw-product-title></h3><p data-fw-price></p><label>Variant <select data-fw-variant></select></label><label>Quantity <input data-fw-quantity type=\"number\" min=\"1\" max=\"99\" value=\"1\"></label><button type=\"button\" data-fw-add>Add to cart</button>",
        "cart"=>"<p data-fw-cart-count>0 items</p><button type=\"button\" data-fw-clear>Clear cart</button>",
        "checkout"=>"<button type=\"button\" data-fw-checkout>Continue to hosted checkout</button>",
        "member-login"=>"<form data-fw-member-form method=\"post\"><label>Email <input name=\"email\" type=\"email\" autocomplete=\"email\" required></label><label>Password <input name=\"password\" type=\"password\" autocomplete=\"current-password\" required minlength=\"12\"></label><button type=\"submit\">Sign in</button><button type=\"button\" data-fw-register>Create account</button><button type=\"button\" data-fw-logout>Sign out</button></form>",
        "member-gate"=>"<p>Protected content requires an authenticated backend session.</p><span data-fw-output></span>",
        "analytics-consent"=>"<p>Allow this site's analytics?</p><button type=\"button\" data-fw-consent=\"true\">Allow analytics</button><button type=\"button\" data-fw-consent=\"false\">Decline analytics</button>",
        _=>"",
    };
    format!("<div class=\"fw-widget\" data-fw-widget=\"{}\" data-fw-owner=\"{}\">{}<p class=\"fw-widget-status\" role=\"status\" aria-live=\"polite\"></p></div>",escape(kind),escape(&node.id),controls)
}
