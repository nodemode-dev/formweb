import pytest


@pytest.fixture()
def two_pages(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    r = client.post("/api/command", json={"command": "page.add", "params": {"name": "Prices", "slug": "/prices"}})
    assert r.status_code == 200, r.text


def state_of(client):
    return client.get("/api/state").json()


@pytest.mark.parametrize("slug", ["/", "/prices"])
def test_adding_a_page_at_an_address_already_in_use_is_refused_with_a_reason_and_adds_nothing(client, two_pages, slug):
    before = state_of(client)
    r = client.post("/api/command", json={"command": "page.add", "params": {"name": "Again", "slug": slug}})
    assert r.status_code == 400
    assert "slug" in r.json()["detail"]
    after = state_of(client)
    assert after["site"] == before["site"] and after["revision"] == before["revision"]


def test_moving_a_page_onto_an_address_in_use_is_refused_and_keeps_both_addresses(client, two_pages):
    before = state_of(client)
    prices = next(p for p in before["site"]["pages"] if p["slug"] == "/prices")
    r = client.post("/api/command", json={"command": "page.update", "params": {"id": prices["id"], "patch": {"slug": "/"}}})
    assert 400 <= r.status_code < 500
    assert state_of(client)["site"] == before["site"]
