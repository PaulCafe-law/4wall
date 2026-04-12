from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlmodel import Session, select

from app.artifacts import MissionArtifactService, MockMissionKmzGenerator
from app.config import Settings
from app.corridor import CorridorGenerator
from app.db import create_engine_for_settings, create_session_factory, init_db
from app.models import OperatorAccount
from app.providers import MockRouteProvider, OsmOsrmRouteProvider, RouteProvider
from app.rate_limit import RateLimiter
from app.routers import auth_router, missions_router, web_router
from app.security import hash_password
from app.storage import ArtifactStorage, LocalFileArtifactStorage, S3ArtifactStorage


LOCAL_WEB_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
)


def build_app(
    *,
    settings: Settings | None = None,
    route_provider: RouteProvider | None = None,
    corridor_generator: CorridorGenerator | None = None,
    artifact_storage: ArtifactStorage | None = None,
) -> FastAPI:
    app_settings = settings or Settings.from_env()
    app_settings.validate_runtime()
    engine = create_engine_for_settings(app_settings)
    session_factory = create_session_factory(engine)
    provider = route_provider or _build_route_provider(app_settings)
    generator = corridor_generator or CorridorGenerator()
    storage = artifact_storage or _build_artifact_storage(app_settings)
    artifact_service = MissionArtifactService(
        storage=storage,
        kmz_generator=MockMissionKmzGenerator(),
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        init_db(engine, app_settings)
        with session_factory() as session:
            _bootstrap_operator(session, app_settings)
        yield

    app = FastAPI(
        title=app_settings.app_name,
        version="0.3.0",
        lifespan=lifespan,
    )
    _configure_cors(app, app_settings)
    app.state.settings = app_settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.route_provider = provider
    app.state.corridor_generator = generator
    app.state.artifact_service = artifact_service
    app.state.rate_limiter = RateLimiter()

    @app.get("/healthz")
    def healthcheck() -> JSONResponse:
        # Release gate:
        #   Render -> /healthz -> DB probe
        #                    ok -> 200
        #                  fail -> 503
        response_status = "ok"
        database_status = {"status": "ok"}
        status_code = status.HTTP_200_OK
        try:
            with app.state.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except Exception as exc:
            response_status = "degraded"
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            database_status = {"status": "error", "error": exc.__class__.__name__}
        return JSONResponse(
            status_code=status_code,
            content={
                "status": response_status,
                "dependencies": {
                    "database": database_status,
                },
            },
        )

    app.include_router(auth_router)
    app.include_router(missions_router)
    app.include_router(web_router)

    return app


def _normalize_origin(origin: str | None) -> str | None:
    if not origin:
        return None
    return origin.rstrip("/")


def _cors_allowed_origins(settings: Settings) -> list[str]:
    configured_origin = _normalize_origin(settings.app_origin)
    if settings.environment.lower() in {"development", "dev", "test"}:
        return sorted(
            {
                *LOCAL_WEB_ORIGINS,
                *( [configured_origin] if configured_origin else [] ),
            }
        )
    return [configured_origin] if configured_origin else []


def _configure_cors(app: FastAPI, settings: Settings) -> None:
    allowed_origins = _cors_allowed_origins(settings)
    if not allowed_origins:
        return
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )


def _build_route_provider(settings: Settings) -> RouteProvider:
    if settings.route_provider.lower() == "osrm":
        return OsmOsrmRouteProvider(base_url=settings.osrm_base_url, profile=settings.osrm_profile)
    return MockRouteProvider()


def _build_artifact_storage(settings: Settings) -> ArtifactStorage:
    if settings.artifact_backend.lower() == "s3":
        return S3ArtifactStorage.from_settings(settings)
    return LocalFileArtifactStorage(settings.artifact_root)


def _bootstrap_operator(session: Session, settings: Settings) -> None:
    if not settings.bootstrap_operator_enabled:
        return
    statement = select(OperatorAccount).where(OperatorAccount.username == settings.bootstrap_operator_username)
    operator = session.exec(statement).first()
    if operator is not None:
        return
    session.add(
        OperatorAccount(
            username=settings.bootstrap_operator_username,
            display_name=settings.bootstrap_operator_display_name,
            password_hash=hash_password(settings.bootstrap_operator_password),
        )
    )
    session.commit()


app = build_app()
