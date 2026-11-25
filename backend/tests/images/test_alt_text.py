import io
import json
import zipfile
from html.parser import HTMLParser
from pathlib import Path

import pytest

from site_zips import png_bytes

DEMOS = Path(__file__).resolve().parents[3] / "frontend" / "public" / "demos"
DEMO_FILES = sorted(DEMOS.glob("*/site.fweb"))
MISSING_ALT = "Image needs alt text (empty alt is valid for decoration)"


class Images(HTMLParser):
    def __init__(self):
        super().__init__()
        self.found = []

    def handle_starttag(self, tag, attrs):
        if tag == "img":
            self.found.append(dict(attrs))

    handle_startendtag = handle_starttag


@pytest.fixture()
def picture(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    root = r.json()["site"]["pages"][0]["root"]
    uploaded = client.post("/api/assets", content=png_bytes(), headers={"content-type": "image/png", "x-filename": "pic.png"})
    assert uploaded.status_code == 200, uploaded.text
    return root, f"/api/assets/{uploaded.json()['id']}"


def add_image(client, root, src, attrs):
    r = client.post("/api/batch", json={"commands": [{"command": "node.add", "params": {"parent": root, "node": {"id": "pic", "tag": "img", "attrs": {"src": src, **attrs}}}}]})
    assert r.status_code == 200, r.text


def alt_issues(client):
    issues = client.get("/api/audit").json()["issues"]
    return [i for i in issues if i.get("node") == "pic" and i["message"] == MISSING_ALT]


def exported_images(client):
    r = client.get("/api/export")
    assert r.status_code == 200
    archive = zipfile.ZipFile(io.BytesIO(r.content))
    parser = Images()
    parser.feed(archive.read("index.html").decode("utf-8"))
    return [img for img in parser.found if "data-fw-poster" not in img]


def test_a_new_image_without_alt_is_reported_by_the_audit_and_exports_with_no_alt(client, picture):
    root, src = picture
    add_image(client, root, src, {})
    assert len(alt_issues(client)) == 1
    images = exported_images(client)
    assert len(images) == 1
    assert "alt" not in images[0]


def test_an_image_marked_decorative_with_an_empty_alt_is_not_reported_and_exports_an_empty_alt(client, picture):
    root, src = picture
    add_image(client, root, src, {"alt": ""})
    assert alt_issues(client) == []
    images = exported_images(client)
    assert len(images) == 1
    assert "alt" in images[0] and images[0]["alt"] in ("", None)


def test_an_image_with_a_description_is_not_reported_and_exports_that_text(client, picture):
    root, src = picture
    add_image(client, root, src, {"alt": "A red tile on the kiln shelf"})
    assert alt_issues(client) == []
    assert [img.get("alt") for img in exported_images(client)] == ["A red tile on the kiln shelf"]


def test_clearing_a_typed_description_brings_the_audit_report_back(client, picture):
    root, src = picture
    add_image(client, root, src, {"alt": "typed"})
    assert alt_issues(client) == []
    r = client.post("/api/command", json={"command": "node.update", "params": {"id": "pic", "patch": {"attrs": {"alt": None}}}})
    assert r.status_code == 200, r.text
    assert "alt" not in client.get("/api/state").json()["site"]["nodes"]["pic"]["attrs"]
    assert len(alt_issues(client)) == 1


def image_alts(site):
    return {nid: (("alt" in n["attrs"]), n["attrs"].get("alt")) for nid, n in site["nodes"].items() if n["tag"] == "img"}


@pytest.mark.parametrize("path", DEMO_FILES, ids=[p.parent.name for p in DEMO_FILES])
def test_opening_a_saved_demo_leaves_every_image_alt_as_saved(client, path):
    envelope = json.loads(path.read_text(encoding="utf-8"))
    r = client.post("/api/load", content=json.dumps(envelope))
    assert r.status_code == 200, r.text[:300]
    assert image_alts(client.get("/api/state").json()["site"]) == image_alts(envelope["site"])


def test_opening_an_older_site_whose_image_has_no_alt_does_not_add_one(client):
    envelope = json.loads((DEMOS / "looking-back" / "site.fweb").read_text(encoding="utf-8"))
    envelope.pop("checkpoint", None)
    images = [n for n in envelope["site"]["nodes"].values() if n["tag"] == "img"]
    described = next(n for n in images if n["attrs"].get("alt"))
    decorative = next(n for n in images if n["attrs"].get("alt") == "")
    del described["attrs"]["alt"]
    r = client.post("/api/load", content=json.dumps(envelope))
    assert r.status_code == 200, r.text[:300]
    nodes = client.get("/api/state").json()["site"]["nodes"]
    assert "alt" not in nodes[described["id"]]["attrs"]
    assert nodes[decorative["id"]]["attrs"]["alt"] == ""
    assert image_alts({"nodes": nodes}) == image_alts(envelope["site"])
