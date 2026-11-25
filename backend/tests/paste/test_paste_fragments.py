import copy

import pytest

REFUSED = {"detail": "Only the FormWeb window can do this."}


@pytest.fixture()
def page_with_one_paragraph(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    root = r.json()["site"]["pages"][0]["root"]
    added = client.post("/api/command", json={"command": "node.add", "params": {"parent": root, "node": {"id": "source", "tag": "p", "text": "source"}}})
    assert added.status_code == 200, added.text
    fragment = client.post("/api/fragment", json={"node": "source"}).json()
    return root, fragment


def site_of(client):
    return client.get("/api/state").json()["site"]


def texts_under(site, root):
    return [site["nodes"][child]["text"] for child in site["nodes"][root]["children"]]


def numbered(fragment, count):
    made = []
    for n in range(count):
        item = copy.deepcopy(fragment)
        item["nodes"][item["root"]]["text"] = f"pasted {n}"
        made.append(item)
    return made


def test_sixty_four_fragments_paste_in_order(client, page_with_one_paragraph):
    root, fragment = page_with_one_paragraph
    r = client.post("/api/paste", json={"fragments": numbered(fragment, 64), "parent": root})
    assert r.status_code == 200, r.text
    assert texts_under(site_of(client), root) == ["source"] + [f"pasted {n}" for n in range(64)]


def test_fragments_pasted_at_an_index_keep_their_order_there(client, page_with_one_paragraph):
    root, fragment = page_with_one_paragraph
    r = client.post("/api/paste", json={"fragments": numbered(fragment, 3), "parent": root, "index": 0})
    assert r.status_code == 200, r.text
    assert texts_under(site_of(client), root) == ["pasted 0", "pasted 1", "pasted 2", "source"]


@pytest.mark.parametrize("fragments", [[], "numbered-65", "not a list", {"0": "x"}, 3], ids=["none", "sixty-five", "text", "object", "number"])
def test_a_fragments_value_outside_one_to_sixty_four_or_not_a_list_is_refused_and_pastes_nothing(client, page_with_one_paragraph, fragments):
    root, fragment = page_with_one_paragraph
    if fragments == "numbered-65":
        fragments = numbered(fragment, 65)
    before = site_of(client)
    r = client.post("/api/paste", json={"fragments": fragments, "parent": root})
    assert r.status_code == 400
    assert "64" in r.json()["detail"]
    assert site_of(client) == before


@pytest.mark.parametrize("spoil", ["format", "version", "missing asset", "not an object"])
def test_one_bad_fragment_among_good_ones_pastes_nothing(client, page_with_one_paragraph, spoil):
    root, fragment = page_with_one_paragraph
    items = numbered(fragment, 4)
    if spoil == "format":
        items[2]["format"] = "com.example.other"
    elif spoil == "version":
        items[2]["version"] = 999
    elif spoil == "missing asset":
        name = "0" * 64 + ".png"
        items[2]["assets"] = [name]
        items[2]["nodes"][items[2]["root"]] = {**items[2]["nodes"][items[2]["root"]], "tag": "img", "text": "", "attrs": {"src": f"/api/assets/{name}", "alt": ""}}
    else:
        items[2] = "fragment"
    before = site_of(client)
    r = client.post("/api/paste", json={"fragments": items, "parent": root})
    assert 400 <= r.status_code < 500
    assert isinstance(r.json()["detail"], str) and r.json()["detail"]
    assert site_of(client) == before


def test_many_fragments_are_one_undo_step(client, page_with_one_paragraph):
    root, fragment = page_with_one_paragraph
    before = site_of(client)
    assert client.post("/api/paste", json={"fragments": numbered(fragment, 5), "parent": root}).status_code == 200
    assert len(texts_under(site_of(client), root)) == 6
    client.post("/api/command", json={"command": "history.undo", "params": {}})
    assert site_of(client) == before


def test_a_single_fragment_still_pastes_with_the_fragment_field(client, page_with_one_paragraph):
    root, fragment = page_with_one_paragraph
    r = client.post("/api/paste", json={"fragment": numbered(fragment, 1)[0], "parent": root})
    assert r.status_code == 200, r.text
    site = site_of(client)
    assert texts_under(site, root) == ["source", "pasted 0"]
    assert site["nodes"][root]["children"][1] != "source"


def test_a_paste_of_fragments_without_the_window_key_is_refused_and_pastes_nothing(client, page_with_one_paragraph):
    root, fragment = page_with_one_paragraph
    before = site_of(client)
    r = client.post("/api/paste", json={"fragments": numbered(fragment, 2), "parent": root}, headers={"x-formweb-window-key": ""})
    assert r.status_code == 403
    assert r.json() == REFUSED
    assert site_of(client) == before
