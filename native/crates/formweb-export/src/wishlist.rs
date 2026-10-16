use crate::{cms, escape, subtree_ids, RenderContext, Renderer};
use formweb_model::{Item, Node, Site};
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;

pub const SCRIPT: &str = include_str!("wishlist.js");

const CHEVRON_PREV: &str = "<svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m15 18-6-6 6-6\"/></svg>";
const CHEVRON_NEXT: &str = "<svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m9 18 6-6-6-6\"/></svg>";

pub fn uses(site: &Site) -> bool {
    site.extensions.get("cms").and_then(|v| v.get("lists")).and_then(Value::as_object).map(|lists| lists.values().any(|l| l.get("facets").is_some() || l.get("sortOptions").is_some() || l.get("slider").is_some())).unwrap_or(false)
}

pub fn needs_advanced(site: &Site) -> bool {
    site.nodes.values().any(|n| n.attrs.contains_key("data-fw-step") || (n.tag == "input" && n.attrs.get("type").map(String::as_str) == Some("file")))
}

pub fn form_steps(site: &Site, node: &Node) -> String {
    if node.tag != "form" { return String::new(); }
    let mut steps: Vec<&Node> = formweb_model::advanced::subtree(site, &node.id).into_iter().filter_map(|id| site.nodes.get(&id)).filter(|n| n.attrs.contains_key("data-fw-step")).collect();
    if steps.is_empty() { return String::new(); }
    steps.sort_by_key(|n| n.attrs["data-fw-step"].parse::<u32>().unwrap_or(0));
    let first = steps[0].attrs.get("data-fw-step-title").map(|t| format!(": {}", escape(t))).unwrap_or_default();
    format!("<div class=\"fw-step-nav\" data-fw-step-nav><button type=\"button\" data-fw-step-prev disabled>Back</button><span class=\"fw-step-output\" data-fw-step-output role=\"status\" aria-live=\"polite\">Step 1 of {}{first}</span><button type=\"button\" data-fw-step-next>Next</button></div>", steps.len())
}

pub fn step_heading(node: &Node) -> String {
    let Some(number) = node.attrs.get("data-fw-step") else { return String::new() };
    let title = node.attrs.get("data-fw-step-title").filter(|t| !t.is_empty()).map(|t| escape(t)).unwrap_or_else(|| format!("Step {}", escape(number)));
    format!("<h3 class=\"fw-step-heading\" data-fw-step-heading>{title}</h3>")
}

pub fn css(site: &Site) -> String {
    if !uses(site) && !needs_advanced(site) { return String::new(); }
    let mut css = String::from("form:not([data-fw-ready]):has([data-fw-step]) [data-fw-step]~[data-fw-step]{display:none}.fw-step-nav{display:flex;align-items:center;gap:12px;min-height:44px;margin-top:12px}.fw-step-nav button{min-height:40px;padding:0 14px}.fw-step-nav button[hidden]{display:none}.fw-step-output{flex:1 1 auto;text-align:center;min-width:12ch}.fw-step-heading{margin:0 0 4px;font-size:1.125rem}[data-fw-step][hidden]{display:none!important}.fw-file-note{font-size:.8125rem}\n");
    css.push_str(".fw-facets{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px 20px;margin:0 0 16px}.fw-facet{display:flex;flex-direction:column;gap:4px;min-width:0;border:0;padding:0;margin:0}.fw-facet legend,.fw-facet>span{font-size:.8125rem;font-weight:700;padding:0}.fw-facet-options{display:flex;flex-wrap:wrap;gap:4px 14px}.fw-facet-options label,.fw-facet-range label{display:inline-flex;align-items:center;gap:6px}.fw-facet-range{display:flex;gap:10px}.fw-facet input[type=search],.fw-facet input[type=number],.fw-facet input[type=date],.fw-facet select{min-height:40px;min-width:9rem}.fw-facets button{min-height:40px;padding:0 14px}.fw-facet-status{flex:1 0 100%;margin:0;min-height:1.5em;font-size:.875rem}.fw-pagination{grid-column:1/-1}\n");
    css.push_str(".fw-slider{position:relative;grid-column:1/-1;min-width:0;--fw-per-view:1;--fw-gap:16px}.fw-slider-viewport{overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain}.fw-slider-viewport::-webkit-scrollbar{display:none}.fw-slider-track{display:flex;gap:var(--fw-gap)}.fw-slide{flex:0 0 calc((100% - (var(--fw-per-view) - 1) * var(--fw-gap)) / var(--fw-per-view));scroll-snap-align:start;min-width:0;display:flex}.fw-slide>*{flex:1 1 auto;min-width:0}.fw-slider-controls{display:flex;align-items:center;justify-content:center;gap:12px;min-height:44px;margin-top:12px}.fw-slider-controls button{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer}.fw-slider-controls button[disabled]{opacity:.35;cursor:default}.fw-slider-dots{display:flex;align-items:center;gap:0;flex-wrap:wrap;justify-content:center}.fw-slider-dots button{min-width:24px;min-height:24px;width:24px;height:24px}.fw-slider-dots button::before{content:\"\";width:10px;height:10px;border-radius:50%;border:2px solid currentColor;box-sizing:border-box}.fw-slider-dots button[aria-current=true]::before{background:currentColor}.fw-slider-pause{font-size:.8125rem;padding:0 10px!important}.fw-slider-pause[hidden]{display:none}.fw-slider-viewport:focus-visible{outline:3px solid currentColor;outline-offset:4px}\n@media(max-width:767px){.fw-slider{--fw-per-view:1!important}}\n");
    css
}

