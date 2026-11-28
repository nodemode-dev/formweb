"""The service's download of one ticked outside file (plan B1 to B9). Only the network seam `outside_fetch.connect` is
replaced, so the address check, redirects, time limit, caps and content checks above it still run."""
import pytest

from app import outside_fetch

FETCH = "/api/library/outside/fetch"
DROP = "/api/library/outside/drop"
PUBLIC = "93.184.216.34"
WOFF2 = b"wOF2" + b"\x00" * 60


class Stream:
    def __init__(self, data, clock=None, step=0.0):
        self.data, self.clock, self.step, self.sent = data, clock, step, b""

    def sendall(self, data):
        self.sent += data

    def settimeout(self, seconds):
        pass

    def close(self):
        pass

    def recv_into(self, buffer):
        if self.clock is not None:
            self.clock.now += self.step
        n = min(len(buffer), len(self.data), 64)
        buffer[:n] = self.data[:n]
        self.data = self.data[n:]
        return n


def answer(body, ctype="text/css", status="200 OK", headers=""):
    data = body.encode() if isinstance(body, str) else body
    return f"HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {len(data)}\r\n{headers}\r\n".encode() + data


class Web:
    """Stands in for the network below the seam: each host answers with fixed addresses and fixed bytes."""

    def __init__(self, files, addresses=None):
        self.files, self.addresses, self.calls = files, addresses or {}, []

    def connect(self, host, port, pick, seconds):
        chosen = pick(self.addresses.get(host, [PUBLIC]))
        self.calls.append((host, port, chosen))
        return Stream(self.files[host]) if isinstance(self.files[host], bytes) else self.files[host]()


@pytest.fixture()
def web(monkeypatch):
    def install(files, addresses=None):
        fake = Web(files, addresses)
        monkeypatch.setattr(outside_fetch, "connect", fake.connect)
        return fake
    return install


def refused(client, url, kind="stylesheet", token=None, words=""):
    r = client.post(FETCH, json={"url": url, "kind": kind, "token": token})
    assert r.status_code >= 400, f"{url} as a {kind} was downloaded: {r.text[:300]}"
    detail = str(r.json().get("detail", r.json()))
    assert words.lower() in detail.lower(), f"the refusal of {url} says {detail!r}, expected it to mention {words!r}"
    return detail


@pytest.mark.parametrize("url, words", [
    ("http://cdn.example.net/look.css", "https"),
    ("https://cdn.example.net:8443/look.css", "port"),
    ("https://user:secret@cdn.example.net/look.css", "password"),
    ("https://cdn.example.net/" + "a" * 2050 + ".css", "2,048"),
], ids=["http", "another-port", "credentials", "over-2048"])
def test_only_https_on_the_default_port_without_credentials_and_short_enough_is_fetched(client, web, url, words):
    fake = web({"cdn.example.net": answer(".a{}")})
    refused(client, url, words=words)
    assert fake.calls == [], f"the refused address still reached the network: {fake.calls}"


@pytest.mark.parametrize("addresses", [
    ["127.0.0.1"], ["10.1.2.3"], ["169.254.169.254"], ["100.64.0.9"], ["::ffff:127.0.0.1"], [PUBLIC, "192.168.1.4"],
], ids=["loopback", "private", "link-local", "shared-100.64", "ipv4-mapped-loopback", "public-plus-private"])
def test_a_host_that_resolves_to_a_non_public_address_is_refused(client, web, addresses):
    web({"cdn.example.net": answer(".a{}")}, {"cdn.example.net": addresses})
    refused(client, "https://cdn.example.net/look.css", words="private network")


def test_a_seam_that_never_asks_for_the_address_check_is_refused(client, monkeypatch):
    monkeypatch.setattr(outside_fetch, "connect", lambda host, port, pick, seconds: Stream(answer(".a{}")))
    refused(client, "https://cdn.example.net/look.css", words="without its address being checked")


def test_the_connection_is_opened_to_exactly_the_address_the_check_returned(monkeypatch):
    opened = []

    class Sock:
        def __init__(self, *args):
            pass

        def settimeout(self, seconds):
            pass

        def connect(self, where):
            opened.append(where)
            raise OSError("stop here")

        def close(self):
            pass

    monkeypatch.setattr(outside_fetch, "_resolve", lambda host, port, seconds: ["8.8.8.8", "1.1.1.1"])
    monkeypatch.setattr(outside_fetch.socket, "socket", Sock)
    with pytest.raises(outside_fetch.EngineError):
        outside_fetch.connect("cdn.example.net", 443, lambda found: found[1], 5.0)
    assert opened == [("1.1.1.1", 443)], f"the seam connected to {opened}, the check chose 1.1.1.1"


def redirect(to):
    return answer("", status="302 Found", headers=f"Location: {to}\r\n")


