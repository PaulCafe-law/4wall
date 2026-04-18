from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import ceil, cos, radians, sqrt

from app.dto import (
    CorridorSegmentDto,
    GeoPointDto,
    MissionArtifactDescriptorDto,
    MissionArtifactsDto,
    MissionBundleDto,
    MissionFailsafeDto,
    MissionMetaDto,
    MissionPlanRequestDto,
    VerificationPointDto,
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
        densified = densify_polyline(route_path.points, max_spacing_m=self.densify_spacing_m)
        half_width = min(request.corridorPolicy.defaultHalfWidthM, request.corridorPolicy.maxHalfWidthM)
        verification_points = build_verification_points(densified, request)
        launch_point = request.launchPoint or request.origin
        if launch_point is None:
            raise ValueError("launch point missing")
        failsafe = MissionFailsafeDto()
        bundle_version = "1.1.0"
        mission_bundle = MissionBundleDto(
            missionId=mission_id,
            routeMode="road_network_following",
            defaultAltitudeMeters=request.flightProfile.defaultAltitudeM,
            defaultSpeedMetersPerSecond=request.flightProfile.defaultSpeedMps,
            launchPoint=launch_point,
            waypointCount=len(request.waypoints),
            implicitReturnToLaunch=True,
            corridorSegments=[
                CorridorSegmentDto(
                    segmentId="seg-001",
                    polyline=densified,
                    halfWidthMeters=half_width,
                    suggestedAltitudeMeters=request.flightProfile.defaultAltitudeM,
                    suggestedSpeedMetersPerSecond=request.flightProfile.defaultSpeedMps,
                )
            ],
            verificationPoints=verification_points,
            failsafe=failsafe,
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
            segments=1,
            verificationPoints=len(verification_points),
            routeWaypointCount=len(request.waypoints),
            implicitReturnToLaunch=True,
            corridorHalfWidthM=half_width,
            suggestedAltitudeM=request.flightProfile.defaultAltitudeM,
            suggestedSpeedMps=request.flightProfile.defaultSpeedMps,
            safetyDefaults=failsafe,
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


def build_verification_points(
    polyline: list[GeoPointDto],
    request: MissionPlanRequestDto,
) -> list[VerificationPointDto]:
    if len(polyline) < 3:
        return []
    midpoint = polyline[len(polyline) // 2]
    final_approach = polyline[max(len(polyline) - 3, 0)]
    return [
        VerificationPointDto(
            verificationPointId="vp-branch-001",
            location=GeoPointDto(lat=midpoint.lat, lng=midpoint.lng),
            expectedOptions=["STRAIGHT"],
            timeoutMillis=2500,
        ),
        VerificationPointDto(
            verificationPointId="vp-final-001",
            location=GeoPointDto(lat=final_approach.lat, lng=final_approach.lng),
            expectedOptions=["STRAIGHT"],
            timeoutMillis=max(int(request.corridorPolicy.branchConfirmRadiusM * 100), 1500),
        ),
    ]


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
