from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import ceil, cos, radians, sqrt

from app.dto import (
    CorridorSegmentDto,
    GeoPointDto,
    InspectionViewpointDto,
    MissionArtifactsDto,
    MissionBundleDto,
    MissionFailsafeDto,
    MissionMetaDto,
    MissionPlanRequestDto,
    MissionPlanResponseDto,
    VerificationPointDto,
)
from app.providers import RoutePath


@dataclass(frozen=True)
class CorridorPlan:
    response: MissionPlanResponseDto
    mission_meta: MissionMetaDto


class CorridorGenerator:
    def generate(self, request: MissionPlanRequestDto, route_path: RoutePath, mission_id: str) -> CorridorPlan:
        densified = densify_polyline(route_path.points, max_spacing_m=10.0)
        half_width = min(
            request.corridorPolicy.defaultHalfWidthM,
            request.corridorPolicy.maxHalfWidthM,
        )

        segments = [
            CorridorSegmentDto(
                segmentId="seg-001",
                polyline=densified,
                halfWidthM=half_width,
                suggestedAltitudeM=request.flightProfile.defaultAltitudeM,
                suggestedSpeedMps=request.flightProfile.defaultSpeedMps,
            )
        ]

        verification_points = build_verification_points(densified, request)
        inspection_viewpoints = [
            InspectionViewpointDto(
                inspectionViewpointId=viewpoint.viewpointId,
                lat=viewpoint.lat,
                lng=viewpoint.lng,
                yawDeg=viewpoint.yawDeg,
                captureMode="photo_burst",
                label=viewpoint.label,
            )
            for viewpoint in request.inspectionIntent.viewpoints
        ]

        failsafe = MissionFailsafeDto()
        bundle = MissionBundleDto(
            missionId=mission_id,
            routeMode="road_network_following",
            defaultAltitudeM=request.flightProfile.defaultAltitudeM,
            defaultSpeedMps=request.flightProfile.defaultSpeedMps,
            corridorSegments=segments,
            verificationPoints=verification_points,
            inspectionViewpoints=inspection_viewpoints,
            failsafe=failsafe,
        )
        artifacts = MissionArtifactsDto(
            missionKmzUrl=f"/v1/missions/{mission_id}/artifacts/mission.kmz",
            missionMetaUrl=f"/v1/missions/{mission_id}/artifacts/mission_meta.json",
        )
        meta = MissionMetaDto(
            missionId=mission_id,
            generatedAt=datetime.now(timezone.utc),
            segments=len(segments),
            verificationPoints=len(verification_points),
            inspectionViewpoints=len(inspection_viewpoints),
            safetyDefaults=failsafe,
        )
        response = MissionPlanResponseDto(
            missionId=mission_id,
            missionBundle=bundle,
            artifacts=artifacts,
        )
        return CorridorPlan(response=response, mission_meta=meta)


def build_verification_points(
    polyline: list[GeoPointDto],
    request: MissionPlanRequestDto,
) -> list[VerificationPointDto]:
    if len(polyline) < 3:
        return []
    midpoint = polyline[len(polyline) // 2]
    return [
        VerificationPointDto(
            verificationPointId="vp-branch-001",
            lat=midpoint.lat,
            lng=midpoint.lng,
            expectedOptions=["STRAIGHT"],
            timeoutMs=2500,
        )
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