fn strings(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items.iter().flat_map(strings).collect(),
        Value::Null => vec![],
        other => { let text = cms::display(other); if text.is_empty() { vec![] } else { vec![text] } }
    }
}

fn sort_value(value: &Value) -> Value {
    match value {
        Value::Number(_) => value.clone(),
        Value::Null => Value::Null,
        other => json!(cms::display(other).to_lowercase()),
    }
}

fn label(entry: &Value, fallback: &str) -> String {
    entry.get("label").and_then(Value::as_str).filter(|l| !l.is_empty()).map(String::from).unwrap_or_else(|| fallback.rsplit('.').next().unwrap_or(fallback).replace(['-', '_'], " "))
}

fn controls(site: &Site, collection: &str, items: &[Item], locale: &str, key: &str, config: &Value) -> String {
    let mut html = format!("<form class=\"fw-facets\" data-fw-facets=\"{}\" role=\"search\" aria-label=\"Filter and sort\" action=\"#\" novalidate>", escape(key));
    for facet in config.get("facets").and_then(Value::as_array).into_iter().flatten() {
        let name = facet.get("key").and_then(Value::as_str).unwrap_or("");
        let field = facet.get("field").and_then(Value::as_str).unwrap_or("");
        let kind = facet.get("kind").and_then(Value::as_str).unwrap_or("select");
        let text = label(facet, field);
        let values: Vec<Value> = items.iter().filter_map(|item| cms::field(site, collection, item, field, locale)).collect();
        let (name, text) = (escape(name), escape(&text));
        match kind {
            "search" => html.push_str(&format!("<label class=\"fw-facet\"><span>{text}</span><input type=\"search\" name=\"{name}\" data-fw-facet=\"{name}\" data-fw-kind=\"search\" placeholder=\"{}\" autocomplete=\"off\"></label>", escape(facet.get("placeholder").and_then(Value::as_str).unwrap_or("Search")))),
            "range" => {
                let numeric: Vec<f64> = values.iter().filter_map(Value::as_f64).collect();
                let dates: BTreeSet<String> = values.iter().filter_map(Value::as_str).map(String::from).collect();
                let (input, low, high) = if !numeric.is_empty() { ("number", numeric.iter().cloned().fold(f64::INFINITY, f64::min).to_string(), numeric.iter().cloned().fold(f64::NEG_INFINITY, f64::max).to_string()) } else { ("date", dates.iter().next().cloned().unwrap_or_default(), dates.iter().next_back().cloned().unwrap_or_default()) };
                let step = if input == "number" { " step=\"any\"" } else { "" };
                html.push_str(&format!("<fieldset class=\"fw-facet\"><legend>{text}</legend><div class=\"fw-facet-range\"><label>Min <input type=\"{input}\" name=\"{name}-min\" data-fw-range=\"{name}\" data-fw-bound=\"min\" min=\"{low}\" max=\"{high}\" placeholder=\"{low}\"{step}></label><label>Max <input type=\"{input}\" name=\"{name}-max\" data-fw-range=\"{name}\" data-fw-bound=\"max\" min=\"{low}\" max=\"{high}\" placeholder=\"{high}\"{step}></label></div></fieldset>"));
            }
            _ => {
                let distinct: BTreeSet<String> = values.iter().flat_map(strings).collect();
                let distinct: Vec<&String> = distinct.iter().take(100).collect();
                if kind == "checkbox" {
                    html.push_str(&format!("<fieldset class=\"fw-facet\"><legend>{text}</legend><div class=\"fw-facet-options\">"));
                    for value in distinct { html.push_str(&format!("<label><input type=\"checkbox\" name=\"{name}\" value=\"{0}\" data-fw-facet=\"{name}\" data-fw-kind=\"checkbox\"> {0}</label>", escape(value))); }
                    html.push_str("</div></fieldset>");
                } else {
                    html.push_str(&format!("<label class=\"fw-facet\"><span>{text}</span><select name=\"{name}\" data-fw-facet=\"{name}\" data-fw-kind=\"select\"><option value=\"\">All</option>"));
                    for value in distinct { html.push_str(&format!("<option value=\"{0}\">{0}</option>", escape(value))); }
                    html.push_str("</select></label>");
                }
            }
        }
    }
    let sorts = config.get("sortOptions").and_then(Value::as_array);
    if let Some(sorts) = sorts.filter(|s| !s.is_empty()) {
        html.push_str("<label class=\"fw-facet\"><span>Sort by</span><select name=\"sort\" data-fw-sort><option value=\"\">Default</option>");
        for sort in sorts {
            let name = sort.get("key").and_then(Value::as_str).unwrap_or("");
            let field = sort.get("field").and_then(Value::as_str).unwrap_or("");
            let direction = sort.get("direction").and_then(Value::as_str).unwrap_or("asc");
            html.push_str(&format!("<option value=\"{}\" data-fw-direction=\"{}\">{}</option>", escape(name), direction, escape(&label(sort, field))));
        }
        html.push_str("</select></label>");
    }
    html.push_str("<button type=\"button\" data-fw-clear>Clear</button><p class=\"fw-facet-status\" data-fw-status role=\"status\" aria-live=\"polite\"></p></form>");
    html
}

