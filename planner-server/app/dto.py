from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class GeoPointDto(BaseModel):
    lat: float
    lng: float


class LaunchPointDto(BaseModel):
    launchPointId: str = Field(min_length=1)
    location: GeoPointDto
    label: str | None = None


class OrderedWaypointDto(BaseModel):
    waypointId: str = Field(min_length=1)
    location: GeoPointDto
    sequence: int = Field(ge=1)
    holdSeconds: int = Field(default=0, ge=0)
    speedMetersPerSecond: float | None = Field(default=None, gt=0)
    altitudeMeters: float | None = Field(default=None, gt=0)


class TargetBuildingDto(BaseModel):
    buildingId: str = Field(min_length=1)
    label: str = Field(min_length=1)


class CorridorPolicyDto(BaseModel):
    defaultHalfWidthM: float = Field(gt=0)
    maxHalfWidthM: float = Field(gt=0)
    branchConfirmRadiusM: float = Field(gt=0)

    @field_validator("maxHalfWidthM")
    @classmethod
    def validate_max_width(cls, value: float, info: Any) -> float:
        default = info.data.get("defaultHalfWidthM")
        if default is not None and value < default:
            raise ValueError("maxHalfWidthM must be >= defaultHalfWidthM")
        return value


class FlightProfileDto(BaseModel):
    defaultAltitudeM: float = Field(gt=0)
    defaultSpeedMps: float = Field(gt=0)
    maxApproachSpeedMps: float = Field(gt=0)


class InspectionViewpointRequestDto(BaseModel):
    viewpointId: str = Field(min_length=1)
    label: str = Field(min_length=1)
    lat: float
    lng: float
    yawDeg: float
    distanceToFacadeM: float = Field(gt=0)


class InspectionIntentDto(BaseModel):
    viewpoints: list[InspectionViewpointRequestDto]

    @field_validator("viewpoints")
    @classmethod
    def validate_viewpoints(cls, value: list[InspectionViewpointRequestDto]) -> list[InspectionViewpointRequestDto]:
        if not value:
            raise ValueError("viewpoints must not be empty")
        return value


class MissionPlanRequestDto(BaseModel):
    organizationId: str | None = None
    siteId: str | None = None
    requestedByUserId: str | None = None
    missionName: str = Field(min_length=1)
    origin: GeoPointDto | None = None
    targetBuilding: TargetBuildingDto | None = None
    routingMode: Literal["road_network_following"]
    corridorPolicy: CorridorPolicyDto | None = None
    flightProfile: FlightProfileDto
    inspectionIntent: InspectionIntentDto | None = None
    launchPoint: LaunchPointDto | None = None
    orderedWaypoints: list[OrderedWaypointDto] = Field(default_factory=list)
    implicitReturnToLaunch: bool = True
    operatingProfile: Literal["outdoor_gps_patrol", "indoor_no_gps"] = "outdoor_gps_patrol"
    demoMode: bool = True

    @model_validator(mode="after")
    def normalize_patrol_geometry(self) -> "MissionPlanRequestDto":
        if self.launchPoint is None and self.origin is not None:
            self.launchPoint = LaunchPointDto(
                launchPointId="launch-origin",
                location=self.origin,
                label="legacy-origin",
            )

        if not self.orderedWaypoints and self.inspectionIntent is not None:
            self.orderedWaypoints = [
                OrderedWaypointDto(
                    waypointId=viewpoint.viewpointId,
                    location=GeoPointDto(lat=viewpoint.lat, lng=viewpoint.lng),
                    sequence=index + 1,
                    holdSeconds=0,
                )
                for index, viewpoint in enumerate(self.inspectionIntent.viewpoints)
            ]

        if self.launchPoint is None:
            raise ValueError("launchPoint must not be empty")
        if not self.orderedWaypoints:
            raise ValueError("orderedWaypoints must not be empty")
        if not self.implicitReturnToLaunch:
            raise ValueError("implicitReturnToLaunch must remain true for patrol-route v1")

        ordered_sequences = [waypoint.sequence for waypoint in self.orderedWaypoints]
        if ordered_sequences != list(range(1, len(self.orderedWaypoints) + 1)):
            raise ValueError("orderedWaypoints.sequence must be contiguous and start at 1")

        return self


