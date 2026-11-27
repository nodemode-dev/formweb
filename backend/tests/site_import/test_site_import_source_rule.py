import json

import pytest

from site_zips import answered_within, page, zip_of

REVIEW = "/api/library/import-site/review"
IMPORT = "/api/library/import-site"
BOUND = 30
NOTHING = "Nothing was imported."
PACKAGE = json.dumps({"name": "app", "private": True, "scripts": {"build": "vite build"}})


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def state_of(client):
    state = client.get("/api/state").json()
    return state["revision"], state["site"]


def refusal(client, route, data):
    before = state_of(client)
    r = answered_within(BOUND, lambda: client.post(route, content=data))
    assert state_of(client) == before, "a refused import changed the site or its revision"
    assert 400 <= r.status_code < 500, (r.status_code, r.text[:400])
    return r.status_code, r.json()["detail"]


def says_build_first(detail):
    assert "source" in detail.lower(), detail
    assert "npm run build" in detail, detail
    assert "output folder" in detail, detail
    assert detail.endswith(NOTHING), detail


def imports(client, files, pages):
    data = zip_of(files)
    review = client.post(REVIEW, content=data)
    assert review.status_code == 200, review.text[:400]
    assert "package.json" in [s["file"] for s in review.json()["skipped"]]
    r = client.post(f"{IMPORT}?mode=new&revision={review.json()['revision']}", content=data)
    assert r.status_code == 200, r.text[:400]
    assert len(r.json()["pages"]) == pages
    return r.json()


def module_page(title="App", extra_head=""):
    return page(title, '<div id="app"></div>', extra_head + '<script type="module" src="/src/main.js"></script>')


@pytest.mark.parametrize("route", [REVIEW, IMPORT])
def test_a_page_with_a_public_url_placeholder_is_refused_as_a_projects_source(client, blank, route):
    files = {
        "package.json": PACKAGE,
        "public/index.html": page("App", '<div id="root"></div>', '<link rel="icon" href="%PUBLIC_URL%/favicon.ico">'),
        "src/index.js": "document.title = 'x';\n",
    }
    status, detail = refusal(client, route, zip_of(files))
    assert status == 400
    says_build_first(detail)
    assert detail.count("public/index.html") == 1


@pytest.mark.parametrize("script", ["src/util.ts", "src/App.tsx", "src/App.jsx", "src/App.vue", "src/App.svelte"])
def test_a_script_needing_a_build_under_src_is_refused_even_when_no_page_loads_it(client, blank, script):
    files = {"package.json": PACKAGE, "index.html": page("Home", "<p>h</p>", '<script src="app.js"></script>'), "app.js": "1;\n", script: "export default 1;\n"}
    status, detail = refusal(client, REVIEW, zip_of(files))
    assert status == 400
    says_build_first(detail)
    assert detail.count(script) == 1


@pytest.mark.parametrize("route", [REVIEW, IMPORT])
def test_a_module_script_that_imports_a_package_by_name_is_refused_and_both_are_named(client, blank, route):
    files = {"package.json": PACKAGE, "index.html": module_page(), "src/main.js": 'import confetti from "canvas-confetti";\nconfetti();\n'}
    status, detail = refusal(client, route, zip_of(files))
    assert status == 400
    says_build_first(detail)
    assert detail.count("src/main.js") == 1
    assert "canvas-confetti" in detail


def test_a_module_script_that_imports_a_package_named_in_an_import_map_imports(client, blank):
    importmap = '<script type="importmap">{"imports": {"canvas-confetti": "https://cdn.example.org/confetti.mjs"}}</script>'
    files = {"package.json": PACKAGE, "index.html": module_page(extra_head=importmap), "src/main.js": 'import confetti from "canvas-confetti";\nconfetti();\n'}
    imports(client, files, 1)


