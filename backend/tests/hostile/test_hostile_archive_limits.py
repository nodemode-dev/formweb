import io
import struct
import zipfile

import pytest

from site_zips import answered_within, page, zip_of, zip_with_symlink

REVIEW = "/api/library/import-site/review"
IMPORT = "/api/library/import-site"
BOUND = 30
NOTHING = "Nothing was imported."
INDEX = page("Home", "<p>ok</p>")
BOMB = b"a" * (4 * 1024 * 1024)
SOURCE = {"package.json": '{"name": "app", "scripts": {"build": "vite build"}}', "index.html": page("App", '<div id="root"></div>', '<script type="module" src="/src/main.tsx"></script>'), "src/main.tsx": "export {};\n"}


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def state_of(client):
    state = client.get("/api/state").json()
    return state["revision"], state["site"]


def claiming(data, entries):
    raw = bytearray(data)
    end = raw.rfind(b"PK\x05\x06")
    struct.pack_into("<HH", raw, end + 8, entries, entries)
    return bytes(raw)


def with_long_file_list(files, records=40, comment=60000):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
        for i in range(records):
            info = zipfile.ZipInfo(f"node_modules/pkg/f{i}.js")
            info.comment = b"c" * comment
            archive.writestr(info, "x")
    return buffer.getvalue()


def listing_size(data):
    end = data.rfind(b"PK\x05\x06")
    return struct.unpack("<I", data[end + 12:end + 16])[0]


def password_flagged(data):
    raw = bytearray(data)
    for signature, offset in ((b"PK\x03\x04", 6), (b"PK\x01\x02", 8)):
        at = raw.find(signature)
        while at >= 0:
            flags = struct.unpack_from("<H", raw, at + offset)[0]
            struct.pack_into("<H", raw, at + offset, flags | 0x1)
            at = raw.find(signature, at + 4)
    return bytes(raw)


def refused(client, route, data):
    before = state_of(client)
    r = answered_within(BOUND, lambda: client.post(route, content=data))
    assert state_of(client) == before, "a refused archive changed the site or its revision"
    assert 400 <= r.status_code < 500, (r.status_code, r.text[:400])
    assert client.get("/api/health").status_code == 200
    return r.status_code, r.json()["detail"]


@pytest.mark.parametrize("route", [REVIEW, IMPORT])
def test_an_archive_claiming_more_than_forty_thousand_entries_is_refused_unopened_and_says_what_to_zip(client, blank, route):
    data = claiming(zip_of({"index.html": INDEX, "big.css": BOMB}), 65535)
    status, detail = refused(client, route, data)
    assert status == 413
    assert "40,000" in detail
    assert "big.css" not in detail
    assert "zip only the folder that holds the finished site" in detail.lower()
    assert detail.endswith(NOTHING)


def test_an_archive_claiming_forty_thousand_and_one_entries_is_refused(client, blank):
    status, detail = refused(client, REVIEW, claiming(zip_of({"index.html": INDEX}), 40001))
    assert status == 413
    assert "40,000" in detail


def test_an_archive_claiming_exactly_forty_thousand_entries_is_opened_and_reviewed(client, blank):
    r = answered_within(BOUND, lambda: client.post(REVIEW, content=claiming(zip_of({"index.html": INDEX, "about.html": INDEX}), 40000)))
    assert r.status_code == 200, r.text[:400]
    assert sorted(p["file"] for p in r.json()["pages"]) == ["about.html", "index.html"]


@pytest.mark.parametrize("route", [REVIEW, IMPORT])
def test_an_archive_whose_file_list_is_over_two_mebibytes_is_refused_unopened_and_says_what_to_zip(client, blank, route):
    data = with_long_file_list({"index.html": INDEX, "big.css": BOMB})
    assert listing_size(data) > 2 * 1024 * 1024
    status, detail = refused(client, route, data)
    assert status == 413
    assert "big.css" not in detail
    assert "zip only the folder that holds the finished site" in detail.lower()
    assert detail.endswith(NOTHING)


def test_a_source_project_whose_archive_claims_too_many_entries_gets_the_source_sentence(client, blank):
    status, detail = refused(client, REVIEW, claiming(zip_of(SOURCE), 65535))
    assert status == 413
    assert "npm run build" in detail and "src/main.tsx" in detail
    assert "40,000" not in detail
    assert detail.endswith(NOTHING)


def test_a_source_project_whose_file_list_is_over_two_mebibytes_gets_the_source_sentence(client, blank):
    data = with_long_file_list(SOURCE)
    assert listing_size(data) > 2 * 1024 * 1024
    status, detail = refused(client, REVIEW, data)
    assert status == 413
    assert "npm run build" in detail and "src/main.tsx" in detail
    assert detail.endswith(NOTHING)


REFUSALS = {
    "an_empty_body": lambda: b"",
    "bytes_that_are_not_a_zip": lambda: b"<html><body>not a zip</body></html>" * 10,
    "a_symbolic_link_entry": lambda: zip_with_symlink(),
    "a_name_climbing_out_of_its_folder": lambda: zip_of({"index.html": INDEX, "../evil.html": INDEX}),
    "a_password_protected_entry": lambda: password_flagged(zip_of({"index.html": INDEX})),
    "an_entry_that_expands_a_thousand_times": lambda: zip_of({"index.html": INDEX, "big.css": BOMB}),
    "a_file_list_over_two_mebibytes": lambda: with_long_file_list({"index.html": INDEX}),
    "a_projects_source_with_no_page": lambda: zip_of({"package.json": "{}", "src/app.js": "1"}),
}


@pytest.mark.parametrize("route", [REVIEW, IMPORT])
@pytest.mark.parametrize("case", list(REFUSALS))
def test_every_refused_archive_ends_by_saying_nothing_was_imported_and_leaves_the_revision_unchanged(client, blank, case, route):
    status, detail = refused(client, route, REFUSALS[case]())
    assert detail.endswith(NOTHING), detail
    assert "Traceback" not in detail
