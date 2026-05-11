from __future__ import annotations

from sqlmodel import Session, select

from app.artifacts import MissionArtifactService
from app.corridor import CorridorGenerator
from app.dto import (
    FlightProfileDto,
    GeoPointDto,
    LaunchPointDto,
    MissionPlanRequestDto,
    MissionPlanResponseDto,
    OrderedWaypointDto,
)
from app.models import DispatchRecord, InspectionRoute, Mission, MissionArtifact
from app.providers import RouteProvider, RouteProviderError


class DispatchMaterializationError(RuntimeError):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


def materialize_dispatch_mission(
    *,
    session: Session,
    dispatch: DispatchRecord,
    mission: Mission,
    route: InspectionRoute,
    provider: RouteProvider,
    generator: CorridorGenerator,
    artifact_service: MissionArtifactService,
) -> MissionPlanResponseDto:
    request = build_plan_request_from_route(dispatch=dispatch, mission=mission, route=route)
    try:
        route_path = provider.plan_route(request)
        corridor_plan = generator.generate(request=request, route_path=route_path, mission_id=mission.id)
    except RouteProviderError as exc:
        raise DispatchMaterializationError("route_unavailable") from exc
    except Exception as exc:
        raise DispatchMaterializationError("mission_generation_failed") from exc

    mission_meta = corridor_plan.mission_meta.model_copy(
        update={
            "routeId": route.id,
            "dispatchId": dispatch.id,
            "missionSource": "assigned_dispatch",
        }
    )
    artifacts = artifact_service.generate_and_store(
        mission_id=mission.id,
        bundle_version=corridor_plan.bundle_version,
        mission_bundle=corridor_plan.mission_bundle,
        mission_meta=mission_meta,
    )
    response_body = MissionPlanResponseDto(
        missionId=mission.id,
        organizationId=mission.organization_id,
        siteId=mission.site_id,
        requestedByUserId=mission.requested_by_user_id,
        status="ready",
        bundleVersion=corridor_plan.bundle_version,
        missionBundle=corridor_plan.mission_bundle,
        artifacts=_artifact_descriptors(mission_id=mission.id, artifacts=artifacts),
    )

    _replace_mission_artifacts(session, mission.id)
    mission.routing_mode = request.routingMode
    mission.bundle_version = corridor_plan.bundle_version
    mission.demo_mode = False
    mission.request_json = request.model_dump(mode="json")
    mission.response_json = response_body.model_dump(mode="json")
    session.add(mission)
    session.add(
        MissionArtifact(
            mission_id=mission.id,
            organization_id=mission.organization_id,
            artifact_name="mission.kmz",
            version=artifacts.mission_kmz.version,
            checksum_sha256=artifacts.mission_kmz.checksum_sha256,
            content_type=artifacts.mission_kmz.content_type,
            storage_key=artifacts.mission_kmz.storage_key,
            cache_control=artifacts.mission_kmz.cache_control,
            size_bytes=artifacts.mission_kmz.size_bytes,
        )
    )
    session.add(
        MissionArtifact(
            mission_id=mission.id,
            organization_id=mission.organization_id,
            artifact_name="mission_meta.json",
            version=artifacts.mission_meta_json.version,
            checksum_sha256=artifacts.mission_meta_json.checksum_sha256,
            content_type=artifacts.mission_meta_json.content_type,
            storage_key=artifacts.mission_meta_json.storage_key,
            cache_control=artifacts.mission_meta_json.cache_control,
            size_bytes=artifacts.mission_meta_json.size_bytes,
        )
    )
    return response_body


def build_plan_request_from_route(
    *,
    dispatch: DispatchRecord,
    mission: Mission,
    route: InspectionRoute,
) -> MissionPlanRequestDto:
    if not route.launch_point_json:
        raise DispatchMaterializationError("route_launch_point_required")
    if not route.waypoints_json:
        raise DispatchMaterializationError("route_waypoints_required")

    default_altitude = _default_altitude(route)
    default_speed = _number(route.planning_parameters_json.get("defaultSpeedMetersPerSecond"), fallback=4.0)

    return MissionPlanRequestDto(
        organizationId=mission.organization_id,
        siteId=mission.site_id,
        requestedByUserId=mission.requested_by_user_id,
        missionName=mission.mission_name,
        routingMode="road_network_following",
        flightProfile=FlightProfileDto(
            defaultAltitudeM=default_altitude,
            defaultSpeedMps=default_speed,
            maxApproachSpeedMps=_number(route.planning_parameters_json.get("maxApproachSpeedMetersPerSecond"), fallback=2.0),
        ),
        launchPoint=_launch_point(route),
        orderedWaypoints=_ordered_waypoints(route),
        implicitReturnToLaunch=True,
        operatingProfile="outdoor_gps_patrol",
        demoMode=False,
    )


