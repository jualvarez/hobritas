from pathlib import Path

from fastapi.testclient import TestClient

from hobritas_api.app import create_app
from hobritas_api.config import Settings


ROOT = Path(__file__).resolve().parents[1]


def test_application_does_not_require_an_unused_runtime_secret(tmp_path):
    settings = Settings(database_url=f"sqlite:///{tmp_path / 'test.db'}", testing=True)

    assert settings.database_url.endswith("test.db")


def test_application_supports_a_reverse_proxy_base_path(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        base_path="/hobritas",
        testing=True,
    )

    app = create_app(settings)

    assert app.root_path == "/hobritas"
    with TestClient(app) as client:
        assert client.get("/healthz").json() == {"status": "ok", "version": "0.1.0"}
        index = client.get("/").text
        assert 'href="static/styles.css"' in index
        assert 'src="static/app.js"' in index


def test_application_uses_the_configured_web_directory(tmp_path):
    web_dir = tmp_path / "web"
    (web_dir / "static").mkdir(parents=True)
    (web_dir / "index.html").write_text("runtime web root")
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        web_dir=web_dir,
        testing=True,
    )

    with TestClient(create_app(settings)) as client:
        assert client.get("/").text == "runtime web root"


def test_repository_declares_the_minimal_familiapp_artifacts():
    assert (ROOT / "familiapp.yaml").is_file()
    assert (ROOT / "compose.yaml").is_file()
    assert (ROOT / "Dockerfile").is_file()
    assert (ROOT / ".dockerignore").is_file()
