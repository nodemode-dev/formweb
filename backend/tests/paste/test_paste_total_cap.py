import pytest

TOTAL_SENTENCE = "A paste can bring at most 8,000 elements in all. Copy fewer elements at a time."


@pytest.fixture()
def blank_root(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()["site"]["pages"][0]["root"]


def site_of(client):
    return client.get("/api/state").json()["site"]


def fragment_of(count, tag="p"):
    nodes = {"box": {"attrs": {}, "breakpoints": {}, "children": [f"n{i}" for i in range(1, count)], "id": "box", "name": "", "styles": {}, "tag": "div", "text": ""}}
    for i in range(1, count):
        nodes[f"n{i}"] = {"attrs": {}, "breakpoints": {}, "children": [], "id": f"n{i}", "name": "", "styles": {}, "tag": tag, "text": f"t{i}"}
    return {
        "format": "com.nodemode.formweb.fragment", "version": 1, "root": "box", "nodes": nodes,
        "entries": {}, "codeComponents": {}, "variables": {}, "locales": {}, "assets": [], "collections": {},
        "design": {"textPresets": {}, "themes": {}, "tokens": {}},
    }


def test_four_fragments_of_two_thousand_nodes_paste_eight_thousand_nodes_as_one_undo_step(client, blank_root):
    before = site_of(client)
    r = client.post("/api/paste", json={"fragments": [fragment_of(2000) for _ in range(4)], "parent": blank_root})
    assert r.status_code == 200, r.text[:500]
    after = site_of(client)
    assert len(after["nodes"]) - len(before["nodes"]) == 8000
    assert len(after["nodes"][blank_root]["children"]) == len(before["nodes"][blank_root]["children"]) + 4
    client.post("/api/command", json={"command": "history.undo", "params": {}})
    assert site_of(client) == before


def test_one_node_over_eight_thousand_in_all_is_refused_with_the_sentence_and_pastes_nothing(client, blank_root):
    before = site_of(client)
    r = client.post("/api/paste", json={"fragments": [fragment_of(2000) for _ in range(4)] + [fragment_of(1)], "parent": blank_root})
    assert r.status_code == 400
    assert r.json()["detail"] == TOTAL_SENTENCE
    assert site_of(client) == before


def test_many_small_fragments_over_the_total_are_refused_the_same_way(client, blank_root):
    before = site_of(client)
    r = client.post("/api/paste", json={"fragments": [fragment_of(126) for _ in range(64)], "parent": blank_root})
    assert r.status_code == 400
    assert r.json()["detail"] == TOTAL_SENTENCE
    assert site_of(client) == before
