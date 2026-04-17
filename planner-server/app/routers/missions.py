from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session, select

from app.audit import record_audit
from app.corridor import CorridorGenerator
from app.control_plane_read_models import build_mission_execution_summary
from app.deps import (
    CurrentActor,
    CurrentWebUser,
    get_artifact_service,
    get_corridor_generator,
    get_current_actor,
    get_current_operator,
    get_current_web_user,
    get_route_provider,
    get_session,
    require_internal_user,
)
from app.dto import (
    FlightEventsAcceptedDto,
    FlightEventsRequestDto,
    MissionArtifactDescriptorDto,
    MissionPlanRequestDto,
    MissionPlanResponseDto,
    TelemetryBatchAcceptedDto,
    TelemetryBatchRequestDto,
)
from app.inspection_control import load_mission_control_plane
from app.inspection_reporting import (
    load_reporting_state,
    reprocess_demo_analysis,
    serialize_event,
    serialize_report,
)
from app.mission_delivery import build_artifact_map, serialize_mission_delivery, summarize_mission_delivery
from app.models import Flight, FlightEvent, Mission, MissionArtifact, OperatorAccount, Site, TelemetryBatch
from app.providers import RouteProvider, RouteProviderError
from app.web_dto import (
    FlightEventRecordDto,
    InspectionEventDto,
    InspectionReportSummaryDto,
    MissionArtifactDownloadDto,
    MissionDeliveryDto,
    MissionDetailDto,
    MissionSummaryDto,
    ReprocessMissionAnalysisRequestDto,
    TelemetryBatchRecordDto,
)
from app.web_scope import apply_org_read_scope, ensure_org_read_access, ensure_org_write_access


router = APIRouter(tags=["missions"])


