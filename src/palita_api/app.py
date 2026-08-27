from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from palita_api.config import Settings
from palita_api.database import Base, create_database_engine, create_session_factory
from palita_api.routes import router
from palita_api.security import LoginAttemptLimiter


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or Settings()
    engine = create_database_engine(resolved_settings)
    session_factory = create_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if resolved_settings.testing:
            Base.metadata.create_all(engine)
        yield
        engine.dispose()

    app = FastAPI(
        title="Palita - Registro de trabajo",
        version="0.1.0",
        description="API para registrar jornadas y consultar resúmenes de trabajo.",
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.login_attempt_limiter = LoginAttemptLimiter()
    app.include_router(router)

    web_dir = Path(__file__).resolve().parents[2] / "web"
    app.mount("/static", StaticFiles(directory=web_dir / "static"), name="static")

    @app.get("/", include_in_schema=False)
    def frontend():
        return FileResponse(web_dir / "index.html")

    @app.get("/health", tags=["system"])
    def health():
        return {"status": "ok"}

    return app
