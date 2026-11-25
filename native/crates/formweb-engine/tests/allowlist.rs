mod common;
use common::*;
use formweb_engine::Engine;
use serde_json::{json, Value};

const REFUSED_TAGS: &[&str] = &["script", "SCRIPT", "iframe", "object", "embed", "meta", "base", "link", "frame", "frameset", "style", "template", "noscript", "applet", "portal", "animate", "set", "foreignObject"];

const BAD_URLS: &[&str] = &[
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "\u{0}javascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "DATA:text/html;base64,PHNjcmlwdD4=",
];

fn refused_attributes() -> Vec<(&'static str, Value)> {
    let mut table: Vec<(&'static str, Value)> = vec![
        ("p", json!({"onclick": "alert(1)"})),
        ("p", json!({"OnClick": "alert(1)"})),
        ("img", json!({"src": "https://example.org/a.png", "alt": "", "onerror": "alert(1)"})),
        ("section", json!({"onload": "alert(1)"})),
        ("div", json!({"onpointerenter": "alert(1)"})),
        ("div", json!({"style": "color:red"})),
        ("div", json!({"style": "background:url(javascript:alert(1))"})),
        ("div", json!({"srcdoc": "<script>alert(1)</script>"})),
    ];
    for url in BAD_URLS {
        table.push(("a", json!({ "href": url })));
        table.push(("img", json!({"src": url, "alt": ""})));
        table.push(("form", json!({ "action": url })));
    }
    table
}

fn hostile_parts(engine: &Engine) -> Vec<String> {
    let mut found = Vec::new();
    for (id, node) in &engine.site.nodes {
        if REFUSED_TAGS.iter().any(|t| t.eq_ignore_ascii_case(&node.tag)) {
            found.push(format!("{id}: <{}>", node.tag));
        }
        for (name, value) in &node.attrs {
            let low = name.to_ascii_lowercase();
            let compact: String = value.chars().filter(|c| *c > ' ').collect::<String>().to_ascii_lowercase();
            if low.starts_with("on") || low == "style" || low == "srcdoc" {
                found.push(format!("{id}: {name}"));
            }
            if ["href", "src", "action"].contains(&low.as_str()) && (compact.starts_with("javascript:") || compact.starts_with("vbscript:") || compact.starts_with("data:text/html")) {
                found.push(format!("{id}: {name}={value:?}"));
            }
        }
    }
    found
}

fn edited_engine() -> Engine {
    let mut engine = engine();
    add_p(&mut engine, "work", "plain");
    engine
}

fn assert_refused_without_trace(engine: &mut Engine, command: &str, params: Value) {
    let before = engine.site.clone();
    let revision = engine.revision;
    let depth = undo_depth(engine);
    let outcome = run(engine, command, params.clone());
    assert!(outcome.is_err(), "{command} {params} should be refused");
    assert!(!outcome.unwrap_err().trim().is_empty());
    assert_eq!(engine.site, before, "{command} {params} changed the site");
    assert_eq!(engine.revision, revision);
    assert_eq!(undo_depth(engine), depth, "{command} {params} added an undo step");
    assert!(hostile_parts(engine).is_empty());
}

#[test]
fn node_add_refuses_every_element_kind_outside_the_allowlist() {
    let mut engine = edited_engine();
    for tag in REFUSED_TAGS {
        assert_refused_without_trace(&mut engine, "node.add", json!({"parent": "work", "node": {"tag": tag}}));
    }
}

#[test]
fn node_add_refuses_script_and_href_animation_inside_an_svg() {
    let mut engine = edited_engine();
    run(&mut engine, "node.add", json!({"parent": "work", "node": {"id": "pic", "tag": "svg", "attrs": {"viewBox": "0 0 10 10"}}})).unwrap();
    for tag in ["script", "animate", "set", "animateMotion", "foreignObject"] {
        assert_refused_without_trace(&mut engine, "node.add", json!({"parent": "pic", "node": {"tag": tag, "attrs": {"attributeName": "href", "to": "javascript:alert(1)"}}}));
    }
    assert_refused_without_trace(&mut engine, "node.add", json!({"parent": "pic", "node": {"tag": "path", "attrs": {"d": "M0 0L1 1", "onclick": "alert(1)"}}}));
}

