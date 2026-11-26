import pytest

from site_zips import answered_within, page, zip_of

REVIEW = "/api/library/import-site/review"
IMPORT = "/api/library/import-site"
BOUND = 30
NOTHING = "Nothing was imported."


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def state_of(client):
    state = client.get("/api/state").json()
    return state["revision"], state["site"]


def small_site():
    return {
        "index.html": page("Home", "<h1>Home</h1>"),
        "about.html": page("About", "<h1>About</h1>"),
        "gallery.html": page("Gallery", "<h1>Gallery</h1>"),
    }


def with_extra(files, count, folder="notes"):
    return {**files, **{f"{folder}/n{i}.txt": "x" for i in range(count)}}


def dependencies(count):
    return {f"node_modules/pkg{i % 40}/lib/f{i}.js": "module.exports = 1;\n" for i in range(count)}


def refused(client, route, data):
    before = state_of(client)
    r = answered_within(BOUND, lambda: client.post(route, content=data))
    after = state_of(client)
    assert after == before, "a refused import changed the site or its revision"
    return r


def test_a_zip_of_twelve_hundred_entries_with_eight_hundred_in_node_modules_is_reviewed(client, blank):
    files = {**with_extra(small_site(), 397), **dependencies(800)}
    assert len(files) == 1200
    before = state_of(client)
    r = answered_within(BOUND, lambda: client.post(REVIEW, content=zip_of(files)))
    assert r.status_code == 200, r.text[:400]
    body = r.json()
    assert sorted(p["file"] for p in body["pages"]) == ["about.html", "gallery.html", "index.html"]
    assert body["ignored"] == 800
    assert len(body["skipped"]) == 397
    assert state_of(client) == before


def test_mac_system_files_and_dot_folders_do_not_count_toward_the_thousand_either(client, blank):
    files = with_extra(small_site(), 900)
    files.update({f"__MACOSX/._n{i}.txt": "x" for i in range(150)})
    files.update({f".cache/c{i}.txt": "x" for i in range(150)})
    r = answered_within(BOUND, lambda: client.post(REVIEW, content=zip_of(files)))
    assert r.status_code == 200, r.text[:400]
    assert r.json()["ignored"] == 300
    assert len(r.json()["pages"]) == 3


def test_a_zip_of_five_thousand_dependency_files_beside_a_small_site_is_reviewed_and_imported(client, blank):
    data = zip_of({**small_site(), **dependencies(5000)})
    review = answered_within(BOUND, lambda: client.post(REVIEW, content=data))
    assert review.status_code == 200, review.text[:400]
    assert review.json()["ignored"] == 5000
    r = answered_within(BOUND, lambda: client.post(f"{IMPORT}?mode=new&revision={review.json()['revision']}", content=data))
    assert r.status_code == 200, r.text[:400]
    assert len(r.json()["pages"]) == 3
    assert len(state_of(client)[1]["pages"]) == 4


@pytest.mark.parametrize("route", [REVIEW, IMPORT])
def test_more_than_a_thousand_files_outside_ignored_folders_is_refused_with_a_sentence_that_says_what_to_zip(client, blank, route):
    files = {**with_extra(small_site(), 998), **dependencies(300)}
    r = refused(client, route, zip_of(files))
    assert r.status_code == 413, r.text[:400]
    detail = r.json()["detail"]
    assert "1,001" in detail
    assert "zip only the folder that holds the finished site" in detail.lower()
    assert detail.endswith(NOTHING)


def test_a_folder_deeper_than_twelve_levels_inside_node_modules_does_not_refuse_the_zip(client, blank):
    deep = "node_modules/" + "/".join(f"d{i}" for i in range(18)) + "/index.js"
    r = answered_within(BOUND, lambda: client.post(REVIEW, content=zip_of({**small_site(), deep: "x"})))
    assert r.status_code == 200, r.text[:400]
    assert r.json()["ignored"] == 1
    assert len(r.json()["pages"]) == 3


def test_a_kept_folder_deeper_than_twelve_levels_is_still_refused_when_deep_dependencies_sit_beside_it(client, blank):
    deep_dependency = "node_modules/" + "/".join(f"d{i}" for i in range(18)) + "/index.js"
    deep_page = "/".join(f"k{i}" for i in range(13)) + "/page.html"
    r = refused(client, REVIEW, zip_of({**small_site(), deep_dependency: "x", deep_page: page("Deep", "<p>deep</p>")}))
    assert r.status_code == 400, r.text[:400]
    detail = r.json()["detail"]
    assert "12" in detail and "page.html" in detail
    assert "node_modules" not in detail
    assert detail.endswith(NOTHING)
