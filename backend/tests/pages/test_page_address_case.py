import io
import zipfile

import pytest


@pytest.fixture()
def prices(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    r = client.post("/api/command", json={"command": "page.add", "params": {"name": "Prices", "slug": "/prices"}})
    assert r.status_code == 200, r.text
    return next(p for p in r.json()["site"]["pages"] if p["slug"] == "/prices")


def state_of(client):
    return client.get("/api/state").json()


def refused(client, command, params):
    before = state_of(client)
    r = client.post("/api/command", json={"command": command, "params": params})
    assert r.status_code == 400, r.text
    after = state_of(client)
    assert after["site"] == before["site"] and after["revision"] == before["revision"]
    return r.json()["detail"]


def test_a_page_at_an_address_another_page_has_in_capital_letters_is_refused_with_the_name_of_that_page(client, prices):
    detail = refused(client, "page.add", {"name": "Shouting", "slug": "/PRICES"})
    assert "Prices" in detail and "capital letters" in detail


def test_moving_duplicating_or_bulk_creating_onto_an_address_in_other_capitals_is_refused(client, prices):
    client.post("/api/command", json={"command": "page.add", "params": {"name": "Contact", "slug": "/contact"}})
    contact = next(p for p in state_of(client)["site"]["pages"] if p["slug"] == "/contact")
    assert "Prices" in refused(client, "page.update", {"id": contact["id"], "patch": {"slug": "/Prices"}})
    assert "Prices" in refused(client, "page.duplicate", {"id": contact["id"], "slug": "/pRiCeS"})
    assert "Contact" in refused(client, "page.bulk", {"template": prices["id"], "rows": [{"slug": "/CONTACT"}]})


def test_the_export_never_holds_two_paths_that_are_equal_ignoring_capital_letters(client, prices):
    for name, slug in [("Prices again", "/Prices"), ("Upper", "/PRICES"), ("Fares", "/fares"), ("Fares upper", "/FARES"), ("Nested", "/fares/child"), ("Nested upper", "/Fares/Child")]:
        client.post("/api/command", json={"command": "page.add", "params": {"name": name, "slug": slug}})
    pages = state_of(client)["site"]["pages"]
    assert sorted(p["slug"] for p in pages) == ["/", "/fares", "/fares/child", "/prices"]
    r = client.get("/api/export")
    assert r.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert len({name.lower() for name in names}) == len(names)
    assert {"fares/index.html", "fares/child/index.html", "prices/index.html"} <= set(names)
