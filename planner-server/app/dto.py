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
    halfWidthM: float
    suggestedAltitudeM: float
    suggestedSpeedMps: float


class VerificationPointDto(BaseModel):
    verificationPointId: str
    lat: float
    lng: float
    expectedOptions: list[Literal["LEFT", "RIGHT", "STRAIGHT"]]
    timeoutMs: int = Field(gt=0)


class InspectionViewpointDto(BaseModel):
    inspectionViewpointId: str
    lat: float
    lng: float
    yawDeg: float
    captureMode: str
    label: str


class MissionFailsafeDto(BaseModel):
    onSemanticTimeout: Literal["HOLD"] = "HOLD"
    onBatteryCritical: Literal["RTH"] = "RTH"
    onFrameDrop: Literal["HOLD"] = "HOLD"


class MissionBundleDto(BaseModel):
    missionId: str
    routeMode: Literal["road_network_following"]
    defaultAltitudeM: float
    defaultSpeedMps: float
    corridorSegments: list[CorridorSegmentDto]
    verificationPoints: list[VerificationPointDto]
    inspectionViewpoints: list[InspectionViewpointDto]
    failsafe: MissionFailsafeDto = Field(default_factory=MissionFailsafeDto)


class MissionArtifactsDto(BaseModel):
    missionKmzUrl: str
    missionMetaUrl: str


class MissionPlanResponseDto(BaseModel):
    missionId: str
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
    safetyDefaults: MissionFailsafeDto


class FlightEventDto(BaseModel):
    eventId: str = Field(min_length=1)
    missionId: str = Field(min_length=1)
    type: str = Field(min_length=1)
    timestamp: datetime
    payload: dict[str, Any] = Field(default_factory=dict)


class FlightEventsRequestDto(BaseModel):
    events: list[FlightEventDto]


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
    flightState: str
    corridorDeviationM: float = Field(ge=0)


class TelemetryBatchRequestDto(BaseModel):
    samples: list[TelemetrySampleDto]


class TelemetryBatchAcceptedDto(BaseModel):
    accepted: int
