from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.artifacts import MissionArtifactBundle, MissionArtifactService, MockMissionKmzGenerator
from app.config import Settings
from app.corridor import CorridorGenerator
from app.db import create_engine_for_settings, create_session_factory, init_db
from app.dto import (
    AuthRefreshRequestDto,
    FlightEventsAcceptedDto,
    FlightEventsRequestDto,
    LoginRequestDto,
    MissionArtifactDescriptorDto,
    MissionMetaDto,
    MissionPlanRequestDto,
    MissionPlanResponseDto,
    OperatorDto,
    TelemetryBatchAcceptedDto,
    TelemetryBatchRequestDto,
    TokenPairDto,
)
from app.models import Flight, FlightEvent, Mission, MissionArtifact, OperatorAccount, TelemetryBatch
from app.providers import MockRouteProvider, OsmOsrmRouteProvider, RouteProvider, RouteProviderError
from app.security import (
    AuthError,
    create_access_token,
    create_refresh_token,
    hash_password,
    revoke_refresh_token,
    validate_refresh_token,
    verify_access_token,
    verify_password,
)
from app.storage import ArtifactStorage, LocalFileArtifactStorage, S3ArtifactStorage


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
    auth_scheme = HTTPBearer(auto_error=False)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        init_db(engine, app_settings)
        with session_factory() as session:
            _bootstrap_operator(session, app_settings)
        yield

    app = FastAPI(
        title=app_settings.app_name,
        version="0.2.0",
        lifespan=lifespan,
    )

    def get_session():
        with session_factory() as session:
            yield session

    def get_current_operator(
        credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
        session: Session = Depends(get_session),
    ) -> OperatorAccount:
        if credentials is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_bearer_token")
        try:
            payload = verify_access_token(credentials.credentials, app_settings)
        except AuthError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

        operator = session.get(OperatorAccount, payload["sub"])
        if operator is None or not operator.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="operator_inactive")
        return operator

    @app.get("/healthz")
    def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/auth/login", response_model=TokenPairDto)
    def login(request: LoginRequestDto, session: Session = Depends(get_session)) -> TokenPairDto:
        statement = select(OperatorAccount).where(OperatorAccount.username == request.username)
        operator = session.exec(statement).first()
        if operator is None or not operator.is_active or not verify_password(request.password, operator.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
        return _issue_token_pair(session, app_settings, operator)

    @app.post("/v1/auth/refresh", response_model=TokenPairDto)
    def refresh(request: AuthRefreshRequestDto, session: Session = Depends(get_session)) -> TokenPairDto:
        try:
            payload = validate_refresh_token(request.refreshToken, app_settings, session)
        except AuthError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

        operator = session.get(OperatorAccount, payload["sub"])
        if operator is None or not operator.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="operator_inactive")

        revoke_refresh_token(session, payload["jti"])
        return _issue_token_pair(session, app_settings, operator)

    @app.get("/v1/auth/me", response_model=OperatorDto)
    def me(current_operator: OperatorAccount = Depends(get_current_operator)) -> OperatorDto:
        return OperatorDto(
            operatorId=current_operator.id,
            username=current_operator.username,
            displayName=current_operator.display_name,
        )

    @app.post("/v1/missions/plan", response_model=MissionPlanResponseDto)
    def plan_mission(
        request: MissionPlanRequestDto,
        current_operator: OperatorAccount = Depends(get_current_operator),
        session: Session = Depends(get_session),
    ) -> MissionPlanResponseDto:
        mission_id = f"msn_{datetime.now(timezone.utc):%Y%m%d_%H%M%S}_{uuid4().hex[:8]}"
        try:
            route_path = provider.plan_route(request)
        except RouteProviderError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="route_unavailable") from exc

        try:
            corridor_plan = generator.generate(request=request, route_path=route_path, mission_id=mission_id)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="mission_generation_failed") from exc

        artifacts = artifact_service.generate_and_store(
            mission_id=mission_id,
            bundle_version=corridor_plan.bundle_version,
            mission_bundle=corridor_plan.mission_bundle,
            mission_meta=corridor_plan.mission_meta,
        )

        response_body = MissionPlanResponseDto(
            missionId=mission_id,
            bundleVersion=corridor_plan.bundle_version,
            missionBundle=corridor_plan.mission_bundle,
            artifacts=_artifact_descriptors(mission_id=mission_id, artifacts=artifacts),
        )
        mission = Mission(
            id=mission_id,
            mission_name=request.missionName,
            routing_mode=request.routingMode,
            bundle_version=corridor_plan.bundle_version,
            demo_mode=request.demoMode,
            planned_by_operator_id=current_operator.id,
            request_json=request.model_dump(mode="json"),
            response_json=response_body.model_dump(mode="json"),
        )
        session.add(mission)
        session.add_all(
            [
                MissionArtifact(
                    mission_id=mission_id,
                    artifact_name="mission.kmz",
                    version=artifacts.mission_kmz.version,
                    checksum_sha256=artifacts.mission_kmz.checksum_sha256,
                    content_type=artifacts.mission_kmz.content_type,
                    storage_key=artifacts.mission_kmz.storage_key,
                    cache_control=artifacts.mission_kmz.cache_control,
                    size_bytes=artifacts.mission_kmz.size_bytes,
                ),
                MissionArtifact(
                    mission_id=mission_id,
                    artifact_name="mission_meta.json",
                    version=artifacts.mission_meta_json.version,
                    checksum_sha256=artifacts.mission_meta_json.checksum_sha256,
                    content_type=artifacts.mission_meta_json.content_type,
                    storage_key=artifacts.mission_meta_json.storage_key,
                    cache_control=artifacts.mission_meta_json.cache_control,
                    size_bytes=artifacts.mission_meta_json.size_bytes,
                ),
            ]
        )
        session.commit()
        return response_body

    @app.get("/v1/missions/{mission_id}/artifacts/mission.kmz")
    def get_mission_kmz(
        mission_id: str,
        response: Response,
        _: OperatorAccount = Depends(get_current_operator),
        session: Session = Depends(get_session),
    ) -> Response:
        artifact = _get_artifact(session, mission_id, "mission.kmz")
        payload = artifact_service.read(artifact.storage_key)
        if payload is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="artifact_missing")
        response.headers["Cache-Control"] = artifact.cache_control
        response.headers["ETag"] = artifact.checksum_sha256
        response.headers["X-Artifact-Version"] = str(artifact.version)
        response.headers["X-Artifact-Checksum"] = artifact.checksum_sha256
        return Response(content=payload, media_type=artifact.content_type, headers=response.headers)

    @app.get("/v1/missions/{mission_id}/artifacts/mission_meta.json")
    def get_mission_meta(
        mission_id: str,
        response: Response,
        _: OperatorAccount = Depends(get_current_operator),
        session: Session = Depends(get_session),
    ) -> Response:
        artifact = _get_artifact(session, mission_id, "mission_meta.json")
        payload = artifact_service.read(artifact.storage_key)
        if payload is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="artifact_missing")
        response.headers["Cache-Control"] = artifact.cache_control
        response.headers["ETag"] = artifact.checksum_sha256
        response.headers["X-Artifact-Version"] = str(artifact.version)
        response.headers["X-Artifact-Checksum"] = artifact.checksum_sha256
        return Response(content=payload, media_type=artifact.content_type, headers=response.headers)

    @app.post("/v1/flights/{flight_id}/events", response_model=FlightEventsAcceptedDto, status_code=202)
    def ingest_events(
        flight_id: str,
        request: FlightEventsRequestDto,
        current_operator: OperatorAccount = Depends(get_current_operator),
        session: Session = Depends(get_session),
    ) -> FlightEventsAcceptedDto:
        _ensure_flight(session, flight_id=flight_id, mission_id=request.missionId, operator_id=current_operator.id)
        accepted = 0
        for event in request.events:
            session.merge(
                FlightEvent(
                    id=event.eventId,
                    flight_id=flight_id,
                    mission_id=request.missionId,
                    event_type=event.type,
                    event_timestamp=event.timestamp,
                    payload_json=event.payload,
                )
            )
            accepted += 1
        flight = session.get(Flight, flight_id)
        if flight is not None:
            flight.last_event_at = datetime.now(timezone.utc)
            flight.updated_at = datetime.now(timezone.utc)
            session.add(flight)
        session.commit()
        return FlightEventsAcceptedDto(accepted=accepted, rejected=0)

    @app.post(
        "/v1/flights/{flight_id}/telemetry:batch",
        response_model=TelemetryBatchAcceptedDto,
        status_code=202,
    )
    def ingest_telemetry(
        flight_id: str,
        request: TelemetryBatchRequestDto,
        current_operator: OperatorAccount = Depends(get_current_operator),
        session: Session = Depends(get_session),
    ) -> TelemetryBatchAcceptedDto:
        _ensure_flight(session, flight_id=flight_id, mission_id=request.missionId, operator_id=current_operator.id)
        first_timestamp = min(sample.timestamp for sample in request.samples)
        last_timestamp = max(sample.timestamp for sample in request.samples)
        session.add(
            TelemetryBatch(
                flight_id=flight_id,
                mission_id=request.missionId,
                sample_count=len(request.samples),
                first_timestamp=first_timestamp,
                last_timestamp=last_timestamp,
                payload_json=[sample.model_dump(mode="json") for sample in request.samples],
            )
        )
        flight = session.get(Flight, flight_id)
        if flight is not None:
            flight.last_telemetry_at = datetime.now(timezone.utc)
            flight.updated_at = datetime.now(timezone.utc)
            session.add(flight)
        session.commit()
        return TelemetryBatchAcceptedDto(accepted=len(request.samples))

    return app


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


