use formweb_model::{safe_url, validate, void_tag, Item, Node, Page, Site, Strings};
use serde_json::{json, Value};
use std::collections::BTreeSet;

fn escape(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#39;")
}

fn translation(site: &Site, locale: &str, key: &str, fallback: &str) -> String {
    site.locales.get(locale).and_then(|t| t.get(key)).cloned().unwrap_or_else(|| fallback.into())
}

pub fn export(site: &Site, params: &Value) -> Result<Value, String> {
    validate(site)?;
    let locale = params.get("locale").map(|v| v.as_str().ok_or("locale must be a string")).transpose()?.unwrap_or(&site.default_locale);
    if locale != site.default_locale && !site.locales.contains_key(locale) { return Err("unknown locale".into()); }
    let base = params.get("baseUrl").map(|v| v.as_str().ok_or("baseUrl must be a string")).transpose()?.or_else(|| site.settings.get("baseUrl").map(String::as_str)).unwrap_or("https://example.com").trim_end_matches('/');
    if !safe_url(base) || !(base.starts_with("https://") || base.starts_with("http://")) { return Err("baseUrl must be an http(s) URL".into()); }
    let forms = params.get("formsEndpoint").map(|v| v.as_str().ok_or("formsEndpoint must be a string")).transpose()?.unwrap_or("").trim_end_matches('/');
    if !forms.is_empty() && (!safe_url(forms) || !(forms.starts_with("https://") || forms.starts_with("http://"))) { return Err("formsEndpoint must be an http(s) origin URL".into()); }
    let mut warnings = BTreeSet::new();
    if base == "https://example.com" { warnings.insert("Replace the example.com base URL before deploying sitemap and canonical URLs".to_string()); }
    if site.locales.len() > 1 { warnings.insert(format!("This archive contains the {locale} locale only; export other locales separately")); }
    let mut files = vec![];
    let css = stylesheet(site);
    files.push(json!({"path":"assets/site.css", "content":css}));
    files.push(json!({"path":"assets/runtime.js", "content":RUNTIME}));
    let mut sitemap = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
    for page in &site.pages {
        let route = page.slug.trim_matches('/');
        let path = if route.is_empty() { "index.html".into() } else { format!("{route}/index.html") };
        let prefix = "../".repeat(if route.is_empty() { 0 } else { route.split('/').count() });
        let canonical = if route.is_empty() { format!("{base}/") } else { format!("{base}/{route}/") };
        let mut interactions = vec![];
        let mut render = Renderer { site, locale, forms, prefix: &prefix, warnings: &mut warnings, interactions: &mut interactions, budget: 100000 };
        let body = render.node(&page.root, None, None)?;
        let title = translation(site, locale, &format!("{}.title", page.id), &page.seo.title);
        let description = translation(site, locale, &format!("{}.description", page.id), &page.seo.description);
        let encoded_interactions = serde_json::to_string(&interactions).map_err(|e| e.to_string())?.replace('<', "\\u003c").replace('>', "\\u003e").replace('&', "\\u0026");
        let robots = if page.seo.noindex { "<meta name=\"robots\" content=\"noindex,nofollow\">" } else { "" };
        let html = format!("<!doctype html>\n<html lang=\"{}\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{}</title><meta name=\"description\" content=\"{}\"><link rel=\"canonical\" href=\"{}\"><meta property=\"og:title\" content=\"{}\"><meta property=\"og:description\" content=\"{}\"><meta property=\"og:url\" content=\"{}\"><meta property=\"og:type\" content=\"website\">{}<link rel=\"stylesheet\" href=\"{}assets/site.css\"><script src=\"{}assets/runtime.js\" defer></script></head><body><a class=\"fw-skip\" href=\"#fw-main\">Skip to content</a><div id=\"fw-main\" tabindex=\"-1\">{}</div><script type=\"application/json\" id=\"fw-interactions\">{}</script></body></html>\n", escape(locale), escape(&title), escape(&description), escape(&canonical), escape(&title), escape(&description), escape(&canonical), robots, prefix, prefix, body, encoded_interactions);
        files.push(json!({"path":path,"content":html}));
        if !page.seo.noindex { sitemap.push_str(&format!("<url><loc>{}</loc></url>\n", escape(&canonical))); }
    }
    sitemap.push_str("</urlset>\n");
    files.push(json!({"path":"sitemap.xml","content":sitemap}));
    files.push(json!({"path":"robots.txt","content":format!("User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n")}));
    files.push(json!({"path":"site.formweb.json","content":serde_json::to_string_pretty(site).map_err(|e|e.to_string())?}));
    files.push(json!({"path":"README.txt","content":format!("FormWeb static export\nLocale: {locale}\nServe this folder with any static HTTP server.\nPages use directory routes with index.html.\nThe editable source is site.formweb.json.\nRemote assets are referenced, not bundled.\nForms submit to the configured FormWeb API; keep that service running or replace the form action with your own service.\nRuntime respects prefers-reduced-motion.\n")}));
    Ok(json!({"files": files, "warnings": warnings.into_iter().collect::<Vec<_>>()}))
}

