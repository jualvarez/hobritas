import sys

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from palita_api.cli import main, read_password
from palita_api.models import ApiToken, Site, User, UserRole, Worker
from palita_api.security import verify_password


def run_cli(monkeypatch, arguments, passwords=()):
    values = iter(passwords)
    monkeypatch.setattr(sys, "argv", ["palita-admin", *arguments])
    monkeypatch.setattr("getpass.getpass", lambda _prompt: next(values))
    main()


def test_system_admin_can_create_user_change_password_and_revoke_token(tmp_path, monkeypatch, capsys):
    database_url = f"sqlite:///{tmp_path / 'cli.db'}"
    monkeypatch.setenv("APP_DATABASE_URL", database_url)
    monkeypatch.setenv("APP_SESSION_SECRET", "test-secret")
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")

    run_cli(monkeypatch, ["create-site", "--name", "Obra Demostración"])
    run_cli(monkeypatch, ["create-worker", "--name", "Persona Demostración", "--site-id", "1"])
    run_cli(
        monkeypatch,
        ["create-user", "--username", "jefe_demo", "--role", "foreman", "--site-id", "1"],
        ["inicial-segura", "inicial-segura"],
    )
    run_cli(monkeypatch, ["set-password", "--username", "jefe_demo"], ["nueva-segura", "nueva-segura"])
    run_cli(monkeypatch, ["create-token", "--username", "jefe_demo", "--name", "agente-demo"])
    capsys.readouterr()
    run_cli(monkeypatch, ["revoke-token", "--username", "jefe_demo", "--name", "agente-demo"])

    with Session(create_engine(database_url)) as db:
        user = db.scalar(select(User).where(User.username == "jefe_demo"))
        token = db.scalar(select(ApiToken).where(ApiToken.user_id == user.id))
        worker = db.scalar(select(Worker).where(Worker.name == "Persona Demostración"))
        site = db.get(Site, 1)
        assert user.role == UserRole.FOREMAN
        assert user.site_id == 1
        assert verify_password("nueva-segura", user.password_hash)
        assert not verify_password("inicial-segura", user.password_hash)
        assert token.revoked_at is not None
        assert worker.sites == [site]


def test_cli_rejects_short_password(monkeypatch):
    values = iter(["corta", "corta"])
    monkeypatch.setattr("getpass.getpass", lambda _prompt: next(values))

    with pytest.raises(SystemExit, match="al menos 8 caracteres"):
        read_password()
