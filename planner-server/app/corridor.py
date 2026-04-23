from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import ceil, cos, radians, sqrt

from app.dto import (
    GeoPointDto,
    InspectionViewpointDto,
    LaunchPointDto,
    MissionArtifactDescriptorDto,
    MissionArtifactsDto,
    MissionBundleDto,
    MissionFailsafeDto,
    MissionMetaDto,
    MissionPlanRequestDto,
    OrderedWaypointDto,
)
from app.providers import RoutePath


@dataclass(frozen=True)
class CorridorPlan:
    bundle_version: str
    mission_bundle: MissionBundleDto
    mission_meta: MissionMetaDto


class CorridorGenerator:
    def __init__(self, *, densify_spacing_m: float = 10.0) -> None:
        self.densify_spacing_m = densify_spacing_m

    def generate(self, request: MissionPlanRequestDto, route_path: RoutePath, mission_id: str) -> CorridorPlan:
        _ = densify_polyline(route_path.points, max_spacing_m=self.densify_spacing_m)
        legacy_inspection_viewpoints = [
            InspectionViewpointDto(
                inspectionViewpointId=viewpoint.viewpointId,
                location=GeoPointDto(lat=viewpoint.lat, lng=viewpoint.lng),
                yawDegrees=viewpoint.yawDeg,
                captureMode="photo_burst",
                label=viewpoint.label,
            )
            for viewpoint in (request.inspectionIntent.viewpoints if request.inspectionIntent is not None else [])
        ]
        failsafe = MissionFailsafeDto()
        bundle_version = "2.0.0"
        mission_bundle = MissionBundleDto(
            missionId=mission_id,
            routeMode="road_network_following",
            operatingProfile=request.operatingProfile,
            launchPoint=request.launchPoint,
            orderedWaypoints=[
                OrderedWaypointDto(
                    waypointId=waypoint.waypointId,
                    location=waypoint.location,
                    sequence=waypoint.sequence,
                    holdSeconds=waypoint.holdSeconds,
                    speedMetersPerSecond=waypoint.speedMetersPerSecond,
                    altitudeMeters=waypoint.altitudeMeters,
                )
                for waypoint in sorted(request.orderedWaypoints, key=lambda item: item.sequence)
            ],
            implicitReturnToLaunch=True,
            defaultAltitudeMeters=request.flightProfile.defaultAltitudeM,
            defaultSpeedMetersPerSecond=request.flightProfile.defaultSpeedMps,
            failsafe=failsafe,
            legacyInspectionViewpoints=legacy_inspection_viewpoints,
        )
        placeholder_descriptor = MissionArtifactDescriptorDto(
            downloadUrl="pending",
            version=1,
            checksumSha256="pending",
            contentType="application/octet-stream",
            sizeBytes=0,
            cacheControl="private, max-age=300",
        )
        mission_meta = MissionMetaDto(
            missionId=mission_id,
            bundleVersion=bundle_version,
            generatedAt=datetime.now(timezone.utc),
            routeMode="road_network_following",
            operatingProfile=request.operatingProfile,
            launchPoint=LaunchPointDto(
                launchPointId=request.launchPoint.launchPointId,
                location=request.launchPoint.location,
                label=request.launchPoint.label,
            ),
            waypointCount=len(request.orderedWaypoints),
            implicitReturnToLaunch=True,
            defaultAltitudeMeters=request.flightProfile.defaultAltitudeM,
            defaultSpeedMetersPerSecond=request.flightProfile.defaultSpeedMps,
            landingPolicy="android_auto_landing_with_rc_fallback",
            safetyDefaults=failsafe,
            legacyInspectionViewpointCount=len(legacy_inspection_viewpoints),
            artifacts=MissionArtifactsDto(
                missionKmz=placeholder_descriptor,
                missionMeta=placeholder_descriptor,
            ),
        )
        return CorridorPlan(
            bundle_version=bundle_version,
            mission_bundle=mission_bundle,
            mission_meta=mission_meta,
        )
def densify_polyline(points: list[GeoPointDto], max_spacing_m: float) -> list[GeoPointDto]:
    if len(points) < 2:
        return points

    densified: list[GeoPointDto] = [points[0]]
    for start, end in zip(points, points[1:]):
        distance = approx_distance_m(start, end)
        steps = max(1, ceil(distance / max_spacing_m))
        for step in range(1, steps):
            ratio = step / steps
            densified.append(
                GeoPointDto(
                    lat=start.lat + (end.lat - start.lat) * ratio,
                    lng=start.lng + (end.lng - start.lng) * ratio,
                )
            )
        densified.append(end)
    return densified


def approx_distance_m(start: GeoPointDto, end: GeoPointDto) -> float:
    lat_scale = 111_320.0
    lng_scale = 111_320.0 * cos(radians((start.lat + end.lat) / 2))
    dx = (end.lng - start.lng) * lng_scale
    dy = (end.lat - start.lat) * lat_scale
    return sqrt(dx * dx + dy * dy)
