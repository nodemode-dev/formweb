use crate::escape;
use formweb_model::Node;

fn id_ok(value: &str, max: usize) -> bool { !value.is_empty() && value.len() <= max && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') }

fn query(url: &str, key: &str) -> Option<String> {
    let query = url.split_once('?')?.1.split('#').next()?;
    query.split('&').find_map(|pair| pair.split_once('=').filter(|(k, _)| *k == key).map(|(_, v)| v.to_string()))
}

/// Maps a pasted share URL to a provider embed URL and a default aspect ratio.
/// Only providers with documented iframe players are accepted; anything else is rejected.
pub fn provider(url: &str) -> Option<(String, &'static str, &'static str)> {
    let url = url.trim();
    if url.len() > 2048 || url.chars().any(|c| c.is_whitespace() || "<>\"'`".contains(c)) { return None; }
    let rest = url.strip_prefix("https://")?;
    let (host, path) = rest.split_once('/').unwrap_or((rest, ""));
    let host = host.strip_prefix("www.").unwrap_or(host);
    let path_only = path.split(['?', '#']).next().unwrap_or("");
    let parts: Vec<&str> = path_only.split('/').filter(|p| !p.is_empty()).collect();
    match host {
        "youtube.com" | "m.youtube.com" | "youtu.be" | "youtube-nocookie.com" => {
            let id = if host == "youtu.be" { parts.first().map(|s| s.to_string()) }
                else if parts.first() == Some(&"watch") { query(url, "v") }
                else if matches!(parts.first(), Some(&"shorts") | Some(&"embed") | Some(&"live")) { parts.get(1).map(|s| s.to_string()) }
                else { None }?;
            id_ok(&id, 20).then(|| (format!("https://www.youtube-nocookie.com/embed/{id}"), "16 / 9", "YouTube video"))
        }
        "vimeo.com" | "player.vimeo.com" => {
            let id = parts.iter().rev().find(|p| p.chars().all(|c| c.is_ascii_digit()))?;
            (id.len() <= 14).then(|| (format!("https://player.vimeo.com/video/{id}?dnt=1"), "16 / 9", "Vimeo video"))
        }
        "loom.com" => {
            (matches!(parts.first(), Some(&"share") | Some(&"embed")) && parts.get(1).map(|id| id_ok(id, 64)).unwrap_or(false))
                .then(|| (format!("https://www.loom.com/embed/{}", parts[1]), "16 / 9", "Loom video"))
        }
        "open.spotify.com" => {
            let (kind, id) = (parts.first()?, parts.get(1)?);
            (["track", "album", "playlist", "episode", "show", "artist"].contains(kind) && id_ok(id, 32))
                .then(|| (format!("https://open.spotify.com/embed/{kind}/{id}"), if *kind == "track" || *kind == "episode" { "auto" } else { "4 / 3" }, "Spotify player"))
        }
        "google.com" | "maps.google.com" => {
            (path_only == "maps/embed" && query(url, "pb").map(|pb| pb.len() <= 1800).unwrap_or(false))
                .then(|| (url.to_string(), "4 / 3", "Google map"))
        }
        "openstreetmap.org" => {
            (path_only == "export/embed.html" && query(url, "bbox").is_some()).then(|| (url.to_string(), "4 / 3", "OpenStreetMap"))
        }
        _ => None,
    }
}

/// An X (Twitter) post URL, normalised to https://x.com/[user]/status/[id]. X posts render through X's own widget
/// script (docs.x.com, X for Websites: blockquote.twitter-tweet plus https://platform.x.com/widgets.js), so they are
/// always click-to-load: nothing is requested from X until the visitor asks.
pub fn social(url: &str) -> Option<String> {
    let url = url.trim();
    if url.len() > 512 || url.chars().any(|c| c.is_whitespace() || "<>\"'`".contains(c)) { return None; }
    let rest = url.strip_prefix("https://")?;
    let (host, path) = rest.split_once('/')?;
    if !matches!(host.strip_prefix("www.").unwrap_or(host), "x.com" | "twitter.com" | "mobile.twitter.com" | "mobile.x.com") { return None; }
    let parts: Vec<&str> = path.split(['?', '#']).next()?.split('/').filter(|p| !p.is_empty()).collect();
    let (user, status, id) = (parts.first()?, parts.get(1)?, parts.get(2)?);
    (*status == "status" && id_ok(user, 15) && id.len() <= 20 && id.chars().all(|c| c.is_ascii_digit())).then(|| format!("https://x.com/{user}/status/{id}"))
}

/// Visitor-facing placeholder: nothing third-party loads until the button is pressed; the link always works.
fn gate(kind: &str, host: &str, link: &str, aspect: &str, data: &str) -> String {
    let site = kind.split(' ').next().unwrap_or(kind);
    format!("<div class=\"fw-embed-gate\" data-fw-embed-gate {data} style=\"{aspect}width:100%;min-height:160px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;box-sizing:border-box;border:1px solid rgba(127,127,127,.35);border-radius:12px;text-align:center;font:inherit\"><button type=\"button\" data-fw-embed-load style=\"font:inherit;padding:10px 18px;border-radius:8px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer\">Load {}</button><p style=\"margin:0;font-size:13px;opacity:.75\">Loads content from {}, which may set cookies.</p><a href=\"{}\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"font-size:13px;color:inherit\">Open on {}</a></div>", escape(kind), escape(host), escape(link), escape(site))
}

pub fn render(site: &formweb_model::Site, node: &Node) -> Option<String> {
    let source = node.attrs.get("data-fw-embed")?;
    if let Some(post) = social(source) {
        return Some(gate("X post", "x.com and platform.x.com", &post, "", &format!("data-fw-embed-kind=\"x\" data-fw-embed-src=\"{}\"", escape(&post))));
    }
    let Some((src, ratio, kind)) = provider(source) else {
        return Some(format!("<p class=\"fw-embed-error\" role=\"note\">Unsupported embed URL: {}</p>", escape(source)));
    };
    let title = node.attrs.get("title").cloned().unwrap_or_else(|| kind.to_string());
    let height = if ratio == "auto" { "height:152px;" } else { "" };
    let aspect = if ratio == "auto" { String::new() } else { format!("aspect-ratio:{ratio};") };
    let click = node.attrs.get("data-fw-embed-load").map(String::as_str) == Some("click") || site.settings.get("embedClickToLoad").map(String::as_str) == Some("true");
    if click {
        let host = src.trim_start_matches("https://").split('/').next().unwrap_or("").to_string();
        let data = format!("data-fw-embed-kind=\"iframe\" data-fw-embed-src=\"{}\" data-fw-embed-title=\"{}\" data-fw-embed-style=\"width:100%;{aspect}{height}border:0;display:block\"", escape(&src), escape(&title));
        return Some(gate(kind, &host, source, &aspect, &data));
    }
    Some(format!("<iframe data-fw-embed-frame src=\"{}\" title=\"{}\" loading=\"lazy\" referrerpolicy=\"strict-origin-when-cross-origin\" allow=\"autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write\" allowfullscreen style=\"width:100%;{aspect}{height}border:0;display:block\"></iframe>", escape(&src), escape(&title)))
}

/// Appended to both exported runtimes: swaps a gate for the real player or post when the visitor presses Load.
pub const GATE_RUNTIME: &str = r#"
(() => {
  document.addEventListener('click', event => {
    const button = event.target.closest && event.target.closest('[data-fw-embed-load]');
    const gate = button && button.closest('[data-fw-embed-gate]');
    if (!gate) return;
    const src = gate.dataset.fwEmbedSrc || '';
    if (gate.dataset.fwEmbedKind === 'x') {
      const quote = document.createElement('blockquote');
      quote.className = 'twitter-tweet';
      const link = document.createElement('a');
      link.href = src;
      link.textContent = src;
      quote.append(link);
      gate.replaceWith(quote);
      if (!document.getElementById('twitter-wjs')) { const script = document.createElement('script'); script.id = 'twitter-wjs'; script.async = true; script.src = 'https://platform.x.com/widgets.js'; document.head.append(script); }
      else if (window.twttr && window.twttr.widgets) window.twttr.widgets.load(quote.parentNode);
      return;
    }
    const frame = document.createElement('iframe');
    frame.src = src;
    frame.title = gate.dataset.fwEmbedTitle || 'Embedded media';
    frame.setAttribute('data-fw-embed-frame', '');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    frame.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write');
    frame.allowFullscreen = true;
    frame.setAttribute('style', gate.dataset.fwEmbedStyle || 'width:100%;border:0;display:block');
    gate.replaceWith(frame);
    frame.focus({ preventScroll: true });
  });
})();
"#;
