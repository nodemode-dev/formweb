pub fn document(javascript: &str) -> String {
    let mut serial = 0;
    let prefix = loop { let candidate = format!("__formweb_{serial}_"); if !javascript.contains(&candidate) { break candidate; } serial += 1; };
    let source = javascript.replace("</", "<\\/");
    let mut html = String::from(r#"<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;font-family:system-ui}#status{min-height:1.5em}#root{min-height:100px}</style></head><body><div id="root"></div><p id="status" role="status" aria-live="polite"></p><script type="application/json" id="component">__FW_PAYLOAD__</script><script>for(const type of ['error','unhandledrejection'])window.addEventListener(type,event=>{document.getElementById('status').textContent='Component unavailable: '+(event.message||event.reason?.message||'Runtime error');});</script><script type="module">"#);
    html.push_str(&source);
    html.push_str(&format!("\nconst {prefix}payload=JSON.parse(document.getElementById('component').textContent);try{{const {prefix}props={{}};for(const [name,schema] of Object.entries({prefix}payload.schema)){{const value=Object.hasOwn({prefix}payload.props,name)?{prefix}payload.props[name]:schema.default;if(value===undefined){{if(schema.required)throw Error('Missing property '+name);continue;}}if(schema.type!=='json'&&typeof value!==schema.type)throw Error('Invalid property '+name);{prefix}props[name]=value;}}await formwebMountContract(document.getElementById('root'),{prefix}props);}}catch(error){{document.getElementById('status').textContent='Component unavailable: '+error.message;}}"));
    html.push_str("</script></body></html>");
    html
}
