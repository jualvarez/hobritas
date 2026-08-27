from tests.conftest import login


def test_admin_can_read_record_creation_and_change_history(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")

    updated = client.patch(
        f"/api/v1/records/{ids['current_record']}",
        json={"early_exit_reason": "Cambio de tarea"},
    )
    assert updated.status_code == 200

    response = client.get(f"/api/v1/admin/records/{ids['current_record']}/history")

    assert response.status_code == 200
    history = response.json()
    assert history[0]["action"] == "create"
    assert history[0]["actor_username"] == "jefe_demo"
    assert history[0]["created_at"]
    assert history[-1]["action"] == "update"
    assert history[-1]["actor_username"] == "admin_demo"
    assert history[-1]["before"]["early_exit_reason"] is None
    assert history[-1]["after"]["early_exit_reason"] == "Cambio de tarea"


def test_foreman_cannot_read_record_history(seeded):
    client, _, ids, _ = seeded
    login(client, "jefe_demo", "jefe-pass")

    response = client.get(f"/api/v1/admin/records/{ids['current_record']}/history")

    assert response.status_code == 403


def test_admin_can_create_rename_and_manage_site_people(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")

    created = client.post("/api/v1/admin/sites", json={"name": "Obra Central"})
    assert created.status_code == 201
    site_id = created.json()["id"]

    assigned = client.post(f"/api/v1/admin/sites/{site_id}/people/{ids['worker_north']}")
    assert assigned.status_code == 200
    assert assigned.json()["people"] == [
        {"id": ids["worker_north"], "name": "Persona Uno"}
    ]

    renamed = client.patch(f"/api/v1/admin/sites/{site_id}", json={"name": "Obra Centro"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Obra Centro"

    removed = client.delete(f"/api/v1/admin/sites/{site_id}/people/{ids['worker_north']}")
    assert removed.status_code == 200
    assert removed.json()["people"] == []


def test_site_only_accepts_active_people_and_admin_access(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")
    client.patch(f"/api/v1/admin/people/{ids['worker_north']}", json={"active": False})

    denied = client.post(f"/api/v1/admin/sites/{ids['south']}/people/{ids['worker_north']}")
    assert denied.status_code == 422

    client.post("/api/v1/auth/logout")
    login(client, "jefe_demo", "jefe-pass")
    assert client.get("/api/v1/admin/sites").status_code == 403
