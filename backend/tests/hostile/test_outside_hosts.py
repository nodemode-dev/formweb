import json

import pytest

from site_zips import answered_within, page, zip_of

REVIEW = "/api/library/import-site/review"
BOUND = 30
CONTROL = "https://control.example.net/c.js"

# (reference, the host a browser loads it from), read by hand from the WHATWG URL rules: for http and https a
# backslash is a slash, any run of slashes after the scheme is skipped, the last @ before the end of the authority
# ends the credentials, and the authority ends at the first /, \, ? or #.
LISTED = [
    ("https://tracker.example\\@cdn.example.net/x.js", "tracker.example"),
    ("https://c.example\\@a.example/x.js", "c.example"),
    ("https:\\\\evil.example\\x.css", "evil.example"),
    ("\\\\evil.example/y.js", "evil.example"),
    ("/\\evil.example/z.js", "evil.example"),
    ("\\/evil.example/w.js", "evil.example"),
    ("HTTP:\\\\CDN.example.net\\x.js", "cdn.example.net"),
    ("https://good.example@evil.example/x.js", "evil.example"),
    ("https://a@b@c.example.net/x.js", "c.example.net"),
    ("https://good.example#@evil.example/x.js", "good.example"),
    ("https://good.example?@evil.example/x.js", "good.example"),
    ("https://cdn.example.net\\path\\x.js?q=a\\b", "cdn.example.net"),
    ("https://user:secret@cred.example.net/a.js", "cred.example.net"),
    ("https://cdn.example.net:443/x.js", "cdn.example.net"),
    ("http://cdn.example.net:80/x.js", "cdn.example.net"),
    ("https://cdn.example.net:8443/x.js", "cdn.example.net:8443"),
    ("https://bücher.example/x.js", "xn--bcher-kva.example"),
]

# A browser loads these from the given host; the review may name that host or leave the file out, never another.
LISTED_OR_LEFT_OUT = [
    ("https:///evil.example/x.js", "evil.example"),
    ("\\\\\\evil.example/x.js", "evil.example"),
    ("https://0x7f.1/a.js", "127.0.0.1"),
    ("http://2130706433/a.js", "127.0.0.1"),
    ("https://0177.0.0.1/a.js", "127.0.0.1"),
    ("https://1.2.3/a.js", "1.2.0.3"),
    ("https://0x/a.js", "0.0.0.0"),
    ("https://faß.example/x.js", "xn--fa-hia.example"),
    ("https://ς.example/x.js", "xn--3xa.example"),
    ("https://ＣＤＮ.example.net/x.js", "cdn.example.net"),
    ("https://cdn。example。net/x.js", "cdn.example.net"),
    ("https://%63dn.example.net/x.js", "cdn.example.net"),
    ("https://cdn.example.net:0080/x.js", "cdn.example.net:80"),
    ("http://cdn.example.net:0080/x.js", "cdn.example.net"),
    ("//cdn.example.net:8080/x.js", "cdn.example.net:8080"),
    ("https://xn--bcher-kva.example/x.js", "xn--bcher-kva.example"),
    (" \t https://cdn.example.net/a\nb.js ", "cdn.example.net"),
    ("https://cdn.exa\tmple.net/x.js", "cdn.example.net"),
    ("ht\ttps://cdn.example.net/x.js", "cdn.example.net"),
]

LEFT_OUT = {
    "a host of five thousand characters": "https://" + "a" * 4996 + ".net/x.js",
    "a host of 255 characters in labels of 63": "https://" + ".".join(["b" * 63] * 4) + "/x.js",
    "a host with an underscore": "https://under_score.example.net/x.js",
    "an ipv6 literal": "https://[::1]/x.js",
    "an ipv6 literal with a port": "http://[2001:db8::1]:8080/x.js",
    "a javascript address": "javascript:alert(1)",
    "a data address": "data:text/javascript,alert(1)",
    "a blob address": "blob:https://cdn.example.net/1f2e3d",
    "an ftp address": "ftp://cdn.example.net/x.js",
    "a port over 65535": "https://cdn.example.net:99999/x.js",
    "five numbers": "https://1.2.3.4.5/x.js",
    "a number over 255": "https://256.1.1.1/x.js",
    "a space in the host": "https://cdn .example.net/x.js",
    "an empty host": "https:///",
    "a scheme with one slash, whose host depends on the page": "https:/evil.example/x.js",
    "a scheme with no slash, whose host depends on the page": "https:evil.example/x.js",
    "a protocol-relative https port, whose meaning depends on the page": "//cdn.example.net:443/x.js",
}


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def listed_for(client, head):
    r = client.post(REVIEW, json={"files": [{"name": "index.html", "html": page("Hostile", "<p>x</p>", head)}]})
    assert r.status_code == 200, r.text[:400]
    found = r.json()["pages"][0]
    assert "outside" in found, f"the review has no outside list: {sorted(found)}"
    return found["outside"]


