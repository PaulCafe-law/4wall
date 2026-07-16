from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictDto(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProvisionOpenBmcConnectorDto(StrictDto):
    organizationId: str = Field(min_length=1, max_length=64)
    siteId: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    version: str = Field(default="unknown", min_length=1, max_length=80)


class OpenBmcConnectorTokenDto(StrictDto):
    connectorId: str
    connectorToken: str
    connectorTokenWarning: str


class OpenBmcConnectorStatusDto(StrictDto):
    connectorId: str
    organizationId: str
    siteId: str
    name: str
    status: str
    version: str
    lastHeartbeatAt: datetime | None
    lastObservationAt: datetime | None
    lastErrorCode: str | None
    createdAt: datetime
    updatedAt: datetime


class ProvisionedOpenBmcConnectorDto(OpenBmcConnectorStatusDto):
    connectorToken: str
    connectorTokenWarning: str


class OpenBmcConnectorListDto(StrictDto):
    connectors: list[OpenBmcConnectorStatusDto]


class ProvisionOpenBmcDeviceDto(StrictDto):
    organizationId: str = Field(min_length=1, max_length=64)
    siteId: str = Field(min_length=1, max_length=64)
    connectorId: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    externalRef: str = Field(min_length=1, max_length=120)
    deviceType: Literal["raspberry_pi_5"] = "raspberry_pi_5"
    capabilities: list[Literal["fan_boost", "reset_dry_run"]] = Field(default_factory=list, max_length=2)

    @field_validator("capabilities")
    @classmethod
    def unique_capabilities(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("capabilities_must_be_unique")
        return value


class OpenBmcConnectorConfigDeviceDto(StrictDto):
    deviceId: str
    externalRef: str
    deviceType: str
    status: str
    capabilities: list[str]


class OpenBmcConnectorConfigDto(StrictDto):
    schemaVersion: Literal["openbmc-connector-config.v1"] = "openbmc-connector-config.v1"
    connectorId: str
    organizationId: str
    siteId: str
    pollIntervalSeconds: int
    commandClaimIntervalSeconds: int
    devices: list[OpenBmcConnectorConfigDeviceDto]


class OpenBmcHeartbeatRequestDto(StrictDto):
    version: str = Field(min_length=1, max_length=80)
    lastErrorCode: str | None = Field(default=None, max_length=120)


class OpenBmcHeartbeatResponseDto(StrictDto):
    connectorId: str
    status: str
    receivedAt: datetime


class OpenBmcFanDto(StrictDto):
    present: bool
    rpm: int | None = Field(default=None, ge=0, le=500_000)
    pwm: int | None = Field(default=None, ge=0, le=255)
    coolingState: int | None = Field(default=None, ge=0, le=10_000)
    coolingMaxState: int | None = Field(default=None, ge=0, le=10_000)
    manualBoostSupported: bool = False


class OpenBmcThresholdsDto(StrictDto):
    warningC: float | None = Field(default=None, ge=-40, le=150)
    criticalC: float | None = Field(default=None, ge=-40, le=150)


class OpenBmcObservationRequestDto(StrictDto):
    schemaVersion: Literal["openbmc-observation.v1"]
    deviceId: str = Field(min_length=1, max_length=64)
    sourceObservationId: str = Field(min_length=1, max_length=180)
    observedAt: datetime
    collectorReceivedAt: datetime
    collectorStale: bool
    temperatureC: float | None = Field(default=None, ge=-40, le=150)
    status: Literal["normal", "warning", "critical", "unknown"]
    health: Literal["ok", "warning", "critical", "unknown"]
    fan: OpenBmcFanDto
    thresholds: OpenBmcThresholdsDto

    @field_validator("observedAt", "collectorReceivedAt")
    @classmethod
    def timezone_required(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timezone_required")
        return value


class OpenBmcObservationIngestResponseDto(StrictDto):
    observationId: str
    deviceId: str
    duplicate: bool
    ingestedAt: datetime


class OpenBmcEventItemDto(StrictDto):
    sourceEventKey: str = Field(min_length=1, max_length=180)
    occurredAt: datetime
    severity: Literal["info", "warning", "critical"]
    source: str = Field(min_length=1, max_length=80)
    code: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=500)
    details: dict = Field(default_factory=dict)

    @field_validator("occurredAt")
    @classmethod
    def timezone_required(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timezone_required")
        return value

    @field_validator("message")
    @classmethod
    def reject_control_characters(cls, value: str) -> str:
        if any(ord(character) < 32 and character not in {"\t", "\n", "\r"} for character in value):
            raise ValueError("message_contains_control_characters")
        return value


class OpenBmcEventBatchRequestDto(StrictDto):
    schemaVersion: Literal["openbmc-events.v1"]
    deviceId: str = Field(min_length=1, max_length=64)
    events: list[OpenBmcEventItemDto] = Field(min_length=1, max_length=50)


class OpenBmcEventBatchResponseDto(StrictDto):
    accepted: int
    duplicates: int
    receivedAt: datetime


class OpenBmcCommandSpecDto(StrictDto):
    type: Literal["fan_boost", "reset_dry_run"]
    arguments: dict = Field(default_factory=dict)


class OpenBmcCommandProposalRequestDto(StrictDto):
    command: OpenBmcCommandSpecDto
    reason: str = Field(min_length=3, max_length=240)
    idempotencyKey: str | None = Field(default=None, min_length=8, max_length=120)


class OpenBmcCommandProposalResponseDto(StrictDto):
    commandId: str
    status: str
    proposalHash: str
    confirmationExpiresAt: datetime
    summary: str


class OpenBmcCommandConfirmRequestDto(StrictDto):
    expectedProposalHash: str = Field(pattern=r"^[a-f0-9]{64}$")


class OpenBmcCommandProgressRequestDto(StrictDto):
    leaseId: str = Field(min_length=32, max_length=160)
    status: Literal["accepted_by_collector", "delivered_to_agent"]
    localCommandId: str | None = Field(default=None, max_length=120)


class OpenBmcCommandResultRequestDto(StrictDto):
    leaseId: str = Field(min_length=32, max_length=160)
    status: Literal["succeeded", "failed"]
    finishedAt: datetime
    localCommandId: str | None = Field(default=None, max_length=120)
    failureCode: str | None = Field(default=None, max_length=120)
    result: dict = Field(default_factory=dict)

    @field_validator("finishedAt")
    @classmethod
    def timezone_required(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timezone_required")
        return value


class OpenBmcCommandClaimDto(StrictDto):
    commandId: str
    leaseId: str
    leaseExpiresAt: datetime
    deviceId: str
    command: OpenBmcCommandSpecDto
    idempotencyKey: str


class OpenBmcCommandClaimResponseDto(StrictDto):
    command: OpenBmcCommandClaimDto | None
