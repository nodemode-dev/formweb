import base64
import copy
import hashlib
import io
import json

import pytest
from PIL import Image

from conftest import DATA_ENV


def png_bytes(color=(200, 30, 30)):
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), color).save(buffer, "PNG")
    return buffer.getvalue()


def edit(client, commands):
    r = client.post("/api/batch", json={"commands": commands})
    assert r.status_code == 200, r.text
    return r.json()


def download(client):
    r = client.get("/api/project-file")
    assert r.status_code == 200
    assert 'filename="site.fweb"' in r.headers["content-disposition"]
    return r.json()


def upload(client, data):
    r = client.post("/api/assets", content=data, headers={"content-type": "image/png", "x-filename": "pic.png"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def edited(client):
    return edit(client, [
        {"command": "node.add", "params": {"parent": "work", "node": {"id": "note-a", "tag": "p", "text": "first"}}},
        {"command": "token.set", "params": {"name": "mark", "value": "#102030"}},
    ])


def stable(envelope):
    copy_ = copy.deepcopy(envelope)
    copy_.get("checkpoint", {}).pop("revision", None)
    return copy_


def test_the_native_file_has_its_documented_envelope(client, fresh):
    envelope = download(client)
    assert envelope["format"] == "com.nodemode.formweb"
    assert envelope["version"] == 1
    assert envelope["site"] == client.get("/api/state").json()["site"]
    assert envelope["checkpoint"]["site"] == envelope["site"]
    assert envelope["assets"] == []


def test_save_load_save_gives_equal_files_and_the_same_document(client, fresh):
    edited(client)
    first = download(client)
    original = client.get("/api/state").json()["site"]
    r = client.post("/api/load", content=json.dumps(first))
    assert r.status_code == 200, r.text
    assert client.get("/api/state").json()["site"] == original
    second = download(client)
    assert stable(second) == stable(first)
    assert json.dumps(stable(second), sort_keys=True) == json.dumps(stable(first), sort_keys=True)


def test_the_loaded_document_equals_the_original_after_a_third_pass(client, fresh):
    edited(client)
    first = download(client)
    for _ in range(2):
        assert client.post("/api/load", content=json.dumps(download(client))).status_code == 200
    assert stable(download(client)) == stable(first)


def test_undo_history_travels_with_the_file(client, fresh):
    before = client.get("/api/state").json()["site"]
    edited(client)
    edit(client, [{"command": "token.set", "params": {"name": "second", "value": "#000"}}])
    after = client.get("/api/state").json()["site"]
    saved = download(client)
    client.post("/api/new", json={"name": "Elsewhere"})
    assert client.post("/api/load", content=json.dumps(saved)).status_code == 200
    state = client.get("/api/state").json()
    assert state["site"] == after and state["canUndo"] is True
    client.post("/api/command", json={"command": "history.undo", "params": {}})
    client.post("/api/command", json={"command": "history.undo", "params": {}})
    assert client.get("/api/state").json()["site"] == before


def test_a_file_without_a_checkpoint_loads_as_a_plain_site(client, fresh):
    edited(client)
    envelope = download(client)
    del envelope["checkpoint"]
    client.post("/api/new", json={"name": "Elsewhere"})
    assert client.post("/api/load", content=json.dumps(envelope)).status_code == 200
    state = client.get("/api/state").json()
    assert state["site"] == envelope["site"]
    assert state["canUndo"] is False


def test_images_are_embedded_and_come_back_byte_for_byte(client, fresh):
    data = png_bytes()
    name = upload(client, data)
    assert name == hashlib.sha256(data).hexdigest() + ".png"
    edit(client, [{"command": "node.add", "params": {"parent": "work", "node": {"id": "pic", "tag": "img", "attrs": {"src": f"/api/assets/{name}", "alt": "red"}}}}])
    envelope = download(client)
    assert [a["id"] for a in envelope["assets"]] == [name]
    assert base64.b64decode(envelope["assets"][0]["content"]) == data
    from app.config import DATA_DIR

    (DATA_DIR / "assets" / name).unlink()
    assert client.get(f"/api/assets/{name}").status_code == 404
    assert client.post("/api/load", content=json.dumps(envelope)).status_code == 200
    restored = client.get(f"/api/assets/{name}")
    assert restored.status_code == 200 and restored.content == data
    assert stable(download(client)) == stable(envelope)


@pytest.mark.parametrize(
    "change",
    [
        lambda e: e.update(format="com.example.other"),
        lambda e: e.update(version=2),
        lambda e: e.pop("site"),
        lambda e: e["checkpoint"].update(schemaVersion=2),
        lambda e: e["checkpoint"].update(revision=-1),
        lambda e: e["checkpoint"].update(undo="no"),
        lambda e: e["checkpoint"]["site"].update(name="different from the envelope site"),
        lambda e: e["site"]["nodes"]["root"]["children"].append("ghost"),
        lambda e: e.update(assets=[{"id": "0" * 64 + ".png", "mime": "image/png", "encoding": "base64", "content": base64.b64encode(b"not the digest").decode()}]),
        lambda e: e.update(assets=[{"id": "../x.png", "mime": "image/png", "encoding": "base64", "content": ""}]),
        lambda e: e.update(assets="nope"),
    ],
)
def test_a_damaged_native_file_is_refused_and_the_open_site_is_untouched(client, fresh, change):
    edited(client)
    envelope = download(client)
    open_site = client.get("/api/state").json()
    change(envelope)
    r = client.post("/api/load", content=json.dumps(envelope))
    assert r.status_code >= 400
    assert client.get("/api/state").json() == open_site


def test_a_file_that_is_not_json_is_refused(client, fresh):
    assert client.post("/api/load", content=b"{not json").status_code == 400
    assert client.post("/api/load", content=b"[]").status_code >= 400


def test_a_saved_project_downloads_as_the_same_file_it_was_saved_from(client, fresh):
    edited(client)
    saved = client.post("/api/projects/save", json={"name": "Round trip"})
    assert saved.status_code == 200, saved.text
    project_id = next(p["id"] for p in client.get("/api/projects").json()["projects"] if p["name"] == "Round trip")
    from_store = client.get(f"/api/projects/{project_id}/file").json()
    live = download(client)
    assert from_store["site"] == live["site"]
    client.post("/api/new", json={"name": "Elsewhere"})
    assert client.post(f"/api/projects/{project_id}/open").status_code == 200
    assert client.get("/api/state").json()["site"] == live["site"]