def one_with_control(client, tag):
    listed = listed_for(client, tag + f'<script src="{CONTROL}"></script>')
    assert listed[-1:] and listed[-1]["host"] == "control.example.net", f"the control script was not listed, so the page was not read: {listed}"
    return listed[:-1]


def url_host(url):
    assert url.startswith(("https://", "http://", "//")), f"the listed address is not absolute or protocol-relative: {url!r}"
    authority = url.split("//", 1)[1]
    for end in "/?#":
        authority = authority.split(end, 1)[0]
    assert "\\" not in authority and "@" not in authority, f"a browser would read another host out of the listed address {url!r}"
    return authority


@pytest.mark.parametrize("reference, host", LISTED)
@pytest.mark.parametrize("kind", ["script", "stylesheet"])
def test_an_outside_file_is_named_with_the_host_a_browser_loads_it_from(client, blank, reference, host, kind):
    tag = f'<script src="{reference}"></script>' if kind == "script" else f'<link rel="stylesheet" href="{reference}">'
    listed = one_with_control(client, tag)
    assert [(item["kind"], item["host"]) for item in listed] == [(kind, host)], f"{reference!r} loads from {host}, the review named {listed}"
    assert url_host(listed[0]["url"]) == host, f"the listed address {listed[0]['url']!r} does not lead to {host}"


@pytest.mark.parametrize("reference, host", LISTED_OR_LEFT_OUT)
def test_an_outside_file_is_named_with_the_host_a_browser_loads_it_from_or_not_at_all(client, blank, reference, host):
    listed = one_with_control(client, f'<script src="{reference}"></script>')
    assert listed == [] or [item["host"] for item in listed] == [host], f"{reference!r} loads from {host}, the review named {listed}"
    assert all(url_host(item["url"]) == host for item in listed), listed


@pytest.mark.parametrize("case", list(LEFT_OUT))
def test_an_address_that_does_not_name_one_outside_host_is_not_listed(client, blank, case):
    reference = LEFT_OUT[case]
    listed = one_with_control(client, f'<script src="{reference}"></script><link rel="stylesheet" href="{reference}">')
    assert listed == [], f"{case} was listed: {listed}"


def test_the_spoofed_host_is_named_as_the_real_one_inside_a_zip_too(client, blank):
    sample = page("Spoof", "<p>x</p>", '<script src="https://tracker.example\\@cdn.example.net/x.js"></script><link rel="stylesheet" href="\\\\evil.example/y.css">')
    r = client.post(REVIEW, content=zip_of({"index.html": sample}))
    assert r.status_code == 200, r.text[:400]
    listed = r.json()["pages"][0]["outside"]
    assert [(item["kind"], item["host"]) for item in listed] == [("script", "tracker.example"), ("stylesheet", "evil.example")]
    assert [url_host(item["url"]) for item in listed] == ["tracker.example", "evil.example"], listed


@pytest.mark.parametrize("reference", [
    "https://user:secret@cred.example.net/a.js",
    "https://user@cred.example.net/a.js",
    "//user:secret@cred.example.net/a.js",
    "https://user:secret@cred.example.net:8443/a.js",
    "https:\\\\user:secret@cred.example.net\\a.js",
])
def test_credentials_in_an_address_never_appear_in_the_listed_host_or_address(client, blank, reference):
    listed = one_with_control(client, f'<script src="{reference}"></script>')
    assert [item["host"].split(":")[0] for item in listed] == ["cred.example.net"], listed
    for item in listed:
        assert "user" not in item["host"] + item["url"] and "secret" not in item["host"] + item["url"], item
        assert "@" not in item["url"].split("/")[2], item


def test_an_international_host_is_listed_in_its_ascii_form_and_the_list_is_plain_json(client, blank):
    listed = one_with_control(client, '<script src="https://bücher.example/a.js"></script><link rel="stylesheet" href="https://cdn.example.net/&lt;b&gt;.css">')
    assert [item["host"] for item in listed] == ["xn--bcher-kva.example", "cdn.example.net"]
    assert all(item["host"].isascii() for item in listed)
    assert json.loads(json.dumps(listed, ensure_ascii=True)) == listed
    assert all(set(item) == {"kind", "host", "url"} and all(isinstance(v, str) for v in item.values()) for item in listed)


def test_a_stylesheet_with_an_unterminated_import_of_96_kib_is_reviewed_within_the_bound(client, blank):
    stalling = "h1{color:#123456}\n@import " + "a" * (96 * 1024)
    data = zip_of({"index.html": page("Stall", "<h1>x</h1>", '<link rel="stylesheet" href="css/site.css"><link rel="stylesheet" href="https://cdn.example.net/look.css">'), "css/site.css": stalling})
    r = answered_within(BOUND, lambda: client.post(REVIEW, content=data))
    assert r.status_code == 200, r.text[:400]
    found = r.json()["pages"][0]
    assert [item["host"] for item in found["outside"]] == ["cdn.example.net"]
    assert client.get("/api/health").status_code == 200
