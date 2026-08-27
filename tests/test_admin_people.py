from tests.conftest import login


def test_admin_can_manage_person_with_optional_access_and_multiple_sites(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")

    created = client.post(
        "/api/v1/admin/people",
        json={
            "name": "Persona Tres",
            "active": True,
            "site_ids": [ids["north"], ids["south"]],
            "access_enabled": False,
        },
    )

    assert created.status_code == 201
    assert created.json()["site_ids"] == [ids["north"], ids["south"]]
    assert created.json()["username"] is None
    assert created.json()["role"] is None
    assert created.json()["access_enabled"] is False

    person_id = created.json()["id"]
    enabled = client.patch(
        f"/api/v1/admin/people/{person_id}",
        json={
            "access_enabled": True,
            "username": "persona_tres",
            "role": "foreman",
            "password": "clave-inicial",
        },
    )
    assert enabled.status_code == 200
    assert enabled.json()["username"] == "persona_tres"
    assert enabled.json()["role"] == "foreman"
    assert "password" not in enabled.json()

    client.post("/api/v1/auth/logout")
    login(client, "persona_tres", "clave-inicial")
    assert {site["id"] for site in client.get("/api/v1/sites").json()} == {ids["north"], ids["south"]}


def test_inactive_person_cannot_log_in_and_foreman_cannot_manage_people(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")
    created = client.post(
        "/api/v1/admin/people",
        json={
            "name": "Persona Tres",
            "active": True,
            "site_ids": [ids["north"]],
            "access_enabled": True,
            "username": "persona_tres",
            "role": "foreman",
            "password": "clave-inicial",
        },
    ).json()
    client.patch(f"/api/v1/admin/people/{created['id']}", json={"active": False})
    client.post("/api/v1/auth/logout")

    denied_login = client.post(
        "/api/v1/auth/login",
        json={"username": "persona_tres", "password": "clave-inicial"},
    )
    assert denied_login.status_code == 401

    login(client, "jefe_demo", "jefe-pass")
    assert client.get("/api/v1/admin/people").status_code == 403


def test_enabling_new_access_requires_credentials(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")

    response = client.post(
        "/api/v1/admin/people",
        json={
            "name": "Persona Tres",
            "site_ids": [ids["north"]],
            "access_enabled": True,
        },
    )

    assert response.status_code == 422


def test_access_rejects_blank_username_and_short_password(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")

    blank_username = client.post(
        "/api/v1/admin/people",
        json={
            "name": "Persona Tres",
            "site_ids": [ids["north"]],
            "access_enabled": True,
            "username": "   ",
            "role": "foreman",
            "password": "clave-inicial",
        },
    )
    short_password = client.post(
        "/api/v1/admin/people",
        json={
            "name": "Persona Cuatro",
            "site_ids": [ids["north"]],
            "access_enabled": True,
            "username": "persona_cuatro",
            "role": "foreman",
            "password": "corta",
        },
    )

    assert blank_username.status_code == 422
    assert short_password.status_code == 422