class InspectionViewpointDto(BaseModel):
    inspectionViewpointId: str
    location: GeoPointDto
    yawDegrees: float
    captureMode: str
    label: str


class MissionFailsafeDto(BaseModel):
    onSemanticTimeout: Literal["HOLD"] = "HOLD"
    onBatteryCritical: Literal["RTH"] = "RTH"
    onFrameDrop: Literal["HOLD"] = "HOLD"


class MissionBundleDto(BaseModel):
    missionId: str
    routeMode: Literal["road_network_following"]
    operatingProfile: Literal["outdoor_gps_patrol", "indoor_no_gps"]
    launchPoint: LaunchPointDto
    orderedWaypoints: list[OrderedWaypointDto]
    implicitReturnToLaunch: bool = True
    defaultAltitudeMeters: float
    defaultSpeedMetersPerSecond: float
    failsafe: MissionFailsafeDto = Field(default_factory=MissionFailsafeDto)
    legacyInspectionViewpoints: list[InspectionViewpointDto] = Field(default_factory=list)


class MissionArtifactDescriptorDto(BaseModel):
    downloadUrl: str
    version: int = Field(ge=1)
    checksumSha256: str = Field(min_length=1)
    contentType: str = Field(min_length=1)
    sizeBytes: int = Field(ge=0)
    cacheControl: str = Field(min_length=1)


class MissionArtifactsDto(BaseModel):
    missionKmz: MissionArtifactDescriptorDto
    missionMeta: MissionArtifactDescriptorDto


class MissionPlanResponseDto(BaseModel):
    missionId: str
    organizationId: str | None = None
    siteId: str | None = None
    requestedByUserId: str | None = None
    status: Literal["draft", "planning", "ready", "failed", "archived"] = "ready"
    bundleVersion: str = "1.0.0"
    missionBundle: MissionBundleDto
    artifacts: MissionArtifactsDto


class MissionMetaDto(BaseModel):
    missionId: str
    bundleVersion: str = "1.0.0"
    generatedAt: datetime
    routeMode: Literal["road_network_following"]
    operatingProfile: Literal["outdoor_gps_patrol", "indoor_no_gps"]
    launchPoint: LaunchPointDto
    waypointCount: int = Field(ge=0)
    implicitReturnToLaunch: bool = True
    defaultAltitudeMeters: float = Field(gt=0)
    defaultSpeedMetersPerSecond: float = Field(gt=0)
    landingPolicy: Literal["android_auto_landing_with_rc_fallback"] = "android_auto_landing_with_rc_fallback"
    safetyDefaults: MissionFailsafeDto
    artifacts: MissionArtifactsDto
    legacyInspectionViewpointCount: int = Field(default=0, ge=0)


class FlightEventDto(BaseModel):
    eventId: str = Field(min_length=1)
    type: str = Field(min_length=1)
    timestamp: datetime
    payload: dict[str, Any] = Field(default_factory=dict)


class FlightEventsRequestDto(BaseModel):
    missionId: str = Field(min_length=1)
    events: list[FlightEventDto] = Field(min_length=1)


class FlightEventsAcceptedDto(BaseModel):
    accepted: int
    rejected: int


class TelemetrySampleDto(BaseModel):
    timestamp: datetime
    lat: float
    lng: float
    altitudeM: float
    groundSpeedMps: float = Field(ge=0)
    batteryPct: int = Field(ge=0, le=100)
    flightState: str = Field(min_length=1)
    corridorDeviationM: float = Field(ge=0)


class TelemetryBatchRequestDto(BaseModel):
    missionId: str = Field(min_length=1)
    samples: list[TelemetrySampleDto] = Field(min_length=1)


class TelemetryBatchAcceptedDto(BaseModel):
    accepted: int


class LoginRequestDto(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=8)


class AuthRefreshRequestDto(BaseModel):
    refreshToken: str = Field(min_length=1)


class AuthLogoutRequestDto(BaseModel):
    refreshToken: str = Field(min_length=1)


class OperatorDto(BaseModel):
    operatorId: str
    username: str
    displayName: str


class TokenPairDto(BaseModel):
    accessToken: str
    refreshToken: str
    tokenType: Literal["bearer"] = "bearer"
    expiresInSeconds: int = Field(gt=0)
    operator: OperatorDto
