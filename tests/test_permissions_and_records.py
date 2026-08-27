from datetime import UTC, datetime, timedelta

from palita_api.models import AuditLog, User, WorkRecord
from tests.conftest import login


def test_foreman_only_sees_assigned_site_and_workers(seeded):
    client, _, ids, _ = seeded
    login(client, "jefe_demo", "jefe-pass")
    sites = client.get("/api/v1/sites")
    workers = client.get("/api/v1/workers")
    assert sites.status_code == 200
    assert [site["id"] for site in sites.json()] == [ids["north"]]
    assert [worker["id"] for worker in workers.json()] == [ids["worker_north"]]


def test_admin_sees_all_sites(seeded):
    client, _, _, _ = seeded
    login(client, "admin_demo", "admin-pass")
    response = client.get("/api/v1/sites")
    assert response.status_code == 200
    assert {site["name"] for site in response.json()} == {"Obra Norte", "Obra Sur"}


def test_records_can_be_filtered_by_site_and_worker(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")

    by_site = client.get("/api/v1/records", params={"site_id": ids["south"]})
    by_worker = client.get("/api/v1/records", params={"worker_id": ids["worker_north"]})

    assert by_site.status_code == 200
    assert {record["id"] for record in by_site.json()} == {ids["south_record"]}
    assert by_worker.status_code == 200
    assert {record["worker_id"] for record in by_worker.json()} == {ids["worker_north"]}


def test_record_datetimes_are_serialized_as_utc(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")

    response = client.get("/api/v1/records", params={"site_id": ids["south"]})

    assert response.json()[0]["entry_at"].endswith("Z")


def test_record_datetimes_are_normalized_to_utc_before_storage(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")

    response = client.post(
        "/api/v1/records",
        json={
            "worker_id": ids["worker_north"],
            "site_id": ids["north"],
            "entry_at": "2026-08-23T08:00:00-03:00",
            "exit_at": "2026-08-23T16:00:00-03:00",
        },
    )

    assert response.status_code == 201
    assert response.json()["entry_at"] == "2026-08-23T11:00:00Z"
    assert response.json()["exit_at"] == "2026-08-23T19:00:00Z"


def test_foreman_can_edit_previous_week_but_not_older_records(seeded):
    client, _, ids, _ = seeded
    login(client, "jefe_demo", "jefe-pass")
    allowed = client.patch(
        f"/api/v1/records/{ids['previous_record']}",
        json={"early_exit_reason": "Motivo de prueba"},
    )
    denied = client.patch(
        f"/api/v1/records/{ids['old_record']}",
        json={"early_exit_reason": "No permitido"},
    )
    assert allowed.status_code == 200
    assert denied.status_code == 403


def test_foreman_cannot_access_another_site_record(seeded):
    client, _, ids, _ = seeded
    login(client, "jefe_demo", "jefe-pass")
    response = client.patch(
        f"/api/v1/records/{ids['south_record']}",
        json={"early_exit_reason": "No permitido"},
    )
    assert response.status_code == 404


def test_close_shift_only_closes_open_records_from_the_foreman_site(seeded):
    client, app, ids, _ = seeded
    with app.state.session_factory() as db:
        foreman = db.query(User).filter_by(username="jefe_demo").one()
        admin = db.query(User).filter_by(username="admin_demo").one()
        north_open = WorkRecord(
            worker_id=ids["worker_north"],
            site_id=ids["north"],
            entry_at=datetime.now(UTC) - timedelta(hours=2),
            created_by_id=foreman.id,
        )
        south_open = WorkRecord(
            worker_id=ids["worker_north"],
            site_id=ids["south"],
            entry_at=datetime.now(UTC) - timedelta(hours=1),
            created_by_id=admin.id,
        )
        db.add_all([north_open, south_open])
        db.commit()
        north_open_id = north_open.id
        south_open_id = south_open.id

    login(client, "jefe_demo", "jefe-pass")
    denied = client.post(f"/api/v1/sites/{ids['south']}/close-open-records")
    closed = client.post(f"/api/v1/sites/{ids['north']}/close-open-records")

    assert denied.status_code == 403
    assert closed.status_code == 200
    assert [record["id"] for record in closed.json()] == [north_open_id]
    assert closed.json()[0]["exit_at"] is not None

    with app.state.session_factory() as db:
        assert db.get(WorkRecord, north_open_id).exit_at is not None
        assert db.get(WorkRecord, south_open_id).exit_at is None
        assert db.query(AuditLog).filter_by(action="close_shift", entity_id=north_open_id).count() == 1


def test_admin_edit_is_audited_and_delete_is_soft(seeded):
    client, app, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")
    new_exit = (datetime.now(UTC) - timedelta(minutes=10)).isoformat()
    updated = client.patch(
        f"/api/v1/records/{ids['current_record']}",
        json={"exit_at": new_exit},
    )
    deleted = client.delete(f"/api/v1/records/{ids['current_record']}")
    assert updated.status_code == 200
    assert deleted.status_code == 204

    with app.state.session_factory() as db:
        record = db.get(WorkRecord, ids["current_record"])
        actions = [item.action for item in db.query(AuditLog).all()]
        assert record.deleted_at is not None
        assert actions == ["update", "delete"]

    listed = client.get("/api/v1/records")
    assert ids["current_record"] not in {item["id"] for item in listed.json()}


def test_record_entry_cannot_be_cleared(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")

    response = client.patch(
        f"/api/v1/records/{ids['current_record']}",
        json={"entry_at": None},
    )

    assert response.status_code == 422
