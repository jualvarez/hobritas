from tests.conftest import login


def test_login_sets_session_and_me_returns_profile(seeded):
    client, _, ids, _ = seeded
    response = login(client, "jefe_demo", "jefe-pass")
    assert "session" in response.cookies
    assert response.json() == {
        "id": response.json()["id"],
        "username": "jefe_demo",
        "role": "foreman",
        "site_id": ids["north"],
        "site_ids": [ids["north"]],
    }
    assert client.get("/api/v1/auth/me").json()["username"] == "jefe_demo"


def test_invalid_password_is_rejected(seeded):
    client, _, _, _ = seeded
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "jefe_demo", "password": "incorrecta"},
    )
    assert response.status_code == 401


def test_login_is_rate_limited_after_repeated_failures(seeded):
    client, _, _, _ = seeded

    responses = [
        client.post(
            "/api/v1/auth/login",
            json={"username": "jefe_demo", "password": "incorrecta"},
        )
        for _ in range(6)
    ]

    assert [response.status_code for response in responses[:5]] == [401] * 5
    assert responses[5].status_code == 429


def test_login_normalizes_username_whitespace(seeded):
    client, _, _, _ = seeded

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "  jefe_demo  ", "password": "jefe-pass"},
    )

    assert response.status_code == 200


def test_successful_login_resets_failed_attempts(seeded):
    client, _, _, _ = seeded

    for _ in range(4):
        assert client.post(
            "/api/v1/auth/login",
            json={"username": "jefe_demo", "password": "incorrecta"},
        ).status_code == 401
    assert client.post(
        "/api/v1/auth/login",
        json={"username": "jefe_demo", "password": "jefe-pass"},
    ).status_code == 200
    client.post("/api/v1/auth/logout")

    for _ in range(4):
        assert client.post(
            "/api/v1/auth/login",
            json={"username": "jefe_demo", "password": "incorrecta"},
        ).status_code == 401
    assert client.post(
        "/api/v1/auth/login",
        json={"username": "jefe_demo", "password": "jefe-pass"},
    ).status_code == 200


def test_http_deployment_can_disable_secure_session_cookie(seeded):
    client, app, _, _ = seeded
    app.state.settings.testing = False
    app.state.settings.cookie_secure = False

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "jefe_demo", "password": "jefe-pass"},
    )

    assert response.status_code == 200
    assert "secure" not in response.headers["set-cookie"].lower()


def test_logout_revokes_the_web_session(seeded):
    client, _, _, _ = seeded
    login(client, "jefe_demo", "jefe-pass")
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_revocable_bearer_token_authenticates_an_agent(seeded):
    client, _, _, raw_token = seeded
    response = client.get(
        "/api/v1/sites",
        headers={"Authorization": f"Bearer {raw_token}"},
    )
    assert response.status_code == 200
    assert len(response.json()) == 2
