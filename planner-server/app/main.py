from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Response

from app.artifacts import MissionArtifactStore, MockMissionKmzGenerator, StoredMissionArtifacts
from app.corridor import CorridorGenerator
from app.dto import (
    FlightEventsAcceptedDto,
    FlightEventsRequestDto,
    MissionMetaDto,
    MissionPlanRequestDto,
    MissionPlanResponseDto,
    TelemetryBatchAcceptedDto,
    TelemetryBatchRequestDto,
)
from app.providers import MockRouteProvider, RouteProvider, RouteProviderError


def build_app(
    route_provider: RouteProvider | None = None,
    corridor_generator: CorridorGenerator | None = None,
    artifact_store: MissionArtifactStore | None = None,
) -> FastAPI:
    provider = route_provider or MockRouteProvider()
    generator = corridor_generator or CorridorGenerator()
    store = artifact_store or MissionArtifactStore()
    kmz_generator = MockMissionKmzGenerator()

    app = FastAPI(title="Building Route Planner", version="0.1.0")

    @app.get("/healthz")
    def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/missions/plan", response_model=MissionPlanResponseDto)
    def plan_mission(request: MissionPlanRequestDto) -> MissionPlanResponseDto:
        mission_id = f"msn_{datetime.now(timezone.utc):%Y%m%d_%H%M%S}_{uuid4().hex[:6]}"
        try:
            route_path = provider.plan_route(request)
        except RouteProviderError as exc:
            raise HTTPException(status_code=404, detail="route_unavailable") from exc

        try:
            corridor_plan = generator.generate(request=request, route_path=route_path, mission_id=mission_id)
        except Exception as exc:
            raise HTTPException(status_code=409, detail="mission_generation_failed") from exc

        mission_kmz = kmz_generator.generate(
            mission_bundle=corridor_plan.response.missionBundle,
            mission_meta=corridor_plan.mission_meta,
        )
        store.put(
            mission_id,
            StoredMissionArtifacts(
                mission_bundle=corridor_plan.response.missionBundle,
                mission_meta=corridor_plan.mission_meta,
                mission_kmz=mission_kmz,
            ),
        )
        return corridor_plan.response

    @app.get("/v1/missions/{mission_id}/artifacts/mission.kmz")
    def get_mission_kmz(mission_id: str) -> Response:
        record = store.get(mission_id)
        if record is None:
            raise HTTPException(status_code=404, detail="mission_not_found")
        return Response(
            content=record.mission_kmz,
            media_type="application/vnd.google-earth.kmz",
        )

    @app.get("/v1/missions/{mission_id}/artifacts/mission_meta.json", response_model=MissionMetaDto)
    def get_mission_meta(mission_id: str) -> MissionMetaDto:
        record = store.get(mission_id)
        if record is None:
            raise HTTPException(status_code=404, detail="mission_not_found")
        return record.mission_meta

    @app.post("/v1/flights/{flight_id}/events", response_model=FlightEventsAcceptedDto, status_code=202)
    def ingest_events(flight_id: str, request: FlightEventsRequestDto) -> FlightEventsAcceptedDto:
        accepted = store.append_events(
            flight_id,
            [event.model_dump(mode="json") for event in request.events],
        )
        return FlightEventsAcceptedDto(accepted=accepted, rejected=0)

    @app.post(
        "/v1/flights/{flight_id}/telemetry:batch",
        response_model=TelemetryBatchAcceptedDto,
        status_code=202,
    )
    def ingest_telemetry(flight_id: str, request: TelemetryBatchRequestDto) -> TelemetryBatchAcceptedDto:
        accepted = store.append_telemetry(
            flight_id,
            [sample.model_dump(mode="json") for sample in request.samples],
        )
        return TelemetryBatchAcceptedDto(accepted=accepted)

    return app


app = build_app()
