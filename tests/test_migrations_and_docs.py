from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_initial_migration_creates_the_schema(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'migration.db'}"
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")

    tables = set(inspect(create_engine(database_url)).get_table_names())
    assert {
        "alembic_version",
        "api_tokens",
        "audit_logs",
        "sites",
        "users",
        "web_sessions",
        "work_records",
        "worker_sites",
        "workers",
    } <= tables
    columns = {column["name"] for column in inspect(create_engine(database_url)).get_columns("workers")}
    assert {"user_id", "access_enabled"} <= columns


def test_openapi_exposes_versioned_agent_endpoints(seeded):
    client, _, _, _ = seeded
    schema = client.get("/openapi.json")
    assert schema.status_code == 200
    assert schema.json()["info"]["title"] == "Palita - Registro de trabajo"
    assert "/api/v1/auth/login" in schema.json()["paths"]
    assert "/api/v1/records" in schema.json()["paths"]
    assert "/api/v1/admin/people" in schema.json()["paths"]
    assert set(schema.json()["components"]["securitySchemes"]) == {"AgentToken", "WebSession"}
