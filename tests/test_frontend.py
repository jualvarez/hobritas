def test_frontend_is_served_at_root(seeded):
    client, _, _, _ = seeded

    response = client.get("/")

    assert response.status_code == 200
    assert "Work log" in response.text
    assert 'src="static/app.js"' in response.text


def test_frontend_assets_are_served(seeded):
    client, _, _, _ = seeded

    response = client.get("/static/app.js")

    assert response.status_code == 200
    assert "api/v1/auth/login" in response.text


def test_expanded_rows_share_the_table_column_grid(seeded):
    client, _, _, _ = seeded

    css = client.get("/static/styles.css").text
    javascript = client.get("/static/app.js").text

    assert "--table-columns" in css
    assert ".table-head, .group-row, .detail-line" in css
    assert 'class="detail-indent"' in javascript


def test_alerts_are_actionable_and_foreman_can_close_shift(seeded):
    client, _, _, _ = seeded

    javascript = client.get("/static/app.js").text

    assert "Records to review" in javascript
    assert "data-show-alerts" in javascript
    assert "Close shift" in javascript
    assert "close-open-records" in javascript
    assert "includeOpen: state.user.role === \"admin\"" in javascript


def test_admin_has_people_management_and_day_week_navigation(seeded):
    client, _, _, _ = seeded

    javascript = client.get("/static/app.js").text

    assert "Assignments and system access" in javascript
    assert "Add worker" in javascript
    assert "New password (optional)" in javascript
    assert "Active worker" in javascript
    assert 'data-view="day"' in javascript
    assert 'data-view="week"' in javascript


def test_admin_has_record_timeline_and_site_management(seeded):
    client, _, _, _ = seeded

    javascript = client.get("/static/app.js").text

    assert "Record history" in javascript
    assert "/history" in javascript
    assert 'data-admin-section="sites"' in javascript
    assert "Add site" in javascript
    assert "Active workers at this site" in javascript
    assert "Add worker to site" in javascript