#[test]
fn node_add_refuses_event_handlers_style_srcdoc_and_script_urls() {
    let mut engine = edited_engine();
    for (tag, attrs) in refused_attributes() {
        assert_refused_without_trace(&mut engine, "node.add", json!({"parent": "work", "node": {"tag": tag, "attrs": attrs}}));
    }
}

#[test]
fn node_update_refuses_event_handlers_style_srcdoc_and_script_urls() {
    let mut engine = edited_engine();
    for (i, (tag, attrs)) in refused_attributes().into_iter().enumerate() {
        let id = format!("target-{i}");
        let start = if tag == "img" { json!({"src": "https://example.org/fine.png", "alt": ""}) } else { json!({}) };
        run(&mut engine, "node.add", json!({"parent": "work", "node": {"id": id, "tag": tag, "attrs": start}})).unwrap();
        assert_refused_without_trace(&mut engine, "node.update", json!({"id": id, "patch": {"attrs": attrs}}));
    }
}

#[test]
fn node_update_cannot_change_an_element_into_a_refused_kind() {
    let mut engine = edited_engine();
    for tag in REFUSED_TAGS {
        assert_refused_without_trace(&mut engine, "node.update", json!({"id": "plain", "patch": {"tag": tag}}));
    }
}

#[test]
fn a_paste_of_a_fragment_holding_a_refused_element_or_attribute_changes_nothing() {
    let mut engine = edited_engine();
    let fragment = engine.fragment("plain").unwrap();
    let root = fragment["root"].as_str().unwrap().to_string();
    let mut cases: Vec<(String, Value)> = REFUSED_TAGS.iter().map(|t| (t.to_string(), json!({}))).collect();
    cases.extend(refused_attributes().into_iter().map(|(t, a)| (t.to_string(), a)));
    for (tag, attrs) in cases {
        let mut hostile = fragment.clone();
        hostile["nodes"][&root]["tag"] = json!(tag);
        hostile["nodes"][&root]["attrs"] = attrs;
        if tag == "img" {
            hostile["nodes"][&root]["text"] = json!("");
        }
        assert_refused_without_trace(&mut engine, "node.paste", json!({"fragment": hostile, "parent": "work"}));
    }
}

#[test]
fn a_refused_command_in_a_batch_undoes_the_good_ones_and_adds_no_undo_step() {
    let mut engine = edited_engine();
    let before = engine.site.clone();
    let depth = undo_depth(&engine);
    for (tag, attrs) in refused_attributes() {
        let commands = vec![
            json!({"command": "node.add", "params": {"parent": "work", "node": {"id": "good", "tag": "p", "text": "x"}}}),
            json!({"command": "node.add", "params": {"parent": "work", "node": {"tag": tag, "attrs": attrs}}}),
        ];
        assert!(engine.batch(&commands, None).is_err());
        assert_eq!(engine.site, before);
        assert_eq!(undo_depth(&engine), depth);
    }
    undo(&mut engine);
    assert!(!engine.site.nodes.contains_key("plain"));
}

#[test]
fn ordinary_links_pictures_and_forms_are_still_accepted() {
    let mut engine = edited_engine();
    let accepted = [
        ("a", json!({"href": "https://example.org/a?b=1#c"})),
        ("a", json!({"href": "/about"})),
        ("a", json!({"href": "#top"})),
        ("a", json!({"href": "mailto:hi@example.org"})),
        ("img", json!({"src": "https://example.org/a.png", "alt": "A tile"})),
        ("img", json!({"src": "https://example.org/a.png", "alt": ""})),
        ("form", json!({"action": "https://example.org/send"})),
        ("p", json!({"title": "onclick is only text here", "aria-label": "javascript: as words"})),
    ];
    for (i, (tag, attrs)) in accepted.into_iter().enumerate() {
        let depth = undo_depth(&engine);
        run(&mut engine, "node.add", json!({"parent": "work", "node": {"id": format!("ok-{i}"), "tag": tag, "attrs": attrs}})).unwrap_or_else(|e| panic!("{tag} {e}"));
        assert_eq!(undo_depth(&engine), depth + 1);
    }
}