fn item_data(site: &Site, collection: &str, item: &Item, locale: &str, config: &Value) -> (String, String) {
    let mut facets = Map::new();
    for facet in config.get("facets").and_then(Value::as_array).into_iter().flatten() {
        let key = facet.get("key").and_then(Value::as_str).unwrap_or("").to_string();
        let field = facet.get("field").and_then(Value::as_str).unwrap_or("");
        let value = if facet.get("kind").and_then(Value::as_str) == Some("search") {
            let paths: Vec<&str> = facet.get("fields").and_then(Value::as_array).map(|f| f.iter().filter_map(Value::as_str).collect()).filter(|f: &Vec<&str>| !f.is_empty()).unwrap_or_else(|| vec![field]);
            let joined = paths.iter().filter_map(|p| cms::field(site, collection, item, p, locale)).flat_map(|v| strings(&v)).collect::<Vec<_>>().join(" ").to_lowercase();
            json!([joined])
        } else {
            json!(cms::field(site, collection, item, field, locale).map(|v| strings(&v)).unwrap_or_default())
        };
        facets.insert(key, value);
    }
    let mut sorts = Map::new();
    for sort in config.get("sortOptions").and_then(Value::as_array).into_iter().flatten() {
        let key = sort.get("key").and_then(Value::as_str).unwrap_or("").to_string();
        let field = sort.get("field").and_then(Value::as_str).unwrap_or("");
        sorts.insert(key, sort_value(&cms::field(site, collection, item, field, locale).unwrap_or(Value::Null)));
    }
    (Value::Object(facets).to_string(), Value::Object(sorts).to_string())
}