@router.post("/v1/missions/plan", response_model=MissionPlanResponseDto)
def plan_mission(
    request: MissionPlanRequestDto,
    current_actor: CurrentActor = Depends(get_current_actor),
    session: Session = Depends(get_session),
    provider: RouteProvider = Depends(get_route_provider),
    generator: CorridorGenerator = Depends(get_corridor_generator),
    artifact_service=Depends(get_artifact_service),
) -> MissionPlanResponseDto:
    organization_id = request.organizationId
    site_id = request.siteId
    requested_by_user_id = request.requestedByUserId
    planned_by_operator_id = None
    actor_user_id = None

    if current_actor.web_user is not None:
        if organization_id is None or site_id is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="organization_and_site_required")
        ensure_org_write_access(session, current_actor.web_user, organization_id, action="mission.plan_access")
        if "customer_viewer" in current_actor.web_user.roles_for_org(organization_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
        site = session.get(Site, site_id)
        if site is None or site.organization_id != organization_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="site_not_found")
        requested_by_user_id = current_actor.web_user.user.id
        actor_user_id = current_actor.web_user.user.id
    else:
        planned_by_operator_id = current_actor.operator.id if current_actor.operator is not None else None

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
        organizationId=organization_id,
        siteId=site_id,
        requestedByUserId=requested_by_user_id,
        status="ready",
        bundleVersion=corridor_plan.bundle_version,
        missionBundle=corridor_plan.mission_bundle,
        artifacts=_artifact_descriptors(mission_id=mission_id, artifacts=artifacts),
    )
    mission = Mission(
        id=mission_id,
        organization_id=organization_id,
        site_id=site_id,
        requested_by_user_id=requested_by_user_id,
        mission_name=request.missionName,
        status="ready",
        routing_mode=request.routingMode,
        bundle_version=corridor_plan.bundle_version,
        demo_mode=request.demoMode,
        planned_by_operator_id=planned_by_operator_id,
        request_json=request.model_dump(mode="json"),
        response_json=response_body.model_dump(mode="json"),
    )
    session.add(mission)
    session.add_all(
        [
            MissionArtifact(
                mission_id=mission_id,
                organization_id=organization_id,
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
                organization_id=organization_id,
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
    if organization_id is not None:
        record_audit(
            session,
            action="mission.planned",
            organization_id=organization_id,
            actor_user_id=actor_user_id,
            actor_operator_id=planned_by_operator_id,
            target_type="mission",
            target_id=mission_id,
            metadata={"siteId": site_id},
        )
        record_audit(
            session,
            action="artifact.published",
            organization_id=organization_id,
            actor_user_id=actor_user_id,
            actor_operator_id=planned_by_operator_id,
            target_type="mission",
            target_id=mission_id,
            metadata={"artifactNames": ["mission.kmz", "mission_meta.json"]},
        )
    session.commit()
    return response_body


@router.get("/v1/missions", response_model=list[MissionSummaryDto])
def list_missions(
    organizationId: str | None = None,
    siteId: str | None = None,
    statusFilter: str | None = Query(default=None, alias="status"),
    requestedBy: str | None = None,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[MissionSummaryDto]:
    statement = apply_org_read_scope(
        select(Mission).where(Mission.organization_id.is_not(None)),
        Mission.organization_id,
        current_user,
    )
    if organizationId is not None:
        statement = statement.where(Mission.organization_id == organizationId)
    if siteId is not None:
        statement = statement.where(Mission.site_id == siteId)
    if statusFilter is not None:
        statement = statement.where(Mission.status == statusFilter)
    if requestedBy is not None:
        statement = statement.where(Mission.requested_by_user_id == requestedBy)
    missions = session.exec(statement.order_by(Mission.created_at.desc())).all()
    artifact_map = build_artifact_map(session, [mission.id for mission in missions])
    report_map, event_map, _ = load_reporting_state(session, [mission.id for mission in missions])
    return [
        _serialize_mission_summary(
            mission,
            artifact_map.get(mission.id, []),
            report=report_map.get(mission.id),
            events=event_map.get(mission.id, []),
        )
        for mission in missions
    ]


@router.get("/v1/missions/{mission_id}", response_model=MissionDetailDto)
def get_mission_detail(
    mission_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> MissionDetailDto:
    mission = session.get(Mission, mission_id)
    if mission is None or mission.organization_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="mission_not_found")
    ensure_org_read_access(session, current_user, mission.organization_id, action="mission.read_access")
    artifacts = list(
        session.exec(
            select(MissionArtifact)
            .where(MissionArtifact.mission_id == mission_id)
            .order_by(MissionArtifact.created_at.asc(), MissionArtifact.artifact_name.asc())
        ).all()
    )
    route, template, schedule, dispatch = load_mission_control_plane(session, mission)
    report_map, event_map, reporting_artifact_map = load_reporting_state(session, [mission_id])
    report = report_map.get(mission_id)
    events = event_map.get(mission_id, [])
    return MissionDetailDto(
        missionId=mission.id,
        organizationId=mission.organization_id,
        siteId=mission.site_id,
        requestedByUserId=mission.requested_by_user_id,
        missionName=mission.mission_name,
        status=mission.status,
        bundleVersion=mission.bundle_version,
        request=mission.request_json,
        response=mission.response_json,
        delivery=serialize_mission_delivery(mission, artifacts),
        artifacts=[_serialize_mission_artifact(mission_id, artifact) for artifact in artifacts],
        reportStatus=report.status if report is not None else "not_started",
        reportGeneratedAt=report.generated_at if report is not None else None,
        eventCount=len(events),
        latestReport=serialize_report(report, artifact_map=reporting_artifact_map),
        events=[serialize_event(event, artifact_map=reporting_artifact_map) for event in events],
        route=route,
        template=template,
        schedule=schedule,
        dispatch=dispatch,
        executionSummary=build_mission_execution_summary(session, mission),
        createdAt=mission.created_at,
    )


@router.get("/v1/missions/{mission_id}/events", response_model=list[InspectionEventDto])
def get_mission_events(
    mission_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[InspectionEventDto]:
    mission = _get_org_mission(session, mission_id)
    ensure_org_read_access(session, current_user, mission.organization_id, action="mission.events.read_access")
    _, event_map, artifact_map = load_reporting_state(session, [mission_id])
    return [serialize_event(event, artifact_map=artifact_map) for event in event_map.get(mission_id, [])]


@router.get("/v1/missions/{mission_id}/report", response_model=InspectionReportSummaryDto | None)
def get_mission_report(
    mission_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> InspectionReportSummaryDto | None:
    mission = _get_org_mission(session, mission_id)
    ensure_org_read_access(session, current_user, mission.organization_id, action="mission.report.read_access")
    report_map, _, artifact_map = load_reporting_state(session, [mission_id])
    return serialize_report(report_map.get(mission_id), artifact_map=artifact_map)


@router.post("/v1/missions/{mission_id}/analysis/reprocess", response_model=InspectionReportSummaryDto, status_code=202)
def reprocess_mission_analysis(
    mission_id: str,
    request: ReprocessMissionAnalysisRequestDto,
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
    artifact_service=Depends(get_artifact_service),
) -> InspectionReportSummaryDto:
    mission = _get_org_mission(session, mission_id)
    ensure_org_read_access(session, current_user, mission.organization_id, action="mission.analysis.reprocess_access")

    report = reprocess_demo_analysis(
        session,
        mission=mission,
        artifact_service=artifact_service,
        actor_user_id=current_user.user.id,
        mode=request.mode,
    )
    record_audit(
        session,
        action="inspection.analysis_reprocessed",
        organization_id=mission.organization_id,
        actor_user_id=current_user.user.id,
        target_type="mission",
        target_id=mission_id,
        metadata={"mode": request.mode, "note": request.note},
    )
    record_audit(
        session,
        action="inspection.report_generated" if report.status == "ready" else "inspection.report_failed",
        organization_id=mission.organization_id,
        actor_user_id=current_user.user.id,
        target_type="mission",
        target_id=mission_id,
        metadata={"mode": request.mode, "reportId": report.id, "eventCount": report.event_count},
    )
    session.commit()

    report_map, _, artifact_map = load_reporting_state(session, [mission_id])
    serialized = serialize_report(report_map.get(mission_id), artifact_map=artifact_map)
    if serialized is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="report_missing_after_reprocess")
    return serialized


@router.get("/v1/missions/{mission_id}/artifacts/mission.kmz")
def get_mission_kmz(
    mission_id: str,
    response: Response,
    current_actor: CurrentActor = Depends(get_current_actor),
    session: Session = Depends(get_session),
    artifact_service=Depends(get_artifact_service),
) -> Response:
    return _read_mission_artifact_response(
        mission_id=mission_id,
        artifact_name="mission.kmz",
        response=response,
        current_actor=current_actor,
        session=session,
        artifact_service=artifact_service,
    )


@router.get("/v1/missions/{mission_id}/artifacts/mission_meta.json")
def get_mission_meta(
    mission_id: str,
    response: Response,
    current_actor: CurrentActor = Depends(get_current_actor),
    session: Session = Depends(get_session),
    artifact_service=Depends(get_artifact_service),
) -> Response:
    return _read_mission_artifact_response(
        mission_id=mission_id,
        artifact_name="mission_meta.json",
        response=response,
        current_actor=current_actor,
        session=session,
        artifact_service=artifact_service,
    )


@router.get("/v1/missions/{mission_id}/artifacts/{artifact_name}")
def get_mission_artifact(
    mission_id: str,
    artifact_name: str,
    response: Response,
    current_actor: CurrentActor = Depends(get_current_actor),
    session: Session = Depends(get_session),
    artifact_service=Depends(get_artifact_service),
) -> Response:
    return _read_mission_artifact_response(
        mission_id=mission_id,
        artifact_name=artifact_name,
        response=response,
        current_actor=current_actor,
        session=session,
        artifact_service=artifact_service,
    )


@router.post("/v1/flights/{flight_id}/events", response_model=FlightEventsAcceptedDto, status_code=202)
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


@router.post("/v1/flights/{flight_id}/telemetry:batch", response_model=TelemetryBatchAcceptedDto, status_code=202)
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


@router.get("/v1/flights/{flight_id}/events", response_model=list[FlightEventRecordDto])
def read_events(
    flight_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[FlightEventRecordDto]:
    flight = session.get(Flight, flight_id)
    if flight is None or flight.organization_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="flight_not_found")
    ensure_org_read_access(session, current_user, flight.organization_id, action="flight.events.read_access")
    events = list(session.exec(select(FlightEvent).where(FlightEvent.flight_id == flight_id)).all())
    return [
        FlightEventRecordDto(
            eventId=event.id,
            eventType=event.event_type,
            eventTimestamp=event.event_timestamp,
            payload=event.payload_json,
        )
        for event in events
    ]


@router.get("/v1/flights/{flight_id}/telemetry", response_model=list[TelemetryBatchRecordDto])
def read_telemetry(
    flight_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[TelemetryBatchRecordDto]:
    flight = session.get(Flight, flight_id)
    if flight is None or flight.organization_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="flight_not_found")
    ensure_org_read_access(session, current_user, flight.organization_id, action="flight.telemetry.read_access")
    batches = list(session.exec(select(TelemetryBatch).where(TelemetryBatch.flight_id == flight_id)).all())
    return [
        TelemetryBatchRecordDto(
            telemetryBatchId=batch.id,
            sampleCount=batch.sample_count,
            firstTimestamp=batch.first_timestamp,
            lastTimestamp=batch.last_timestamp,
            payload=batch.payload_json,
        )
        for batch in batches
    ]


def _artifact_descriptors(mission_id: str, artifacts):
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


def _serialize_mission_artifact(mission_id: str, artifact: MissionArtifact) -> MissionArtifactDownloadDto:
    return MissionArtifactDownloadDto(
        artifactName=artifact.artifact_name,
        downloadUrl=f"/v1/missions/{mission_id}/artifacts/{artifact.artifact_name}",
        version=artifact.version,
        checksumSha256=artifact.checksum_sha256,
        contentType=artifact.content_type,
        sizeBytes=artifact.size_bytes,
        cacheControl=artifact.cache_control,
        publishedAt=artifact.created_at,
    )


def _serialize_mission_summary(
    mission: Mission,
    artifacts: list[MissionArtifact],
    *,
    report=None,
    events: list | None = None,
) -> MissionSummaryDto:
    delivery_status, published_at, failure_reason = summarize_mission_delivery(mission, artifacts)
    return MissionSummaryDto(
        missionId=mission.id,
        organizationId=mission.organization_id,
        siteId=mission.site_id,
        missionName=mission.mission_name,
        status=mission.status,
        bundleVersion=mission.bundle_version,
        deliveryStatus=delivery_status,
        publishedAt=published_at,
        failureReason=failure_reason,
        reportStatus=report.status if report is not None else "not_started",
        reportGeneratedAt=report.generated_at if report is not None else None,
        eventCount=len(events or []),
        createdAt=mission.created_at,
    )


def _get_artifact(session: Session, mission_id: str, artifact_name: str) -> MissionArtifact:
    statement = select(MissionArtifact).where(
        MissionArtifact.mission_id == mission_id,
        MissionArtifact.artifact_name == artifact_name,
    )
    artifact = session.exec(statement).first()
    if artifact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="artifact_not_found")
    return artifact


def _get_org_mission(session: Session, mission_id: str) -> Mission:
    mission = session.get(Mission, mission_id)
    if mission is None or mission.organization_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="mission_not_found")
    return mission


def _authorize_mission_artifact(session: Session, current_actor: CurrentActor, organization_id: str | None) -> None:
    if current_actor.operator is not None:
        return
    if current_actor.web_user is None or organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
    ensure_org_read_access(session, current_actor.web_user, organization_id, action="artifact.read_access")


def _read_mission_artifact_response(
    *,
    mission_id: str,
    artifact_name: str,
    response: Response,
    current_actor: CurrentActor,
    session: Session,
    artifact_service,
) -> Response:
    artifact = _get_artifact(session, mission_id, artifact_name)
    _authorize_mission_artifact(session, current_actor, artifact.organization_id)
    payload = artifact_service.read(artifact.storage_key)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="artifact_missing")
    response.headers["Cache-Control"] = artifact.cache_control
    response.headers["ETag"] = artifact.checksum_sha256
    response.headers["X-Artifact-Version"] = str(artifact.version)
    response.headers["X-Artifact-Checksum"] = artifact.checksum_sha256
    return Response(content=payload, media_type=artifact.content_type, headers=response.headers)


def _ensure_flight(session: Session, flight_id: str, mission_id: str, operator_id: str) -> Flight:
    mission = session.get(Mission, mission_id)
    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="mission_not_found")

    flight = session.get(Flight, flight_id)
    if flight is None:
        flight = Flight(
            id=flight_id,
            mission_id=mission_id,
            organization_id=mission.organization_id,
            operator_id=operator_id,
        )
        session.add(flight)
        session.flush()
        return flight
    if flight.mission_id != mission_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="flight_mission_mismatch")
    if flight.organization_id != mission.organization_id:
        flight.organization_id = mission.organization_id
        session.add(flight)
    return flight
