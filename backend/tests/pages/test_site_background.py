import io
import json
import re
import zipfile

import pytest

INK = "#0b1d2a"


@pytest.fixture()
def three_pages(client):
    r = client.post("/api/new", json={"name": "Three", "blank": True})
    assert r.status_code == 200, r.text
    for name in ("Contact", "Hello"):
        added = client.post("/api/command", json={"command": "page.add", "params": {"name": name, "slug": "/" + name.lower()}})
        assert added.status_code == 200, added.text
    return client.get("/api/state").json()["site"]


def site_of(client):
    return client.get("/api/state").json()["site"]


def site_background_on_every_page(site, color=INK):
    return [{"command": "token.set", "params": {"name": "page-background", "value": color}}] + [
        {"command": "node.update", "params": {"id": page["root"], "patch": {"styles": {"background": "var(--page-background)"}}}} for page in site["pages"]
    ]


def exported(client):
    r = client.get("/api/export")
    assert r.status_code == 200
    return zipfile.ZipFile(io.BytesIO(r.content))


def page_css(archive, page):
    route = next(r for r in json.loads(archive.read("routes.json")) if r["page"] == page["id"])
    html = archive.read(route["path"]).decode()
    linked = [name for name in archive.namelist() if name.endswith(".css") and name in html]
    return "".join(archive.read(name).decode() for name in linked) + html


def declarations(css, selector):
    found = []
    for chosen, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        if selector in [part.strip() for part in chosen.split(",")]:
            found += [item.strip() for item in body.split(";") if item.strip()]
    return found


def test_the_agent_recipe_gives_every_exported_page_the_site_background_token(client, three_pages):
    r = client.post("/api/batch", json={"commands": site_background_on_every_page(three_pages)})
    assert r.status_code == 200, r.text
    archive = exported(client)
    for page in three_pages["pages"]:
        css = page_css(archive, page)
        assert f"--page-background:{INK}" in declarations(css, ":root")
        assert "background:var(--page-background)" in declarations(css, f'[data-fw-node="{page["root"]}"]')


def test_the_site_background_and_its_pages_are_one_undo_step(client, three_pages):
    before = site_of(client)
    assert client.post("/api/batch", json={"commands": site_background_on_every_page(three_pages)}).status_code == 200
    after = site_of(client)
    assert after["tokens"]["page-background"] == INK
    client.post("/api/command", json={"command": "history.undo", "params": {}})
    assert site_of(client) == before


def test_changing_the_token_changes_every_page_on_it_and_nothing_else(client, three_pages):
    assert client.post("/api/batch", json={"commands": site_background_on_every_page(three_pages)}).status_code == 200
    before = site_of(client)
    assert client.post("/api/command", json={"command": "token.set", "params": {"name": "page-background", "value": "#fdf6e3"}}).status_code == 200
    after = site_of(client)
    assert after["nodes"] == before["nodes"]
    css = page_css(exported(client), three_pages["pages"][2])
    assert "--page-background:#fdf6e3" in declarations(css, ":root")


def test_a_dark_theme_value_of_the_site_background_reaches_the_export(client, three_pages):
    themes = {"default": "light", "followSystem": True, "values": {"dark": {"page-background": "#101010"}}}
    batch = site_background_on_every_page(three_pages, "#fafafa") + [{"command": "design.set", "params": {"key": "themes", "value": themes}}]
    assert client.post("/api/batch", json={"commands": batch}).status_code == 200
    css = page_css(exported(client), three_pages["pages"][1])
    assert "--page-background:#101010" in declarations(css, 'html[data-theme="dark"]')


def test_a_saved_site_without_the_token_opens_unchanged_and_new_pages_stay_white(client, three_pages):
    saved = client.get("/api/project-file").content
    client.post("/api/new", json={"name": "Other", "blank": True})
    assert client.post("/api/load", content=saved, headers={"content-type": "application/json"}).status_code == 200
    reopened = site_of(client)
    assert reopened == json.loads(saved)["site"]
    assert "page-background" not in reopened["tokens"]
    added = client.post("/api/command", json={"command": "page.add", "params": {"name": "Later", "slug": "/later"}})
    assert added.status_code == 200
    later = next(p for p in site_of(client)["pages"] if p["name"] == "Later")
    assert not any(key.startswith("background") for key in site_of(client)["nodes"][later["root"]]["styles"])