fn stylesheet(site: &Site) -> String {
    let mut css = String::from("*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0}img,video{max-width:100%}button,input,select,textarea{font:inherit}a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid currentColor;outline-offset:4px}.fw-skip{position:fixed;top:8px;left:8px;transform:translateY(-160%);padding:12px;background:#fff;color:#111}.fw-skip:focus{transform:none}.fw-form-status{min-height:1.5em}\n:root{");
    for (key, value) in &site.tokens { css.push_str(&format!("--{}:{};", key.trim_start_matches("--"), value)); }
    css.push_str("}\n");
    for node in site.nodes.values() {
        let mut styles = node.styles.clone();
        for bp in site.breakpoints.iter().filter(|b| b.max_width == 100000) {
            if let Some(overrides) = node.breakpoints.get(&bp.id) { styles.extend(overrides.clone()); }
        }
        if !styles.is_empty() {
            css.push_str(&format!("[data-fw-node=\"{}\"]{{", node.id));
            for (key, value) in styles { css.push_str(&format!("{key}:{value};")); }
            css.push_str("}\n");
        }
    }
    let mut breakpoints: Vec<_> = site.breakpoints.iter().filter(|b| b.max_width < 100000).collect();
    breakpoints.sort_by(|a,b|b.max_width.cmp(&a.max_width));
    for bp in breakpoints {
        css.push_str(&format!("@media(max-width:{}px){{\n", bp.max_width));
        for node in site.nodes.values() {
            if let Some(styles) = node.breakpoints.get(&bp.id) {
                css.push_str(&format!("[data-fw-node=\"{}\"]{{", node.id));
                for (key, value) in styles { css.push_str(&format!("{key}:{value};")); }
                css.push_str("}\n");
            }
        }
        css.push_str("}\n");
    }
    css.push_str("@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important}}\n");
    css
}

#[derive(Clone, Copy)]
struct RenderContext<'a> {
    collection: &'a str,
    item: &'a Item,
    ids: &'a Strings,
    suffix: &'a str,
}

struct Renderer<'a> {
    site: &'a Site,
    locale: &'a str,
    forms: &'a str,
    prefix: &'a str,
    warnings: &'a mut BTreeSet<String>,
    interactions: &'a mut Vec<Value>,
    budget: usize,
}