def test_a_redirect_to_http_is_refused(client, web):
    web({"cdn.example.net": redirect("http://cdn.example.net/look.css")})
    refused(client, "https://cdn.example.net/look.css", words="not https")


def test_a_redirect_to_a_host_on_a_private_address_is_refused(client, web):
    fake = web({"cdn.example.net": redirect("https://inside.example.net/look.css"), "inside.example.net": answer(".a{}")}, {"inside.example.net": ["10.0.0.7"]})
    refused(client, "https://cdn.example.net/look.css", words="private network")
    assert [call[0] for call in fake.calls] == ["cdn.example.net"], fake.calls


def test_a_fourth_redirect_is_refused_while_three_are_followed(client, web):
    chain = {f"h{n}.example.net": redirect(f"https://h{n + 1}.example.net/x.css") for n in range(4)}
    web({**chain, "h3.example.net": answer(".ok{}")})
    r = client.post(FETCH, json={"url": "https://h0.example.net/x.css", "kind": "stylesheet"})
    assert r.status_code == 200 and r.json()["bytes"] == len(".ok{}"), r.text[:300]
    web({**chain, "h4.example.net": answer(".ok{}")})
    refused(client, "https://h0.example.net/x.css", words="redirects more than 3")


def test_a_body_over_the_cap_is_refused_while_it_is_read_when_no_length_is_given(client, web):
    body = b".a{}" * (256 * 1024 // 4 + 100)
    web({"cdn.example.net": b"HTTP/1.1 200 OK\r\nContent-Type: text/css\r\nConnection: close\r\n\r\n" + body})
    refused(client, "https://cdn.example.net/look.css", words="256 KiB")


def test_a_body_that_takes_longer_than_the_time_limit_is_refused(client, monkeypatch):
    class Clock:
        now = 1000.0

        def monotonic(self):
            return self.now

    clock = Clock()
    monkeypatch.setattr(outside_fetch, "time", clock)
    data = answer(".a{}" * 200)
    monkeypatch.setattr(outside_fetch, "connect", lambda host, port, pick, seconds: (pick([PUBLIC]), Stream(data, clock, 1.0))[1])
    refused(client, "https://cdn.example.net/look.css", words="longer than 10 seconds")


@pytest.mark.parametrize("kind, ctype, body, words", [
    ("stylesheet", "text/plain", ".a{}", "not text/css"),
    ("script", "text/plain", "1;", "not JavaScript"),
    ("stylesheet", "text/css", b"\xff\xfe.a{}", "not UTF-8"),
], ids=["stylesheet-as-text", "script-as-text", "not-utf8"])
def test_a_file_served_with_the_wrong_type_or_not_as_utf8_is_refused(client, web, kind, ctype, body, words):
    web({"cdn.example.net": answer(body, ctype)})
    refused(client, "https://cdn.example.net/file", kind=kind, words=words)


def stylesheet_naming_font(client, web, font_body):
    css = '@font-face{font-family:F;src:url("https://fonts.example.com/f.woff2") format("woff2")}'
    web({"cdn.example.net": answer(css), "fonts.example.com": answer(font_body, "font/woff2")})
    r = client.post(FETCH, json={"url": "https://cdn.example.net/look.css", "kind": "stylesheet"})
    assert r.status_code == 200, r.text[:300]
    assert [f["url"] for f in r.json()["fonts"]] == ["https://fonts.example.com/f.woff2"], r.json()
    return r.json()["token"]


def test_a_font_that_is_not_woff2_is_refused(client, web):
    token = stylesheet_naming_font(client, web, b"OTTO" + b"\x00" * 60)
    refused(client, "https://fonts.example.com/f.woff2", kind="font", token=token, words="not WOFF2")


def test_a_font_is_fetched_only_when_a_stylesheet_fetched_under_the_token_names_it(client, web):
    token = stylesheet_naming_font(client, web, WOFF2)
    ok = client.post(FETCH, json={"url": "https://fonts.example.com/f.woff2", "kind": "font", "token": token})
    assert ok.status_code == 200 and ok.json()["bytes"] == len(WOFF2), ok.text[:300]
    refused(client, "https://fonts.example.com/other.woff2", kind="font", token=token, words="names it")


def test_no_route_hands_back_the_body_of_a_fetched_file(client, web):
    secret = ".marker-7f3a{color:red}"
    web({"cdn.example.net": answer(secret)})
    r = client.post(FETCH, json={"url": "https://cdn.example.net/look.css", "kind": "stylesheet"})
    assert r.status_code == 200 and r.json()["bytes"] == len(secret), r.text[:300]
    assert "marker-7f3a" not in r.text, f"the fetch answer carries the file's body: {r.text[:300]}"
    d = client.post(DROP, json={"token": r.json()["token"], "url": "https://cdn.example.net/nothing.css"})
    assert d.status_code == 200 and "marker-7f3a" not in d.text, d.text[:300]