def _issue_token_pair(session: Session, settings: Settings, operator: OperatorAccount) -> TokenPairDto:
    access_token = create_access_token(settings, operator)
    refresh_token = create_refresh_token(session, settings, operator)
    session.commit()
    return TokenPairDto(
        accessToken=access_token,
        refreshToken=refresh_token,
        expiresInSeconds=settings.access_token_ttl_minutes * 60,
        operator=OperatorDto(
            operatorId=operator.id,
            username=operator.username,
            displayName=operator.display_name,
        ),
    )


def _artifact_descriptors(mission_id: str, artifacts: MissionArtifactBundle):
    return {
        "missionKmz": MissionArtifactDescriptorDto(
            downloadUrl=f"/v1/missions/{mission_id}/artifacts/mission.kmz",
            version=artifacts.mission_kmz.version,
            checksumSha256=artifacts.mission_kmz.checksum_sha256,
            contentType=artifacts.mission_kmz.content_type,
            sizeBytes=artifacts.mission_kmz.size_bytes,
            cacheControl=artifacts.mission_kmz.cache_control,
        ),
        "missionMeta": MissionArtifactDescriptorDto(
            downloadUrl=f"/v1/missions/{mission_id}/artifacts/mission_meta.json",
            version=artifacts.mission_meta_json.version,
            checksumSha256=artifacts.mission_meta_json.checksum_sha256,
            contentType=artifacts.mission_meta_json.content_type,
            sizeBytes=artifacts.mission_meta_json.size_bytes,
            cacheControl=artifacts.mission_meta_json.cache_control,
        ),
    }


def _get_artifact(session: Session, mission_id: str, artifact_name: str) -> MissionArtifact:
    statement = select(MissionArtifact).where(
        MissionArtifact.mission_id == mission_id,
        MissionArtifact.artifact_name == artifact_name,
    )
    artifact = session.exec(statement).first()
    if artifact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="artifact_not_found")
    return artifact


def _ensure_flight(session: Session, flight_id: str, mission_id: str, operator_id: str) -> Flight:
    mission = session.get(Mission, mission_id)
    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="mission_not_found")

    flight = session.get(Flight, flight_id)
    if flight is None:
        flight = Flight(id=flight_id, mission_id=mission_id, operator_id=operator_id)
        session.add(flight)
        session.flush()
        return flight
    if flight.mission_id != mission_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="flight_mission_mismatch")
    return flight


app = build_app()
