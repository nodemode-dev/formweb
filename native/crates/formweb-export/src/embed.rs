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

pub fn render(node: &Node) -> Option<String> {
    let source = node.attrs.get("data-fw-embed")?;
    let Some((src, ratio, kind)) = provider(source) else {
        return Some(format!("<p class=\"fw-embed-error\" role=\"note\">Unsupported embed URL: {}</p>", escape(source)));
    };
    let title = node.attrs.get("title").cloned().unwrap_or_else(|| kind.to_string());
    let height = if ratio == "auto" { "height:152px;" } else { "" };
    let aspect = if ratio == "auto" { String::new() } else { format!("aspect-ratio:{ratio};") };
    Some(format!("<iframe data-fw-embed-frame src=\"{}\" title=\"{}\" loading=\"lazy\" referrerpolicy=\"strict-origin-when-cross-origin\" allow=\"autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write\" allowfullscreen style=\"width:100%;{aspect}{height}border:0;display:block\"></iframe>", escape(&src), escape(&title)))
}