pub(crate) fn list(renderer: &mut Renderer, id: &str, collection_id: &str, items: &[Item], context: Option<RenderContext<'_>>) -> Result<Option<String>, String> {
    let site = renderer.site;
    let Some(config) = cms::list(site, id) else { return Ok(None) };
    let slider = config.get("slider").filter(|v| v.is_object());
    let filtered = config.get("facets").and_then(Value::as_array).map(|f| !f.is_empty()).unwrap_or(false) || config.get("sortOptions").and_then(Value::as_array).map(|f| !f.is_empty()).unwrap_or(false);
    if slider.is_none() && !filtered { return Ok(None); }
    let collection = &site.collections[collection_id];
    let parent_suffix = context.map(|c| c.suffix).unwrap_or("");
    let key = format!("{id}{parent_suffix}");
    let html_ids = subtree_ids(site, id);
    let page_size = cms::page_size(site, id).filter(|_| slider.is_none());
    let total = items.len();
    let mut body = String::new();
    for (index, item) in items.iter().enumerate() {
        let segment = format!("-{}-{}", collection.id, item.id);
        let suffix = format!("{parent_suffix}{segment}");
        let mut ids = context.map(|c| c.ids.clone()).unwrap_or_default();
        for html_id in &html_ids {
            let base = ids.get(html_id).cloned().unwrap_or_else(|| html_id.clone());
            ids.insert(html_id.clone(), format!("{base}{segment}"));
        }
        let inner = renderer.node(id, Some(RenderContext { collection: &collection.id, item, ids: &ids, suffix: &suffix }), Some(id))?;
        if slider.is_some() {
            body.push_str(&format!("<div class=\"fw-slide\" data-fw-slide role=\"group\" aria-roledescription=\"slide\" aria-label=\"{} of {}\">{inner}</div>", index + 1, total));
        } else {
            let (facets, sorts) = item_data(site, collection_id, item, renderer.locale, config);
            let hidden = if page_size.map(|size| index >= size as usize).unwrap_or(false) { " hidden" } else { "" };
            body.push_str(&format!("<div data-fw-item style=\"display:contents\" data-fw-facet-data=\"{}\" data-fw-sort-data=\"{}\"{hidden}>{inner}</div>", escape(&facets), escape(&sorts)));
        }
    }
    if let Some(slider) = slider {
        let per_view = slider.get("perView").and_then(Value::as_u64).unwrap_or(1).max(1);
        let gap = slider.get("gap").and_then(Value::as_str).unwrap_or("16px");
        let autoplay = slider.get("autoplay").and_then(Value::as_bool).unwrap_or(false);
        let arrows = slider.get("arrows").and_then(Value::as_bool).unwrap_or(true);
        let dots = slider.get("dots").and_then(Value::as_bool).unwrap_or(true);
        let looping = slider.get("loop").and_then(Value::as_bool).unwrap_or(true);
        let interval = slider.get("interval").and_then(Value::as_u64).unwrap_or(5000);
        let name = slider.get("label").and_then(Value::as_str).filter(|l| !l.is_empty()).map(String::from).unwrap_or_else(|| format!("{} slider", collection.name));
        let stops = (total as u64).saturating_sub(per_view.min(total as u64)) + 1;
        let mut controls = String::new();
        if arrows { controls.push_str(&format!("<button type=\"button\" data-fw-prev aria-label=\"Previous slide\">{CHEVRON_PREV}</button>")); }
        if dots && stops > 1 {
            controls.push_str("<div class=\"fw-slider-dots\" role=\"group\" aria-label=\"Choose slide\">");
            for stop in 0..stops { controls.push_str(&format!("<button type=\"button\" data-fw-dot=\"{stop}\" aria-label=\"Go to slide {}\"{}></button>", stop + 1, if stop == 0 { " aria-current=\"true\"" } else { "" })); }
            controls.push_str("</div>");
        }
        if autoplay { controls.push_str("<button type=\"button\" class=\"fw-slider-pause\" data-fw-pause aria-pressed=\"false\">Pause</button>"); }
        if arrows { controls.push_str(&format!("<button type=\"button\" data-fw-next aria-label=\"Next slide\">{CHEVRON_NEXT}</button>")); }
        return Ok(Some(format!("<div class=\"fw-slider\" data-fw-slider=\"{}\" data-fw-autoplay=\"{autoplay}\" data-fw-interval=\"{interval}\" data-fw-loop=\"{looping}\" role=\"region\" aria-roledescription=\"carousel\" aria-label=\"{}\" style=\"--fw-per-view:{per_view};--fw-gap:{}\"><div class=\"fw-slider-viewport\" data-fw-viewport tabindex=\"0\" role=\"group\" aria-label=\"Slides\"><div class=\"fw-slider-track\">{body}</div></div><div class=\"fw-slider-controls\">{controls}</div></div>", escape(&key), escape(&name), escape(gap))));
    }
    let mut html = controls(site, collection_id, items, renderer.locale, &key, config);
    html.push_str(&format!("<div data-fw-list=\"{}\" data-fw-managed style=\"display:contents\"{}>{body}", escape(&key), page_size.map(|size| format!(" data-fw-page-size=\"{size}\"")).unwrap_or_default()));
    if page_size.is_some() { html.push_str("<nav class=\"fw-pagination\" data-fw-pagination aria-label=\"Collection pages\"><button type=\"button\" data-fw-prev disabled>Previous</button><span class=\"fw-pagination-output\" data-fw-page-output aria-live=\"polite\">1</span><button type=\"button\" data-fw-next>Next</button></nav>"); }
    html.push_str("</div>");
    Ok(Some(html))
}