def _artifact_descriptors(*, mission_id: str, artifacts) -> dict:
    return {
        "missionKmz": {
            "downloadUrl": f"/v1/missions/{mission_id}/artifacts/mission.kmz",
            "version": artifacts.mission_kmz.version,
            "checksumSha256": artifacts.mission_kmz.checksum_sha256,
            "contentType": artifacts.mission_kmz.content_type,
            "sizeBytes": artifacts.mission_kmz.size_bytes,
            "cacheControl": artifacts.mission_kmz.cache_control,
        },
        "missionMeta": {
            "downloadUrl": f"/v1/missions/{mission_id}/artifacts/mission_meta.json",
            "version": artifacts.mission_meta_json.version,
            "checksumSha256": artifacts.mission_meta_json.checksum_sha256,
            "contentType": artifacts.mission_meta_json.content_type,
            "sizeBytes": artifacts.mission_meta_json.size_bytes,
            "cacheControl": artifacts.mission_meta_json.cache_control,
        },
    }


def _replace_mission_artifacts(session: Session, mission_id: str) -> None:
    artifacts = session.exec(
        select(MissionArtifact).where(
            MissionArtifact.mission_id == mission_id,
            MissionArtifact.artifact_name.in_(["mission.kmz", "mission_meta.json"]),
        )
    ).all()
    for artifact in artifacts:
        session.delete(artifact)
    session.flush()


def _launch_point(route: InspectionRoute) -> LaunchPointDto:
    source = route.launch_point_json
    return LaunchPointDto(
        launchPointId=str(source.get("launchPointId") or f"route-launch-{route.id[:8]}"),
        label=str(source.get("label") or "L"),
        location=GeoPointDto(lat=_coordinate(source, "lat"), lng=_coordinate(source, "lng")),
    )


def _ordered_waypoints(route: InspectionRoute) -> list[OrderedWaypointDto]:
    waypoints: list[OrderedWaypointDto] = []
    for index, source in enumerate(route.waypoints_json, start=1):
        altitude = _number(source.get("altitudeM"), fallback=_default_altitude(route))
        waypoints.append(
            OrderedWaypointDto(
                waypointId=str(source.get("waypointId") or source.get("id") or f"wp-{index:03d}"),
                sequence=index,
                location=GeoPointDto(lat=_coordinate(source, "lat"), lng=_coordinate(source, "lng")),
                holdSeconds=int(_number(source.get("dwellSeconds"), fallback=0.0)),
                speedMetersPerSecond=_optional_number(source.get("speedMetersPerSecond")),
                altitudeMeters=altitude,
            )
        )
    return waypoints


def _default_altitude(route: InspectionRoute) -> float:
    planning = route.planning_parameters_json
    if "defaultAltitudeMeters" in planning:
        return _number(planning.get("defaultAltitudeMeters"), fallback=35.0)
    if "defaultAltitudeM" in planning:
        return _number(planning.get("defaultAltitudeM"), fallback=35.0)
    for waypoint in route.waypoints_json:
        if waypoint.get("altitudeM") is not None:
            return _number(waypoint.get("altitudeM"), fallback=35.0)
    return 35.0


def _coordinate(source: dict, key: str) -> float:
    value = source.get(key)
    if value is None and isinstance(source.get("location"), dict):
        value = source["location"].get(key)
    if value is None:
        raise DispatchMaterializationError(f"route_{key}_required")
    return float(value)


def _number(value, *, fallback: float) -> float:
    if value is None:
        return fallback
    return float(value)


def _optional_number(value) -> float | None:
    return None if value is None else float(value)
