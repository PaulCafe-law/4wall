from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class GeoPointDto(BaseModel):
    lat: float
    lng: float


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
    origin: GeoPointDto
    targetBuilding: TargetBuildingDto
    routingMode: Literal["road_network_following"]
    corridorPolicy: CorridorPolicyDto
    flightProfile: FlightProfileDto
    inspectionIntent: InspectionIntentDto
    demoMode: bool = True


class CorridorSegmentDto(BaseModel):
    segmentId: str
    polyline: list[GeoPointDto]
    halfWidthMeters: float
    suggestedAltitudeMeters: float
    suggestedSpeedMetersPerSecond: float


class VerificationPointDto(BaseModel):
    verificationPointId: str
    location: GeoPointDto
    expectedOptions: list[Literal["LEFT", "RIGHT", "STRAIGHT"]]
    timeoutMillis: int = Field(gt=0)


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
    defaultAltitudeMeters: float
    defaultSpeedMetersPerSecond: float
    corridorSegments: list[CorridorSegmentDto]
    verificationPoints: list[VerificationPointDto]
    inspectionViewpoints: list[InspectionViewpointDto]
    failsafe: MissionFailsafeDto = Field(default_factory=MissionFailsafeDto)


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
    segments: int
    verificationPoints: int
    inspectionViewpoints: int
    corridorHalfWidthM: float
    suggestedAltitudeM: float
    suggestedSpeedMps: float
    safetyDefaults: MissionFailsafeDto
    artifacts: MissionArtifactsDto


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
