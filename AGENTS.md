# Instructions

- Do not write code without Juan's explicit authorization.
- Keep all Markdown files minimal and concrete.
- Record only decisions and problems that have been addressed.
- Do not invent or anticipate nonexistent problems.
- Assume the entire repository will be public.
- Do not store identifiable records, keys, or secrets in publishable files.
- Store all configuration in `.env`.
- Publish only `.env.template` with non-sensitive example values.
- Apply the `red/fix/green` gate in every iteration: failing test, fix, and full green suite.
- Do not close an iteration with failing tests.

# Decisions

- Perform all operations agentically and automatically.
- Define clear deployment mechanisms in code. Infrastructure provider coupling is allowed when well isolated.
- The administrator will enter data submitted by workers.
- The interface will be responsive web UI.
- The web interface and user-facing messages will be in Spanish.
- The administrator may paste a conversation so Coddy can try to identify who, when, and where.
- A documented API will allow Coddy and other agents to create and modify records.
- Validate the interface through fast, separate iterations.
- Save each prototype in `iterations/iteration-N`.
- Use FastAPI, SQLAlchemy, Alembic, and pytest for the backend.
- Use SQLite initially.
- Version the API under `/api/v1` and document it with OpenAPI.
- Configure the timezone through `.env`, defaulting to Argentina time.
- Create users and passwords through administrative commands.
- Do not implement password recovery yet.
- Use web sessions and revocable tokens for agents.
- Audit corrections and use soft deletion.
