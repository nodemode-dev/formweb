import json

import pytest

from site_zips import answered_within, page, zip_of

REVIEW = "/api/library/import-site/review"
IMPORT = "/api/library/import-site"
BOUND = 30
NOTHING = "Nothing was imported."
PACKAGE = json.dumps({"name": "shop", "private": True, "scripts": {"dev": "vite", "build": "vite build"}, "devDependencies": {"vite": "^5.0.0"}})


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def state_of(client):
    state = client.get("/api/state").json()
    return state["revision"], state["site"]


def source_page(script):
    return page("Shop", '<div id="root"></div>', f'<script type="module" src="{script}"></script>')


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


@pytest.mark.parametrize("route", [REVIEW, IMPORT])
def test_a_zip_with_package_json_and_no_html_page_is_refused_as_a_projects_source(client, blank, route):
    status, detail = refusal(client, route, zip_of({"package.json": PACKAGE, "src/app.js": "console.log(1);\n", "README.md": "# Shop\n"}))
    assert status == 400
    says_build_first(detail)
    assert "no HTML page" in detail


@pytest.mark.parametrize("script", ["src/main.ts", "src/main.tsx", "src/main.jsx", "src/App.vue", "src/App.svelte"])
def test_a_page_that_loads_a_script_needing_a_build_is_refused_and_the_script_is_named(client, blank, script):
    files = {"package.json": PACKAGE, "index.html": source_page("/" + script), script: "export default 1;\n", "src/style.css": "body{margin:0}"}
    status, detail = refusal(client, REVIEW, zip_of(files))
    assert status == 400
    says_build_first(detail)
    assert script in detail


def test_a_project_folder_one_level_down_is_still_recognised_as_source(client, blank):
    files = {"shop/package.json": PACKAGE, "shop/index.html": source_page("./src/main.tsx"), "shop/src/main.tsx": "export {};\n"}
    status, detail = refusal(client, IMPORT, zip_of(files))
    assert status == 400
    says_build_first(detail)
    assert "src/main.tsx" in detail


def test_a_source_zip_that_holds_no_built_copy_does_not_name_one(client, blank):
    files = {"package.json": PACKAGE, "index.html": source_page("/src/main.tsx"), "src/main.tsx": "export {};\n"}
    _, detail = refusal(client, REVIEW, zip_of(files))
    says_build_first(detail)
    assert "dist folder" not in detail and "build folder" not in detail


@pytest.mark.parametrize("built", ["dist", "build"])
def test_a_source_zip_that_also_holds_a_built_copy_names_that_folder(client, blank, built):
    files = {
        "package.json": PACKAGE,
        "index.html": source_page("/src/main.tsx"),
        "src/main.tsx": "export {};\n",
        f"{built}/index.html": page("Shop", '<div id="root"></div>', '<script type="module" src="/assets/index-1a2b.js"></script>'),
        f"{built}/assets/index-1a2b.js": "console.log(1);\n",
    }
    status, detail = refusal(client, REVIEW, zip_of(files))
    assert status == 400
    says_build_first(detail)
    assert f"{built} folder" in detail


def test_a_built_copy_one_folder_down_is_named_with_its_path(client, blank):
    files = {
        "shop/package.json": PACKAGE,
        "shop/index.html": source_page("/src/main.tsx"),
        "shop/src/main.tsx": "export {};\n",
        "shop/dist/index.html": page("Shop", "<p>built</p>"),
    }
    _, detail = refusal(client, REVIEW, zip_of(files))
    says_build_first(detail)
    assert "shop/dist folder" in detail


@pytest.mark.parametrize("route", [REVIEW, IMPORT])
def test_a_source_project_over_the_file_limit_gets_the_source_sentence_instead_of_the_bare_limit(client, blank, route):
    files = {"package.json": PACKAGE, "index.html": source_page("/src/main.tsx"), "src/main.tsx": "export {};\n"}
    files.update({f"src/components/C{i}.tsx": "export {};\n" for i in range(1100)})
    files.update({f"node_modules/react/f{i}.js": "x" for i in range(400)})
    status, detail = refusal(client, route, zip_of(files))
    assert status == 413
    says_build_first(detail)
    assert "main.tsx" in detail
    assert "1,103" not in detail and "1,000" not in detail


def test_a_finished_static_site_with_a_harmless_package_json_is_reviewed_and_imported(client, blank):
    files = {
        "package.json": json.dumps({"name": "brochure", "version": "1.0.0", "scripts": {"start": "serve ."}}),
        "index.html": page("Brochure", "<h1>Welcome</h1>", '<script src="app.js"></script>'),
        "about.html": page("About", "<h1>About</h1>"),
        "app.js": "document.body.dataset.ok = '1';\n",
    }
    data = zip_of(files)
    review = client.post(REVIEW, content=data)
    assert review.status_code == 200, review.text[:400]
    assert sorted(p["file"] for p in review.json()["pages"]) == ["about.html", "index.html"]
    assert [s["file"] for s in review.json()["skipped"]] == ["package.json"]
    r = client.post(f"{IMPORT}?mode=new&revision={review.json()['revision']}", content=data)
    assert r.status_code == 200, r.text[:400]
    assert len(r.json()["pages"]) == 2
    assert {p["seo"]["title"] for p in state_of(client)[1]["pages"]} >= {"Brochure", "About"}