def test_a_finished_site_with_package_json_and_a_src_folder_of_plain_js_and_css_using_relative_imports_imports(client, blank):
    files = {
        "package.json": PACKAGE,
        "index.html": module_page("Home", '<link rel="stylesheet" href="/src/site.css">'),
        "about.html": page("About", "<p>about</p>", '<script src="js/old.js"></script>'),
        "src/main.js": 'import { label } from "./util.js";\nexport * from "./util.js";\ndocument.title = label;\n',
        "src/util.js": "export const label = 'abc';\nexport default 'abc';\n",
        "src/site.css": "body{margin:0}\n",
        "js/old.js": "window.old = 1;\n",
    }
    imports(client, files, 2)


def test_a_module_script_that_imports_from_an_https_address_imports(client, blank):
    files = {"package.json": PACKAGE, "index.html": module_page(), "src/main.js": 'import confetti from "https://cdn.example.org/confetti.mjs";\nconfetti();\n'}
    imports(client, files, 1)


NAMED_ONCE = {
    "a_page_in_src_loading_a_script_beside_it": ({"package.json": PACKAGE, "src/index.html": page("A", "<p>a</p>", '<script type="module" src="main.ts"></script>'), "src/main.ts": "export {};\n"}, "src/main.ts"),
    "the_same_one_folder_down_with_a_dot_slash": ({"app/package.json": PACKAGE, "app/src/index.html": page("A", "<p>a</p>", '<script type="module" src="./main.ts"></script>'), "app/src/main.ts": "export {};\n"}, "app/src/main.ts"),
    "a_top_page_loading_from_the_root": ({"package.json": PACKAGE, "index.html": page("A", "<p>a</p>", '<script type="module" src="/src/main.tsx"></script>'), "src/main.tsx": "export {};\n"}, "src/main.tsx"),
    "a_top_page_loading_from_the_root_one_folder_down": ({"p/package.json": PACKAGE, "p/index.html": page("A", "<p>a</p>", '<script type="module" src="/src/main.tsx"></script>'), "p/src/main.tsx": "export {};\n"}, "p/src/main.tsx"),
    "a_placeholder_page_one_folder_down": ({"p/package.json": PACKAGE, "p/public/index.html": page("A", "<p>a</p>", '<link rel="manifest" href="%PUBLIC_URL%/manifest.json">'), "p/src/index.js": "1;\n"}, "p/public/index.html"),
    "a_by_name_import_one_folder_down": ({"p/package.json": PACKAGE, "p/index.html": module_page(), "p/src/main.js": 'import x from "lib";\n'}, "p/src/main.js"),
}


@pytest.mark.parametrize("case", list(NAMED_ONCE))
def test_each_script_or_page_is_named_once_by_its_path_in_the_archive(client, blank, case):
    files, path = NAMED_ONCE[case]
    status, detail = refusal(client, REVIEW, zip_of(files))
    assert status == 400
    says_build_first(detail)
    assert detail.count(path) == 1, detail
    name = path.rsplit("/", 1)[-1]
    assert detail.count(name) == 1, detail


def test_an_over_limit_zip_of_video_segments_named_ts_outside_src_gets_the_plain_count_sentence(client, blank):
    files = {"package.json": PACKAGE, "index.html": page("Video", '<video src="video/stream.m3u8"></video>')}
    files.update({f"video/seg{i}.ts": b"\x47" * 188 for i in range(1200)})
    status, detail = refusal(client, REVIEW, zip_of(files))
    assert status == 413
    assert "1,202" in detail
    assert "npm run build" not in detail
    assert "zip only the folder that holds the finished site" in detail.lower()
    assert detail.endswith(NOTHING)


def test_an_over_limit_zip_with_the_same_count_of_ts_files_under_src_gets_the_source_sentence(client, blank):
    files = {"package.json": PACKAGE, "index.html": page("App", "<p>a</p>")}
    files.update({f"src/seg{i}.ts": "export {};\n" for i in range(1200)})
    status, detail = refusal(client, REVIEW, zip_of(files))
    assert status == 413
    says_build_first(detail)
    assert "1,202" not in detail
