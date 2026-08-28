# Hobritas work log

## Setup

```bash
python -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp .env.template .env
.venv/bin/alembic upgrade head
.venv/bin/uvicorn hobritas_api.app:create_app --factory
```

## Administration

```bash
.venv/bin/hobritas-admin create-site --name "Demo Site"
.venv/bin/hobritas-admin create-worker --name "Demo Worker" --site-id 1
.venv/bin/hobritas-admin create-user --username admin_demo --role admin
.venv/bin/hobritas-admin create-user --username foreman_demo --role foreman --site-id 1
.venv/bin/hobritas-admin set-password --username foreman_demo
.venv/bin/hobritas-admin create-token --username admin_demo --name agent
.venv/bin/hobritas-admin revoke-token --username admin_demo --name agent
```

## API

- Web: `/`
- OpenAPI: `/openapi.json`
- Swagger UI: `/docs`
- Version: `/api/v1`
- Agents: `Authorization: Bearer <token>`

## Tests

```bash
.venv/bin/pytest
```

## Deployment

`familiapp.yaml` declares the application's minimal runtime contract. Deployment tooling and VPS configuration live outside this repository.
