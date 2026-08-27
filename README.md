# Registro de trabajo

## Inicio

```bash
python -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp .env.template .env
.venv/bin/alembic upgrade head
.venv/bin/uvicorn palita_api.app:create_app --factory
```

Definir un secreto aleatorio en `.env` antes de iniciar.

## Administración

```bash
.venv/bin/palita-admin create-site --name "Obra Demostración"
.venv/bin/palita-admin create-worker --name "Persona Demostración" --site-id 1
.venv/bin/palita-admin create-user --username admin_demo --role admin
.venv/bin/palita-admin create-user --username jefe_demo --role foreman --site-id 1
.venv/bin/palita-admin set-password --username jefe_demo
.venv/bin/palita-admin create-token --username admin_demo --name agente
.venv/bin/palita-admin revoke-token --username admin_demo --name agente
```

## API

- Web: `/`
- OpenAPI: `/openapi.json`
- Swagger UI: `/docs`
- Versión: `/api/v1`
- Agentes: `Authorization: Bearer <token>`

## Tests

```bash
.venv/bin/pytest
```
