from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from hobritas_api.config import Settings
from hobritas_api.database import Base, create_database_engine, create_session_factory
from hobritas_api.routes import router
from hobritas_api.security import LoginAttemptLimiter


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
        title="Hobritas - Work log",
        version=resolved_settings.version,
        description="API for recording shifts and viewing work summaries.",
        root_path=resolved_settings.base_path,
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.login_attempt_limiter = LoginAttemptLimiter()
    app.include_router(router)

    web_dir = resolved_settings.web_dir
    app.mount("/static", StaticFiles(directory=web_dir / "static"), name="static")

    @app.get("/", include_in_schema=False)
    def frontend():
        return FileResponse(web_dir / "index.html")

    @app.get("/healthz", tags=["system"])
    def health():
        return {"status": "ok", "version": resolved_settings.version}

    return app
