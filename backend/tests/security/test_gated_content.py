import json
import os
import re
import struct
import zlib
from pathlib import Path

import pytest

from conftest import REPO

DEMO = REPO / "frontend" / "public" / "demos" / "harbour-ferries" / "site.fweb"
GATED = "/fares"
PASSWORD = "lantern-gate-31"
WORD = "QUOKKA-LANTERN-7"
OPAQUE = {"origin": "null"}


def png():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    rows = b"".join(b"\x00" + b"\x12\x34\x56" * 3 for _ in range(3))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 3, 3, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"tEXt", b"Comment\x00" + WORD.encode()) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def gated(client):
    r = client.post("/api/load", content=DEMO.read_bytes(), headers={"content-type": "application/json"})
    assert r.status_code == 200, r.text
    site = client.get("/api/state").json()["site"]
    fares = next(page for page in site["pages"] if page["slug"] == GATED)
    r = client.post("/api/assets", content=png(), headers={"content-type": "image/png", "x-filename": "fare-chart.png"})
    assert r.status_code == 200, r.text
    picture = r.json()["id"]
    for item in (
        {"id": "gate-word", "tag": "p", "name": "Secret fare", "attrs": {}, "styles": {}, "children": [], "text": f"The night fare code is {WORD}."},
        {"id": "gate-chart", "tag": "img", "name": "Fare chart", "attrs": {"src": f"/api/assets/{picture}", "alt": "Fare chart"}, "styles": {}, "children": []},
    ):
        r = client.post("/api/command", json={"command": "node.add", "params": {"parent": fares["root"], "node": item}})
        assert r.status_code == 200, r.text
    r = client.post("/api/page-passwords", json={"route": GATED, "password": PASSWORD})
    assert r.status_code == 200, r.text
    r = client.post("/api/publish", json={"slug": "lantern"})
    assert r.status_code == 200, r.text
    version = r.json()["version"]
    prefix = f"/published/lantern/{version}/"
    folder = Path(os.environ["FORMWEB_DATA_DIR"]) / "publications" / "lantern" / version
    home = client.get(prefix).text
    token = json.loads(re.search(r'id="fw-config">(.*?)</script>', home, re.S).group(1))["context"]["runtimeToken"]
    files = sorted(path.relative_to(folder).as_posix() for path in folder.rglob("*") if path.is_file())
    client.cookies.clear()
    return {"prefix": prefix, "folder": folder, "files": files, "token": token, "picture": picture}


def unlock(client, gated):
    own = {"origin": client.base_url.scheme + "://" + client.base_url.netloc.decode(), "content-type": "application/x-www-form-urlencoded"}
    r = client.post(gated["prefix"] + "__formweb_password", content=f"route={GATED}&password={PASSWORD}", headers=own, follow_redirects=False)
    assert r.status_code == 303
    client.cookies.clear()
    return r.headers["set-cookie"].split(";", 1)[0]


def test_the_gated_word_is_in_the_publication_only_on_its_own_page_and_picture(gated):
    holders = {name for name in gated["files"] if WORD.encode() in (gated["folder"] / name).read_bytes()}
    assert "fares/index.html" in holders
    assert f"assets/{gated['picture']}" in holders


@pytest.mark.parametrize("asker", ["plain", "opaque", "opaque-with-token"])
def test_no_file_of_a_publication_shows_a_password_protected_page_to_someone_without_the_password(client, gated, asker):
    headers = {"plain": {}, "opaque": OPAQUE, "opaque-with-token": {**OPAQUE, "x-formweb-runtime": gated["token"]}}[asker]
    names = gated["files"] + ["fares/", "fares", "404.html", "site.formweb.json", "search-index.json"]
    for name in names:
        r = client.get(gated["prefix"] + name, headers=headers)
        assert WORD.encode() not in r.content, f"{name} answered {r.status_code} with the gated word"
    r = client.get("/sites/lantern/fares/", headers=headers)
    assert WORD.encode() not in r.content


def test_a_local_publication_holds_no_copy_of_the_editable_site_document(gated):
    assert "site.formweb.json" not in gated["files"]
    assert "routes.json" in gated["files"]


def test_a_picture_used_only_on_a_protected_page_is_refused_without_the_password(client, gated):
    r = client.get(gated["prefix"] + "assets/" + gated["picture"])
    assert r.status_code == 401
    assert not r.content.startswith(b"\x89PNG")


def test_the_search_index_leaves_out_a_protected_page(client, gated):
    r = client.get(gated["prefix"] + "search-index.json", headers=OPAQUE)
    assert r.status_code == 200
    entries = r.json()
    assert entries, "the demo's search index is empty"
    assert all(entry["path"].strip("/") != GATED.strip("/") for entry in entries)
    assert WORD not in r.text


def test_the_unlocked_page_shows_its_picture_to_its_sandbox_through_its_own_key(client, gated):
    cookie = unlock(client, gated)
    r = client.get(gated["prefix"] + "fares/", headers={"cookie": cookie})
    assert r.status_code == 200
    assert WORD in r.text
    source = re.search(r'src="\.\./(_fw/[^"]+/assets/' + re.escape(gated["picture"]) + ')"', r.text).group(1)
    r = client.get(gated["prefix"] + source, headers=OPAQUE)
    assert r.status_code == 200
    assert r.content == png()
    assert r.headers["access-control-allow-origin"] == "null"
    assert client.get(gated["prefix"] + "assets/" + gated["picture"], headers={"cookie": cookie}).content == png()
