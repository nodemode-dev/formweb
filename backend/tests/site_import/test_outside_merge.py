"""What a site import does with the outside files a person ticked (plan B8, C1 to C6). Only the network seam
`outside_fetch.connect` is replaced; the downloads go through the real routes."""
import re

import pytest

from app import outside_fetch
from site_zips import page, zip_of

FETCH = "/api/library/outside/fetch"
REVIEW = "/api/library/import-site/review"
IMPORT = "/api/library/import-site"
WOFF2 = b"wOF2" + b"\x01" * 80
LOOK = """/*! Look kit v1 | MIT licence */
@import url("https://cdn.example.net/extra.css");
@font-face { font-family: Face; src: url("face.woff2") format("woff2"); }
.card { font-family: Face; background: url("https://cdn.example.net/paper.png"); color: rgb(1, 2, 3); }"""
TICK = "window.fromTheWeb = 'tick';"
HEAD = '<link rel="stylesheet" href="https://cdn.example.net/look.css"><script src="https://code.example.org/tick.js"></script>'
BODY = '<div class="card">Lap</div><script>window.ownScript = 1;</script>'
PAGE = page("Lap", BODY, HEAD).replace("<body>", '<body class="night">')


def answer(body, ctype):
    data = body.encode() if isinstance(body, str) else body
    return f"HTTP/1.1 200 OK\r\nContent-Type: {ctype}\r\nContent-Length: {len(data)}\r\n\r\n".encode() + data


class Stream:
    def __init__(self, data):
        self.data = data

    def sendall(self, data):
        pass

    def settimeout(self, seconds):
        pass

    def close(self):
        pass

    def recv_into(self, buffer):
        n = min(len(buffer), len(self.data))
        buffer[:n] = self.data[:n]
        self.data = self.data[n:]
        return n


FILES = {
    "/look.css": answer(LOOK, "text/css"), "/face.woff2": answer(WOFF2, "font/woff2"), "/tick.js": answer(TICK, "text/javascript"),
    "/unused.css": answer(".unused-rule{color:red}", "text/css"),
}


@pytest.fixture()
def web(monkeypatch):
    def connect(host, port, pick, seconds):
        pick(["93.184.216.34"])
        holder = {}

        class Asked(Stream):
            def sendall(self, data):
                path = data.split(b" ", 2)[1].decode()
                self.data = FILES[path]
        return Asked(b"")
    monkeypatch.setattr(outside_fetch, "connect", connect)


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def fetched(client, *items, token=None):
    for url, kind in items:
        r = client.post(FETCH, json={"url": url, "kind": kind, "token": token})
        assert r.status_code == 200, r.text[:300]
        token = r.json()["token"]
    return token


def imported(client, html, token=None):
    query = f"?outside={token}" if token else ""
    r = client.post(IMPORT + query, content=zip_of({"index.html": html}))
    assert r.status_code == 200, r.text[:400]
    return r.json()


def section(client):
    sections = (client.get("/api/state").json()["site"].get("extensions", {}).get("code") or {}).get("sections") or {}
    assert len(sections) == 1, sections
    return next(iter(sections.values()))


ALL = [("https://cdn.example.net/look.css", "stylesheet"), ("https://cdn.example.net/face.woff2", "font"), ("https://code.example.org/tick.js", "script")]


def test_with_its_three_files_fetched_the_page_holds_the_font_as_a_stored_asset_the_script_first_and_no_outside_host(client, blank, web):
    token = fetched(client, *ALL)
    result = imported(client, PAGE, token)
    code = section(client)
    face = re.search(r"@font-face\s*\{[^}]*\}", code["css"])
    assert face, f"no @font-face in the imported styles: {code['css'][:400]}"
    assert "example." not in face.group(0) and "url(" in face.group(0), face.group(0)
    assert result["outside"]["fonts"] == 1, result["outside"]
    assert 0 <= code["js"].find("fromTheWeb") < code["js"].find("ownScript"), code["js"]
    every = code["html"] + code["css"] + code["js"]
    named = re.findall(r"""(?:url\(\s*["']?|src=["']|href=["'])(https?://[^"')\s]+)""", every)
    assert named == [], f"the imported page still loads from outside: {named}"


def test_an_import_inside_a_fetched_stylesheet_is_left_out_with_a_sentence(client, blank, web):
    token = fetched(client, ALL[0])
    result = imported(client, PAGE, token)
    assert "@import" not in section(client)["css"]
    assert any("@import" in w and "left out" in w for w in result["warnings"]), result["warnings"]


def test_a_fetched_file_the_page_does_not_name_is_not_used_and_is_said(client, blank, web):
    token = fetched(client, ("https://cdn.example.net/unused.css", "stylesheet"))
    result = imported(client, PAGE, token)
    assert "unused-rule" not in section(client)["css"]
    assert any("not used by any imported page" in w for w in result["warnings"]), result["warnings"]


def test_the_stylesheets_licence_comment_stays_above_its_rules_with_a_line_naming_its_source(client, blank, web):
    token = fetched(client, ALL[0])
    imported(client, PAGE, token)
    css = section(client)["css"]
    licence, source, rule = css.find("MIT licence"), css.find("https://cdn.example.net/look.css"), css.find(".card")
    assert 0 <= licence < rule and 0 <= source < rule, css[:400]


def test_the_bodys_class_is_carried_on_a_wrapper_only_when_files_were_brought(client, blank, web):
    imported(client, PAGE)
    assert 'class="night"' not in section(client)["html"]
    client.post("/api/new", json={"name": "Again", "blank": True})
    token = fetched(client, ALL[0])
    imported(client, PAGE, token)
    assert re.match(r'\s*<div class="night">', section(client)["html"]), section(client)["html"][:200]


def test_an_unknown_token_at_import_brings_nothing_from_the_web_and_says_so(client, blank, web):
    result = imported(client, PAGE, "no-such-token")
    assert result["outside"]["files"] == [], result["outside"]
    assert "Downloaded from" not in section(client)["css"]
    assert any("nothing from the web came along" in w for w in result["warnings"]), result["warnings"]


def test_without_a_token_the_review_and_the_import_equal_those_of_the_route_called_the_old_way(client, blank, web):
    fetched(client, *ALL)
    data = zip_of({"index.html": PAGE})
    first = client.post(REVIEW, content=data).json()
    second = client.post(REVIEW + "?outside=", content=data).json()
    assert first == second
    a = client.post(IMPORT, content=data).json()
    code_a = section(client)
    client.post("/api/new", json={"name": "Again", "blank": True})
    b = client.post(IMPORT + "?outside=", content=data).json()
    code_b = section(client)
    strip = lambda r: {k: v for k, v in r.items() if k not in ("site", "revision", "canUndo", "canRedo")}
    assert "outside" not in a and strip(a) == strip(b), (a.keys(), b.keys())
    assert code_a == code_b and "Downloaded from" not in code_a["css"] and "fromTheWeb" not in code_a["js"], code_a
