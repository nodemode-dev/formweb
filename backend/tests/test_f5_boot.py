from conftest import APP_ID, HEALTH_PATH, VERSION_KEY, VERSION_PATH, get_json


def test_engine_boots_on_a_free_port_with_an_empty_data_folder(engine):
    status, body = get_json(engine["base"] + HEALTH_PATH)
    assert status == 200
    assert body == {"status": "ok", "engine": "rust"}
    assert engine["proc"].poll() is None


def test_engine_reports_the_repository_version(engine, repo_version):
    status, body = get_json(engine["base"] + VERSION_PATH)
    assert status == 200
    assert str(body[VERSION_KEY]).lstrip("v") == repo_version.lstrip("v")


def test_the_rust_engine_reports_the_same_version(engine, repo_version):
    import subprocess

    from conftest import CORE_BIN

    out = subprocess.run([CORE_BIN, "--version"], capture_output=True, text=True, timeout=20).stdout
    assert out.strip() == f"formweb-core {repo_version}"


def test_engine_opens_a_starter_site_and_keeps_its_files_in_the_data_folder(engine):
    status, body = get_json(engine["base"] + "/api/state")
    assert status == 200
    assert body["site"]["pages"] and body["revision"] >= 0
    assert (engine["data"] / "formweb.sqlite3").is_file()
    home = engine["data"].parent / "home"
    assert not [p.name for p in home.iterdir() if p.name.lower().startswith(APP_ID)]