impl Renderer<'_> {
    fn node(&mut self, id: &str, context: Option<RenderContext<'_>>, repeated: Option<&str>) -> Result<String, String> {
        if self.budget == 0 { return Err("CMS expansion exceeds 100000 rendered nodes".into()); }
        self.budget -= 1;
        let node = &self.site.nodes[id];
        if let Some(binding) = &node.binding {
            if binding.field.is_none() && repeated != Some(id) {
                let collection = &self.site.collections[&binding.collection];
                let mut result = String::new();
                let html_ids = subtree_ids(self.site, id);
                for item in collection.items.iter().filter(|item| item.status == "published") {
                    let segment = format!("-{}-{}", collection.id, item.id);
                    let suffix = format!("{}{segment}", context.map(|c|c.suffix).unwrap_or(""));
                    let mut ids = context.map(|c|c.ids.clone()).unwrap_or_default();
                    for html_id in &html_ids {
                        let base = ids.get(html_id).cloned().unwrap_or_else(||html_id.clone());
                        ids.insert(html_id.clone(), format!("{base}{segment}"));
                    }
                    result.push_str(&self.node(id, Some(RenderContext { collection: &collection.id, item, ids: &ids, suffix: &suffix }), Some(id))?);
                }
                return Ok(result);
            }
        }
        self.element(node, context)
    }

    fn element(&mut self, node: &Node, context: Option<RenderContext<'_>>) -> Result<String, String> {
        let mut attrs = node.attrs.clone();
        let mut text = translation(self.site, self.locale, &node.id, &node.text);
        if let Some(binding) = &node.binding {
            if let Some(field) = &binding.field {
                let collection = &self.site.collections[&binding.collection];
                let item = context.filter(|c|c.collection == collection.id).map(|c|c.item).or_else(|| collection.items.iter().find(|i| i.status == "published"));
                if let Some(value) = item.and_then(|i| i.values.get(field)) {
                    let content = match value { Value::String(s) => s.clone(), Value::Null => String::new(), other => other.to_string() };
                    if node.tag == "img" { attrs.insert("src".into(), content); }
                    else { text = content; }
                } else { text.clear(); }
            }
        }
        let suffix = context.map(|c|c.suffix).unwrap_or("");
        let runtime_id = format!("{}{suffix}", node.id);
        if let Some(context) = context {
            for name in ["id", "for"] {
                if let Some(value) = attrs.get_mut(name) {
                    if let Some(mapped) = context.ids.get(value) { *value = mapped.clone(); }
                }
            }
            for name in ["aria-labelledby", "aria-describedby"] {
                if let Some(value) = attrs.get_mut(name) { *value = value.split_whitespace().map(|id|context.ids.get(id).cloned().unwrap_or_else(||id.into())).collect::<Vec<_>>().join(" "); }
            }
            if let Some(href) = attrs.get_mut("href") { *href = scoped_fragment(href, context.ids); }
        }
        if let Some(href) = attrs.get_mut("href") { *href = portable_link(self.site, href, self.prefix); }
        if attrs.get("target").map(String::as_str) == Some("_blank") { attrs.insert("rel".into(), "noopener noreferrer".into()); }
        if node.tag == "img" && !attrs.contains_key("loading") { attrs.insert("loading".into(), "lazy".into()); }
        if attrs.get("src").map(|s|s.starts_with("http://") || s.starts_with("https://")).unwrap_or(false) { self.warnings.insert("Remote media URLs are referenced and are not bundled into the archive".into()); }
        if node.tag == "form" && !attrs.get("action").map(|action| !action.is_empty()).unwrap_or(false) {
            attrs.insert("action".into(), format!("{}/api/forms/{}/{}", self.forms, self.site.id, node.id));
            attrs.insert("method".into(), "post".into());
            attrs.insert("data-fw-form".into(), "true".into());
        }
        if !node.interactions.is_empty() {
            let mut interactions = node.interactions.clone();
            for interaction in &mut interactions {
                if let Some(url) = &mut interaction.url {
                    if let Some(context) = context { *url = scoped_fragment(url, context.ids); }
                    *url = portable_link(self.site, url, self.prefix);
                }
            }
            self.interactions.push(json!({"id":runtime_id,"interactions":interactions}));
        }
        let mut result = format!("<{} data-fw-node=\"{}\" data-fw-id=\"{}\"", node.tag, node.id, runtime_id);
        for (key, value) in attrs { result.push_str(&format!(" {}=\"{}\"", key, escape(&value))); }
        result.push('>');
        if void_tag(&node.tag) { return Ok(result); }
        result.push_str(&escape(&text));
        for child in &node.children { result.push_str(&self.node(child, context, None)?); }
        if node.tag == "form" { result.push_str("<p class=\"fw-form-status\" data-fw-form-status aria-live=\"polite\"></p>"); }
        result.push_str(&format!("</{}>", node.tag));
        Ok(result)
    }
}

