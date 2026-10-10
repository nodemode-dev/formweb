use crate::{cms, code, escape, routing, subtree_ids, RenderContext, Renderer};
use formweb_model::{safe_url, Node, Site, Strings};
use serde_json::{json, Value};
use std::collections::{BTreeMap,BTreeSet};

pub fn json_script(value: &Value) -> String { value.to_string().replace('<', "\\u003c").replace('>', "\\u003e").replace('&', "\\u0026") }
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
    let mut files = vec![json!({"path":"assets/site.css","content":crate::route_styles::base(site)}),json!({"path":"assets/runtime.js","content":include_str!("runtime.js")})];
    files.extend(code::files(site)?);
    let mut asset_access:BTreeMap<String,BTreeSet<String>>=BTreeMap::new();
    let mut sitemap = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\">\n");
    for (route_index,route) in routes.iter().enumerate() {
        let prefix = route.prefix();
        let css_path=format!("assets/pages/{route_index}.css");
        files.push(json!({"path":css_path,"content":crate::route_styles::render(site,&route.page.root)}));
        let links = routing::links(site, route, &routes);
        let mut records = vec![];
        let mut renderer = Renderer { site, locale:&route.locale,forms,prefix:&prefix,warnings:&mut warnings,interactions:&mut records,budget:100000,links:Some(&links) };
        let ids = subtree_ids(site, &route.page.root);
        let suffix = route.item.as_ref().map(|i| format!("-{}-{}", route.collection.as_deref().unwrap_or("item"),i.id)).unwrap_or_default();
        let ids: Strings = ids.into_iter().map(|id| { let mapped = format!("{id}{suffix}"); (id,mapped) }).collect();
        let context = route.collection.as_deref().zip(route.item.as_ref()).map(|(collection,item)|RenderContext { collection,item,ids:&ids,suffix:&suffix });
        let body = renderer.node(&route.page.root,context,None)?;
        let (title,description,json_ld) = routing::metadata(site,route);
        let canonical = route.canonical(base);
        let alternates = routing::alternates(route,&routes,base);
        let json_ld = json_ld.map(|v|format!("<script type=\"application/ld+json\">{}</script>",json_script(&v))).unwrap_or_default();
        let robots = if route.page.seo.noindex { "<meta name=\"robots\" content=\"noindex,nofollow\">" } else { "" };
        let mut context = json!({"site":site.id});
        if let Some(path) = forms.split("/published/").nth(1) { let mut segments = path.split('/');context["slug"]=json!(segments.next().unwrap_or(""));context["version"]=json!(segments.next().unwrap_or("")); }
        if let Some(token) = forms.split("/preview/").nth(1) { context["previewToken"]=json!(token.split('/').next().unwrap_or("")); }
        let config = crate::scope::configuration(site,&route.page.root,records,context,&links,&prefix);
        let html = format!("<!doctype html>\n<html lang=\"{}\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{}</title><meta name=\"description\" content=\"{}\"><link rel=\"canonical\" href=\"{}\"><meta property=\"og:title\" content=\"{}\"><meta property=\"og:description\" content=\"{}\"><meta property=\"og:url\" content=\"{}\"><meta property=\"og:type\" content=\"website\">{}{}{}<link rel=\"stylesheet\" href=\"{}{}\"><script src=\"{}assets/runtime.js\" defer></script></head><body><a class=\"fw-skip\" href=\"#fw-main\">Skip to content</a><div id=\"fw-main\" tabindex=\"-1\">{}</div><script type=\"application/json\" id=\"fw-config\">{}</script></body></html>\n",escape(&route.locale),escape(&title),escape(&description),escape(&canonical),escape(&title),escape(&description),escape(&canonical),robots,alternates,json_ld,prefix,css_path,prefix,body,json_script(&config));
        asset_access.entry(css_path.clone()).or_default().insert(route.page.id.clone());
        if let Some(components)=site.extensions.get("code").and_then(|v|v.get("components")).and_then(Value::as_object){for id in components.keys(){if body.contains(&format!("data-fw-code=\"{id}\"")){asset_access.entry(format!("assets/components/{id}.html")).or_default().insert(route.page.id.clone());}}}
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
    if let Some(redirects)=site.extensions.get("seo").and_then(|v|v.get("redirects")) { files.push(json!({"path":"redirects.json","content":redirects.to_string()})); }
    let route_manifest: Vec<_> = routes.iter().enumerate().map(|(index,r)|json!({"path":r.path(),"page":r.page.id,"locale":r.locale,"item":r.item.as_ref().map(|i|&i.id),"stylesheet":format!("assets/pages/{index}.css")})).collect();
    files.push(json!({"path":"routes.json","content":serde_json::to_string(&route_manifest).map_err(|e|e.to_string())?}));
    files.push(json!({"path":"asset-access.json","content":json!({"schemaVersion":1,"assets":asset_access}).to_string()}));
    files.push(json!({"path":"README.txt","content":"FormWeb static output. Serve over HTTP. Owned assets are bundled by the backend. Browser integrations require the configured backend and do not embed credentials. Isolated code frames cannot access the parent or network. Gated output must be served by an authorizing backend. Keep native .fweb source separately."}));
    Ok(json!({"files":files,"warnings":warnings.into_iter().collect::<Vec<_>>(),"routes":route_manifest}))
}
pub fn styles(site:&Site)->String {
    let mut css=String::from(":root{--fw-layer-dialog:300}.fw-widget{min-height:96px}.fw-widget-status,.fw-field-error{display:block;min-height:1.5em}.fw-pagination{display:flex;align-items:center;gap:12px;min-height:44px}.fw-pagination-output{min-width:8ch;font-variant-numeric:tabular-nums}dialog[data-fw-overlay]{position:fixed;z-index:var(--fw-layer-dialog);max-width:min(90vw,680px);max-height:90vh;overflow:auto;border:0;border-radius:12px;padding:24px}dialog::backdrop{background:rgb(0 0 0 / .5)}[data-fw-list]>[hidden]{display:none!important}\n");
    css.push_str("[data-fw-widget=fetch]{height:160px;overflow:auto}[data-fw-widget=product]{height:300px;overflow:auto}[data-fw-product-title]{min-height:2.5em}[data-fw-price]{min-height:1.5em}[data-fw-widget=member-login]{height:240px;overflow:auto}.fw-widget-status{height:3em;overflow:auto}\n");
    if let Some(nodes)=site.extensions.get("behaviors").and_then(|v|v.get("nodes")).and_then(Value::as_object) {
        for(id,node)in nodes { if let Some(states)=node.get("states").and_then(Value::as_object) { for(state,styles)in states { let pseudo=match state.as_str(){"hover"=>":hover","focus"=>":focus-within","press"=>"[data-fw-press]",_=>continue};css.push_str(&format!("[data-fw-node=\"{id}\"]{pseudo}{{"));if let Some(styles)=styles.as_object(){for(key,value)in styles{if let Some(value)=value.as_str(){css.push_str(&format!("{key}:{value};"));}}}css.push_str("}\n"); } } }
    }
    css
}
pub fn attrs(site:&Site,node:&Node,locale:&str,attrs:&mut Strings) {
    if let Some(url)=site.extensions.get("localization").and_then(|v|v.get("assets")).and_then(|v|v.get(&node.id)).and_then(|v|v.get(locale)).and_then(Value::as_str) { attrs.insert(if node.tag=="video"{"poster"}else{"src"}.into(),url.into()); }
    if let Some(name)=attrs.get("name").cloned() { if let Some(forms)=site.extensions.get("forms").and_then(|v|v.get("forms")).and_then(Value::as_object) {
        for(form,config)in forms { if descendant(site,form,&node.id) { if let Some(key)=config.get("tracking").and_then(|v|v.get(&name)).and_then(Value::as_str) { attrs.insert("data-fw-track".into(),key.into()); } if let Some(constraint)=config.get("constraints").and_then(|v|v.get(&name)).and_then(Value::as_object) { for(key,value)in constraint { let attr=match key.as_str(){"minLength"=>"minlength","maxLength"=>"maxlength",other=>other};if attr=="required"{if value.as_bool()==Some(true){attrs.insert(attr.into(),String::new());}else{attrs.remove(attr);}}else{attrs.insert(attr.into(),cms::display(value));} } } } }
    } }
}
fn descendant(site:&Site,root:&str,target:&str)->bool { let mut pending=vec![root];while let Some(id)=pending.pop(){if id==target{return true;}if let Some(node)=site.nodes.get(id){pending.extend(node.children.iter().map(String::as_str));}}false }
pub fn record(site:&Site,node:&Node,id:&str,scope:&str)->Option<Value> {
    let config=site.extensions.get("behaviors").and_then(|v|v.get("nodes")).and_then(|v|v.get(&node.id));
    config.map(|config|json!({"id":id,"scope":scope,"actions":config.get("actions"),"conditions":config.get("conditions")}))
}
pub fn form_extra(site:&Site,node:&Node)->String {
    let mut output=String::new();
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
