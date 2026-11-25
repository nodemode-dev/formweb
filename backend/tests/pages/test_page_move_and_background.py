import io
import json
import zipfile

import pytest


@pytest.fixture()
def four_pages(client):
    r = client.post("/api/new", json={"name": "Four", "blank": True})
    assert r.status_code == 200, r.text
    for name in "BCD":
        added = client.post("/api/command", json={"command": "page.add", "params": {"name": name, "slug": "/" + name.lower()}})
        assert added.status_code == 200, added.text
    return [p["id"] for p in client.get("/api/state").json()["site"]["pages"]]


def site_of(client):
    return client.get("/api/state").json()["site"]


def order(client):
    return [p["id"] for p in site_of(client)["pages"]]


def move(client, page, index):
    return client.post("/api/command", json={"command": "page.move", "params": {"id": page, "index": index}})


def key_paths(value, prefix=""):
    if isinstance(value, dict):
        found = {prefix}
        for key, inner in value.items():
            found |= key_paths(inner, f"{prefix}/{key}")
        return found
    if isinstance(value, list):
        found = {prefix}
        for inner in value:
            found |= key_paths(inner, f"{prefix}[]")
        return found
    return {prefix}


@pytest.mark.parametrize("which,index,expected", [(3, 1, [0, 3, 1, 2]), (0, 3, [1, 2, 3, 0]), (2, 0, [2, 0, 1, 3]), (1, 2, [0, 2, 1, 3])])
def test_moving_a_page_puts_it_at_the_index_and_shifts_the_pages_between(client, four_pages, which, index, expected):
    r = move(client, four_pages[which], index)
    assert r.status_code == 200, r.text
    assert order(client) == [four_pages[n] for n in expected]


@pytest.mark.parametrize("page,index", [("no-such-page", 0), (1, -1), (1, 4), (1, 40), (1, 1), (0, 0), (1, "2"), (1, 1.5)], ids=["unknown page", "negative", "one past the end", "far past the end", "the index it has", "home where it is", "text index", "fractional index"])
def test_a_page_move_that_cannot_happen_is_refused_and_changes_nothing(client, four_pages, page, index):
    page = four_pages[page] if isinstance(page, int) else page
    before = site_of(client)
    r = move(client, page, index)
    assert 400 <= r.status_code < 500
    assert r.json()["detail"]
    assert site_of(client) == before


def test_a_page_move_is_one_undo_step_and_redo_repeats_it(client, four_pages):
    before = site_of(client)
    assert move(client, four_pages[3], 0).status_code == 200
    after = site_of(client)
    client.post("/api/command", json={"command": "history.undo", "params": {}})
    assert site_of(client) == before
    client.post("/api/command", json={"command": "history.redo", "params": {}})
    assert site_of(client) == after


def test_a_page_move_adds_no_field_to_the_saved_site(client, four_pages):
    before = client.get("/api/project-file").json()
    assert move(client, four_pages[2], 0).status_code == 200
    after = client.get("/api/project-file").json()
    assert key_paths(after["site"]) == key_paths(before["site"])
    assert sorted(after["site"]["pages"], key=lambda p: p["id"]) == sorted(before["site"]["pages"], key=lambda p: p["id"])


def test_a_moved_page_order_survives_a_saved_project_reopened(client, four_pages):
    assert move(client, four_pages[3], 1).status_code == 200
    saved = client.get("/api/project-file").content
    client.post("/api/new", json={"name": "Other", "blank": True})
    loaded = client.post("/api/load", content=saved, headers={"content-type": "application/json"})
    assert loaded.status_code == 200, loaded.text
    assert order(client) == [four_pages[n] for n in (0, 3, 1, 2)]


def exported(client):
    r = client.get("/api/export")
    assert r.status_code == 200
    return zipfile.ZipFile(io.BytesIO(r.content))


def root_rules(archive, page):
    route = next(r for r in json.loads(archive.read("routes.json")) if r["page"] == page["id"])
    html = archive.read(route["path"]).decode()
    assert f'data-fw-node="{page["root"]}"' in html
    linked = [name for name in archive.namelist() if name.endswith(".css") and name in html]
    css = "".join(archive.read(name).decode() for name in linked) + html
    selector = f'[data-fw-node="{page["root"]}"]{{'
    rules = []
    at = css.find(selector)
    while at >= 0:
        rules.append(css[at + len(selector):css.index("}", at)])
        at = css.find(selector, at + 1)
    return rules


@pytest.mark.parametrize("value", ["#a1b2c3", "linear-gradient(90deg, #0f1e2d, #fedcba)"])
def test_a_page_background_set_on_its_root_reaches_that_page_in_the_export(client, four_pages, value):
    site = site_of(client)
    page, other = site["pages"][2], site["pages"][1]
    r = client.post("/api/command", json={"command": "node.update", "params": {"id": page["root"], "patch": {"styles": {"background": value}}}})
    assert r.status_code == 200, r.text
    archive = exported(client)
    assert any(f"background:{value};" in rule for rule in root_rules(archive, page))
    assert not any("background" in rule for rule in root_rules(archive, other))


def test_a_new_page_has_no_background_of_its_own_in_the_export(client, four_pages):
    site = site_of(client)
    archive = exported(client)
    for page in site["pages"][1:]:
        rules = root_rules(archive, page)
        assert rules
        assert not any("background" in rule for rule in rules)


def test_a_page_background_is_one_undo_step(client, four_pages):
    before = site_of(client)
    root = before["pages"][3]["root"]
    assert client.post("/api/command", json={"command": "node.update", "params": {"id": root, "patch": {"styles": {"background": "#010203"}}}}).status_code == 200
    client.post("/api/command", json={"command": "history.undo", "params": {}})
    assert site_of(client) == before
    assert not any("#010203" in rule for rule in root_rules(exported(client), before["pages"][3]))


def test_making_a_page_home_with_commands_moves_it_first_and_exports_it_as_index_html(client, four_pages):
    site = site_of(client)
    home, target = site["pages"][0], site["pages"][2]
    before = site_of(client)
    r = client.post("/api/batch", json={"commands": [
        {"command": "page.update", "params": {"id": home["id"], "patch": {"slug": "/home"}}},
        {"command": "page.update", "params": {"id": target["id"], "patch": {"slug": "/"}}},
        {"command": "page.move", "params": {"id": target["id"], "index": 0}},
    ]})
    assert r.status_code == 200, r.text
    assert order(client)[0] == target["id"]
    routes = {r["page"]: r["path"] for r in json.loads(exported(client).read("routes.json"))}
    assert routes[target["id"]] == "index.html"
    assert routes[home["id"]] == "home/index.html"
    client.post("/api/command", json={"command": "history.undo", "params": {}})
    assert site_of(client) == before
