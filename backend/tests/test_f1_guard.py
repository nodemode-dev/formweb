import json

import pytest
from starlette.websockets import WebSocketDisconnect

from conftest import ENGINE_PORT, HEALTH_PATH, LOOPBACK, WINDOW_ORIGINS, WS_PATH, own_origin

FOREIGN_ORIGINS = [
    "http://evil.example",
    "https://evil.example",
    f"http://localhost.evil.com:{ENGINE_PORT}",
    f"http://127.0.0.1.evil.com:{ENGINE_PORT}",
    "http://localhost:3099",
    "http://127.0.0.1:3099",
    "null",
    "file://",
]

FOREIGN_HOSTS = ["evil.example", f"evil.example:{ENGINE_PORT}", f"localhost.evil.com:{ENGINE_PORT}", f"192.168.1.10:{ENGINE_PORT}", "localhost", "127.0.0.1"]

PUBLIC_PATHS = ["/published/none/v1/index.html", "/sites/none/", "/preview/none/index.html", "/api/runtime/none"]
PRIVATE_PATHS = ["/api/state", "/api/projects", "/api/system", HEALTH_PATH, "/api/project-file"]


def test_foreign_origins_are_not_in_the_apps_own_list():
    assert not set(FOREIGN_ORIGINS) & set(WINDOW_ORIGINS)


def test_the_window_origin_list_is_what_the_app_ships():
    from app.config import ORIGINS

    assert sorted(ORIGINS) == sorted(WINDOW_ORIGINS)


@pytest.mark.parametrize("host", FOREIGN_HOSTS)
def test_foreign_host_is_refused(client, host):
    assert client.get(HEALTH_PATH, headers={"host": host}).status_code == 421


@pytest.mark.parametrize("origin", FOREIGN_ORIGINS)
def test_foreign_origin_is_refused(client, origin):
    assert client.get(HEALTH_PATH, headers={"origin": origin}).status_code == 403


@pytest.mark.parametrize("origin", FOREIGN_ORIGINS)
def test_foreign_origin_cannot_post(client, origin):
    assert client.post("/api/new", json={}, headers={"origin": origin}).status_code == 403


@pytest.mark.parametrize("origin", ["http://evil.example", "null"])
def test_foreign_origin_is_refused_on_public_paths_too(client, origin):
    for path in PUBLIC_PATHS:
        assert client.get(path, headers={"origin": origin}).status_code == 403, path


@pytest.mark.parametrize("path", PRIVATE_PATHS)
def test_cross_site_request_without_origin_is_refused_on_private_paths(client, path):
    assert client.get(path, headers={"sec-fetch-site": "cross-site"}).status_code == 403


def test_cross_site_post_without_origin_is_refused(client):
    assert client.post("/api/new", json={}, headers={"sec-fetch-site": "cross-site"}).status_code == 403
    assert client.post("/mcp", json={}, headers={"sec-fetch-site": "cross-site"}).status_code == 403


@pytest.mark.parametrize("value", ["CROSS-SITE", " cross-site "])
def test_cross_site_marker_is_read_loosely(client, value):
    assert client.get(HEALTH_PATH, headers={"sec-fetch-site": value}).status_code == 403


@pytest.mark.parametrize("path", PUBLIC_PATHS)
def test_public_paths_stay_open_cross_site(client, path):
    response = client.get(path, headers={"sec-fetch-site": "cross-site"})
    assert response.status_code not in (401, 403, 421), (path, response.status_code, response.text[:200])


def test_public_form_submit_is_reachable_cross_site_and_gated_by_its_own_checks(client):
    response = client.post("/api/forms/none/none", json={}, headers={"sec-fetch-site": "cross-site"})
    assert response.status_code == 404


@pytest.mark.parametrize("origin", [own_origin(), *WINDOW_ORIGINS])
def test_allowed_origin_passes(client, origin):
    assert client.get(HEALTH_PATH, headers={"origin": origin}).status_code == 200


@pytest.mark.parametrize("site", ["same-origin", "same-site", "none"])
def test_browser_request_without_origin_passes_unless_cross_site(client, site):
    assert client.get(HEALTH_PATH, headers={"sec-fetch-site": site}).status_code == 200


def test_plain_client_without_origin_passes(client):
    assert client.get(HEALTH_PATH).status_code == 200


def test_cross_site_with_the_window_origin_passes(client):
    assert client.get(HEALTH_PATH, headers={"sec-fetch-site": "cross-site", "origin": "http://localhost:5240"}).status_code == 200


@pytest.mark.parametrize("host", [f"127.0.0.1:{ENGINE_PORT}", f"localhost:{ENGINE_PORT}", f"[::1]:{ENGINE_PORT}"])
def test_loopback_hosts_pass(client, host):
    assert client.get(HEALTH_PATH, headers={"host": host}).status_code == 200


def test_every_response_is_marked_nosniff_and_no_referrer(client):
    response = client.get(HEALTH_PATH)
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"


def refusal(client, headers):
    with client.websocket_connect(WS_PATH, headers=headers) as ws:
        message = json.loads(ws.receive_text())
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_text()
    return message, closed.value.code


@pytest.mark.parametrize(
    "headers,text",
    [
        ({"host": "evil.example"}, "loopback"),
        ({**LOOPBACK, "origin": "http://evil.example"}, "Origin is not allowed"),
        ({**LOOPBACK, "origin": "null"}, "Origin is not allowed"),
        ({**LOOPBACK, "origin": f"http://localhost.evil.com:{ENGINE_PORT}"}, "Origin is not allowed"),
        ({**LOOPBACK, "origin": "http://127.0.0.1:3099"}, "Origin is not allowed"),
    ],
)
def test_foreign_websocket_closes_4403_for_the_right_reason(client, headers, text):
    message, code = refusal(client, headers)
    assert code == 4403
    assert text in message["message"]


def test_websocket_from_the_window_origin_is_still_refused_while_agents_are_off(client):
    message, code = refusal(client, {**LOOPBACK, "origin": "http://localhost:5240"})
    assert code == 4403
    assert "Agents" in message["message"]