fn subtree_ids(site: &Site, root: &str) -> BTreeSet<String> {
    let mut result = BTreeSet::new();
    let mut pending = vec![root.to_string()];
    while let Some(id) = pending.pop() {
        let node = &site.nodes[&id];
        if let Some(html_id) = node.attrs.get("id") { result.insert(html_id.clone()); }
        pending.extend(node.children.iter().cloned());
    }
    result
}

fn scoped_fragment(url: &str, ids: &Strings) -> String {
    url.strip_prefix('#').and_then(|id|ids.get(id)).map(|mapped|format!("#{mapped}")).unwrap_or_else(||url.into())
}

fn portable_link(site: &Site, url: &str, prefix: &str) -> String {
    if url.is_empty() || url.starts_with('#') || url.starts_with('?') || url.contains(":") { return url.into(); }
    let split = url.find(['?', '#']).unwrap_or(url.len());
    let route = url[..split].trim_matches('/');
    if site.pages.iter().any(|page| page.slug.trim_matches('/') == route) {
        let target = if route.is_empty() { if prefix.is_empty() { "./".to_string() } else { prefix.into() } } else { format!("{prefix}{route}/") };
        format!("{target}{}", &url[split..])
    } else { url.into() }
}

pub fn page_path(page: &Page) -> String {
    let slug = page.slug.trim_matches('/');
    if slug.is_empty() { "index.html".into() } else { format!("{slug}/index.html") }
}

const RUNTIME: &str = r#"'use strict';
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const records = JSON.parse(document.getElementById('fw-interactions')?.textContent || '[]');
  const nodes = new Map(Array.from(document.querySelectorAll('[data-fw-id]')).map(node => [node.dataset.fwId, node]));
  const run = (node, action, active = true) => {
    if (action.action === 'toggle-class') {
      if (action.trigger === 'hover') node.classList.toggle(action.className, active);
      else node.classList.toggle(action.className);
    } else if (action.action === 'navigate' && active) {
      window.location.assign(action.url);
    } else if (action.action === 'fade-in' && active) {
      node.style.opacity = '1';
      if (!reduced.matches && node.animate) node.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: action.duration ?? 300, easing: 'ease-out' });
    }
  };
  for (const record of records) {
    const node = nodes.get(record.id);
    if (!node) continue;
    for (const action of record.interactions) {
      if (action.trigger === 'click') node.addEventListener('click', () => run(node, action));
      if (action.trigger === 'hover') {
        node.addEventListener('pointerenter', () => run(node, action, true));
        node.addEventListener('pointerleave', () => run(node, action, false));
        node.addEventListener('focusin', () => run(node, action, true));
        node.addEventListener('focusout', () => run(node, action, false));
      }
      if (action.trigger === 'scroll') {
        if (reduced.matches || !window.IntersectionObserver) { run(node, action); continue; }
        if (action.action === 'fade-in') node.style.opacity = '0';
        const observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) { run(node, action); observer.disconnect(); }
        }, { threshold: 0.1 });
        observer.observe(node);
      }
    }
  }
  for (const form of document.querySelectorAll('form[data-fw-form]')) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const status = form.querySelector('[data-fw-form-status]');
      const button = form.querySelector('[type=submit]');
      if (button) button.disabled = true;
      status.textContent = 'Sending...';
      try {
        const fields = new FormData(form);
        if (Array.from(fields.values()).some(value => typeof value !== 'string')) throw new Error('File uploads are unavailable');
        const response = await fetch(form.action, { method: 'POST', body: new URLSearchParams(fields), headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Submission failed');
        status.textContent = 'Thank you. Your message has been received.';
        form.reset();
      } catch { status.textContent = 'We could not send your message. Please try again.'; }
      finally { if (button) button.disabled = false; }
    });
  }
})();
"#;
