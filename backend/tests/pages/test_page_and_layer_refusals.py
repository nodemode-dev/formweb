import pytest


@pytest.fixture()
def nested(client):
    r = client.post("/api/new", json={"name": "Nested", "blank": True})
    assert r.status_code == 200, r.text
    root = r.json()["site"]["pages"][0]["root"]
    adds = [("outer", "section", root, ""), ("inner", "div", "outer", ""), ("leaf", "p", "inner", "leaf")]
    added = client.post("/api/batch", json={"commands": [{"command": "node.add", "params": {"parent": parent, "node": {"id": i, "tag": tag, "text": text}}} for i, tag, parent, text in adds]})
    assert added.status_code == 200, added.text
    return root


def site_of(client):
    return client.get("/api/state").json()["site"]


@pytest.mark.parametrize("params", [
    {"id": "outer", "parent": "outer", "index": 0},
    {"id": "outer", "parent": "inner", "index": 0},
    {"id": "outer", "parent": "leaf", "index": 0},
    {"id": "inner", "parent": "no-such-node", "index": 0},
], ids=["into itself", "into its child", "into its grandchild", "into nothing"])
def test_a_layer_move_that_would_break_the_tree_is_refused_and_changes_nothing(client, nested, params):
    before = site_of(client)
    r = client.post("/api/command", json={"command": "node.move", "params": params})
    assert 400 <= r.status_code < 500
    assert site_of(client) == before


def test_the_page_root_cannot_be_moved_into_its_own_content(client, nested):
    before = site_of(client)
    r = client.post("/api/command", json={"command": "node.move", "params": {"id": nested, "parent": "outer", "index": 0}})
    assert 400 <= r.status_code < 500
    assert site_of(client) == before


def test_the_last_page_cannot_be_deleted(client, nested):
    before = site_of(client)
    r = client.post("/api/command", json={"command": "page.remove", "params": {"id": before["pages"][0]["id"]}})
    assert 400 <= r.status_code < 500
    assert site_of(client) == before


def test_deleting_several_pages_in_one_batch_is_one_undo_step_and_keeps_one_page(client, nested):
    for name in ("A", "B", "C"):
        client.post("/api/command", json={"command": "page.add", "params": {"name": name, "slug": "/" + name.lower()}})
    before = site_of(client)
    ids = [p["id"] for p in before["pages"][1:]]
    r = client.post("/api/batch", json={"commands": [{"command": "page.remove", "params": {"id": i}} for i in ids]})
    assert r.status_code == 200, r.text
    assert [p["id"] for p in site_of(client)["pages"]] == [before["pages"][0]["id"]]
    client.post("/api/command", json={"command": "history.undo", "params": {}})
    assert site_of(client) == before


def test_a_duplicated_page_gets_its_own_address_and_is_one_undo_step(client, nested):
    before = site_of(client)
    home = before["pages"][0]
    r = client.post("/api/command", json={"command": "page.duplicate", "params": {"id": home["id"], "name": "Home copy", "slug": "/home-copy"}})
    assert r.status_code == 200, r.text
    after = site_of(client)
    copy = next(p for p in after["pages"] if p["slug"] == "/home-copy")
    assert copy["name"] == "Home copy" and copy["root"] != home["root"]
    texts = [after["nodes"][n].get("text") for n in after["nodes"] if after["nodes"][n].get("text") == "leaf"]
    assert len(texts) == 2
    client.post("/api/command", json={"command": "history.undo", "params": {}})
    assert site_of(client) == before


def test_a_duplicate_onto_an_address_in_use_is_refused(client, nested):
    before = site_of(client)
    r = client.post("/api/command", json={"command": "page.duplicate", "params": {"id": before["pages"][0]["id"], "name": "Clash", "slug": "/"}})
    assert 400 <= r.status_code < 500
    assert site_of(client) == before
