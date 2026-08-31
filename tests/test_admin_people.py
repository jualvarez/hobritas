from tests.conftest import login


def test_admin_can_manage_person_with_optional_access_and_multiple_sites(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")

    created = client.post(
        "/api/v1/admin/people",
        json={
            "name": "Worker Three",
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
            "username": "worker_three",
            "role": "foreman",
            "password": "initial-password",
        },
    )
    assert enabled.status_code == 200
    assert enabled.json()["username"] == "worker_three"
    assert enabled.json()["role"] == "foreman"
    assert "password" not in enabled.json()

    client.post("/api/v1/auth/logout")
    login(client, "worker_three", "initial-password")
    assert {site["id"] for site in client.get("/api/v1/sites").json()} == {ids["north"], ids["south"]}


def test_people_are_grouped_by_category_and_sorted_alphabetically(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")

    first = client.post(
        "/api/v1/admin/people",
        json={
            "name": "Zeta",
            "category": "02-Peón",
            "site_ids": [ids["north"]],
            "access_enabled": False,
        },
    ).json()
    second = client.post(
        "/api/v1/admin/people",
        json={
            "name": "Alpha",
            "category": "01-Jefe",
            "site_ids": [ids["north"]],
            "access_enabled": False,
        },
    ).json()

    people = client.get("/api/v1/admin/people").json()
    workers = client.get("/api/v1/workers", params={"site_id": ids["north"]}).json()
    north = next(site for site in client.get("/api/v1/admin/sites").json() if site["id"] == ids["north"])

    assert second["category"] == "01-Jefe"
    assert first["category"] == "02-Peón"
    assert [person["id"] for person in people[:2]] == [second["id"], first["id"]]
    assert [worker["id"] for worker in workers[:2]] == [second["id"], first["id"]]
    assert [person["id"] for person in north["people"][:2]] == [second["id"], first["id"]]


def test_inactive_person_cannot_log_in_and_foreman_cannot_manage_people(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")
    created = client.post(
        "/api/v1/admin/people",
        json={
            "name": "Worker Three",
            "active": True,
            "site_ids": [ids["north"]],
            "access_enabled": True,
            "username": "worker_three",
            "role": "foreman",
            "password": "initial-password",
        },
    ).json()
    client.patch(f"/api/v1/admin/people/{created['id']}", json={"active": False})
    client.post("/api/v1/auth/logout")

    denied_login = client.post(
        "/api/v1/auth/login",
        json={"username": "worker_three", "password": "initial-password"},
    )
    assert denied_login.status_code == 401

    login(client, "foreman_demo", "foreman-pass")
    assert client.get("/api/v1/admin/people").status_code == 403


def test_enabling_new_access_requires_credentials(seeded):
    client, _, ids, _ = seeded
    login(client, "admin_demo", "admin-pass")

    response = client.post(
        "/api/v1/admin/people",
        json={
            "name": "Worker Three",
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
            "name": "Worker Three",
            "site_ids": [ids["north"]],
            "access_enabled": True,
            "username": "   ",
            "role": "foreman",
            "password": "initial-password",
        },
    )
    short_password = client.post(
        "/api/v1/admin/people",
        json={
            "name": "Worker Four",
            "site_ids": [ids["north"]],
            "access_enabled": True,
            "username": "worker_four",
            "role": "foreman",
            "password": "short",
        },
    )

    assert blank_username.status_code == 422
    assert short_password.status_code == 422
