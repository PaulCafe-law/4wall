from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class OperatorAccount(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    username: str = Field(index=True, unique=True)
    display_name: str
    password_hash: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class RefreshToken(SQLModel, table=True):
    id: str = Field(primary_key=True)
    operator_id: str = Field(foreign_key="operatoraccount.id", index=True)
    issued_at: datetime = Field(default_factory=utc_now)
    expires_at: datetime
    revoked_at: datetime | None = None


class Mission(SQLModel, table=True):
    id: str = Field(primary_key=True)
    mission_name: str
    routing_mode: str
    bundle_version: str
    demo_mode: bool = True
    planned_by_operator_id: str | None = Field(default=None, foreign_key="operatoraccount.id")
    created_at: datetime = Field(default_factory=utc_now)
    request_json: dict = Field(sa_column=Column(JSON, nullable=False))
    response_json: dict = Field(sa_column=Column(JSON, nullable=False))


class MissionArtifact(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    mission_id: str = Field(foreign_key="mission.id", index=True)
    artifact_name: str = Field(index=True)
    version: int
    checksum_sha256: str
    content_type: str
    storage_key: str
    cache_control: str
    size_bytes: int
    created_at: datetime = Field(default_factory=utc_now)


class Flight(SQLModel, table=True):
    id: str = Field(primary_key=True)
    mission_id: str = Field(foreign_key="mission.id", index=True)
    operator_id: str | None = Field(default=None, foreign_key="operatoraccount.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    last_event_at: datetime | None = None
    last_telemetry_at: datetime | None = None


class FlightEvent(SQLModel, table=True):
    id: str = Field(primary_key=True)
    flight_id: str = Field(foreign_key="flight.id", index=True)
    mission_id: str = Field(foreign_key="mission.id", index=True)
    event_type: str
    event_timestamp: datetime
    payload_json: dict = Field(sa_column=Column(JSON, nullable=False))
    recorded_at: datetime = Field(default_factory=utc_now)


class TelemetryBatch(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    flight_id: str = Field(foreign_key="flight.id", index=True)
    mission_id: str = Field(foreign_key="mission.id", index=True)
    sample_count: int
    first_timestamp: datetime
    last_timestamp: datetime
    payload_json: list[dict] = Field(sa_column=Column(JSON, nullable=False))
    recorded_at: datetime = Field(default_factory=utc_now)
