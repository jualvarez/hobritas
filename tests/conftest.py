from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from palita_api.app import create_app
from palita_api.config import Settings
from palita_api.models import ApiToken, Site, User, UserRole, Worker, WorkRecord
from palita_api.security import hash_password, hash_token


@pytest.fixture
def settings(tmp_path):
    return Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        timezone="America/Argentina/Buenos_Aires",
        session_secret="test-secret-not-for-production",
        session_hours=12,
        testing=True,
    )


@pytest.fixture
def app(settings):
    return create_app(settings)


@pytest.fixture
def seeded(app, settings):
    with TestClient(app) as client:
        with app.state.session_factory() as db:
            north = Site(name="Obra Norte")
            south = Site(name="Obra Sur")
            db.add_all([north, south])
            db.flush()

            admin = User(
                username="admin_demo",
                password_hash=hash_password("admin-pass"),
                role=UserRole.ADMIN,
            )
            foreman = User(
                username="jefe_demo",
                password_hash=hash_password("jefe-pass"),
                role=UserRole.FOREMAN,
                site_id=north.id,
            )
            worker_north = Worker(name="Persona Uno")
            worker_south = Worker(name="Persona Dos")
            worker_north.sites.append(north)
            worker_south.sites.append(south)
            db.add_all([admin, foreman, worker_north, worker_south])
            db.flush()

            raw_token = "agent-test-token"
            db.add(ApiToken(user_id=admin.id, name="test", token_hash=hash_token(raw_token)))

            local_now = datetime.now(ZoneInfo(settings.timezone))
            start_of_week = (local_now - timedelta(days=(local_now.weekday() + 1) % 7)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            previous_week = start_of_week - timedelta(days=3)
            old_week = start_of_week - timedelta(days=10)
            current_record = WorkRecord(
                worker_id=worker_north.id,
                site_id=north.id,
                entry_at=(local_now - timedelta(hours=4)).astimezone(UTC),
                exit_at=(local_now - timedelta(hours=1)).astimezone(UTC),
                created_by_id=foreman.id,
            )
            previous_record = WorkRecord(
                worker_id=worker_north.id,
                site_id=north.id,
                entry_at=previous_week.astimezone(UTC),
                exit_at=(previous_week + timedelta(hours=8)).astimezone(UTC),
                created_by_id=foreman.id,
            )
            old_record = WorkRecord(
                worker_id=worker_north.id,
                site_id=north.id,
                entry_at=old_week.astimezone(UTC),
                exit_at=(old_week + timedelta(hours=8)).astimezone(UTC),
                created_by_id=foreman.id,
            )
            south_record = WorkRecord(
                worker_id=worker_south.id,
                site_id=south.id,
                entry_at=(local_now - timedelta(hours=4)).astimezone(UTC),
                exit_at=(local_now - timedelta(hours=1)).astimezone(UTC),
                created_by_id=admin.id,
            )
            db.add_all([current_record, previous_record, old_record, south_record])
            db.commit()

            ids = {
                "north": north.id,
                "south": south.id,
                "worker_north": worker_north.id,
                "current_record": current_record.id,
                "previous_record": previous_record.id,
                "old_record": old_record.id,
                "south_record": south_record.id,
            }

        yield client, app, ids, raw_token


def login(client, username, password):
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response
