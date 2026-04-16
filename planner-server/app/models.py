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


class UserAccount(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    email: str = Field(index=True, unique=True)
    display_name: str
    password_hash: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class WebRefreshToken(SQLModel, table=True):
    id: str = Field(primary_key=True)
    user_id: str = Field(foreign_key="useraccount.id", index=True)
    issued_at: datetime = Field(default_factory=utc_now)
    expires_at: datetime
    revoked_at: datetime | None = None


class Organization(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    name: str = Field(index=True)
    slug: str = Field(index=True, unique=True)
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class OrganizationMembership(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    user_id: str = Field(foreign_key="useraccount.id", index=True)
    organization_id: str | None = Field(default=None, foreign_key="organization.id", index=True)
    role: str = Field(index=True)
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Invite(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    email: str = Field(index=True)
    role: str = Field(index=True)
    token_hash: str = Field(index=True, unique=True)
    invited_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    expires_at: datetime
    created_at: datetime = Field(default_factory=utc_now)
    accepted_at: datetime | None = None
    revoked_at: datetime | None = None


class Site(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    name: str = Field(index=True)
    external_ref: str | None = None
    address: str
    lat: float
    lng: float
    notes: str = ""
    created_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    updated_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class InspectionRoute(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str = Field(foreign_key="site.id", index=True)
    name: str = Field(index=True)
    description: str = ""
    waypoints_json: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    planning_parameters_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    updated_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class InspectionTemplate(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str = Field(foreign_key="site.id", index=True)
    route_id: str | None = Field(default=None, foreign_key="inspectionroute.id", index=True)
    name: str = Field(index=True)
    description: str = ""
    inspection_profile_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    alert_rules_json: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    created_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    updated_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class InspectionSchedule(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str = Field(foreign_key="site.id", index=True)
    route_id: str | None = Field(default=None, foreign_key="inspectionroute.id", index=True)
    template_id: str | None = Field(default=None, foreign_key="inspectiontemplate.id", index=True)
    planned_at: datetime | None = None
    recurrence: str | None = None
    status: str = Field(default="scheduled", index=True)
    alert_rules_json: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    created_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    updated_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Mission(SQLModel, table=True):
    id: str = Field(primary_key=True)
    organization_id: str | None = Field(default=None, foreign_key="organization.id", index=True)
    site_id: str | None = Field(default=None, foreign_key="site.id", index=True)
    requested_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id", index=True)
    mission_name: str
    status: str = Field(default="ready", index=True)
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
    organization_id: str | None = Field(default=None, foreign_key="organization.id", index=True)
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
    organization_id: str | None = Field(default=None, foreign_key="organization.id", index=True)
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


class BillingInvoice(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    invoice_number: str = Field(index=True, unique=True)
    currency: str
    subtotal: int
    tax: int
    total: int
    due_date: datetime
    status: str = Field(default="draft", index=True)
    payment_instructions: str = ""
    attachment_refs: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    notes: str = ""
    payment_note: str = ""
    receipt_ref: str = ""
    void_reason: str = ""
    created_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    updated_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class DispatchRecord(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    mission_id: str = Field(foreign_key="mission.id", index=True)
    route_id: str | None = Field(default=None, foreign_key="inspectionroute.id", index=True)
    template_id: str | None = Field(default=None, foreign_key="inspectiontemplate.id", index=True)
    schedule_id: str | None = Field(default=None, foreign_key="inspectionschedule.id", index=True)
    dispatched_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id", index=True)
    assignee: str | None = None
    execution_target: str | None = None
    status: str = Field(default="queued", index=True)
    note: str | None = None
    dispatched_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class AuditEvent(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str | None = Field(default=None, foreign_key="organization.id", index=True)
    actor_user_id: str | None = Field(default=None, foreign_key="useraccount.id", index=True)
    actor_operator_id: str | None = Field(default=None, foreign_key="operatoraccount.id", index=True)
    action: str = Field(index=True)
    target_type: str | None = Field(default=None, index=True)
    target_id: str | None = Field(default=None, index=True)
    metadata_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utc_now)
