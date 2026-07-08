from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Column, Index
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
    map_config_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    zones_json: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    launch_points_json: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    viewpoints_json: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    notes: str = ""
    created_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    updated_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CameraDevice(SQLModel, table=True):
    __tablename__ = "camera_devices"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str | None = Field(default=None, foreign_key="site.id", index=True)
    name: str = Field(index=True)
    status: str = Field(default="active", index=True)
    device_token_hash: str = Field(index=True, unique=True)
    rtsp_configured: bool = False
    sampling_interval_seconds: int = 10
    retention_days: int = 7
    local_spool_hours: int = 24
    last_heartbeat_at: datetime | None = None
    last_frame_at: datetime | None = None
    last_error: str | None = None
    created_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id", index=True)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)


class CameraFrame(SQLModel, table=True):
    __tablename__ = "camera_frames"

    id: str = Field(primary_key=True)
    camera_id: str = Field(foreign_key="camera_devices.id", index=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str | None = Field(default=None, foreign_key="site.id", index=True)
    captured_at: datetime = Field(index=True)
    storage_key: str = Field(index=True)
    content_type: str
    checksum_sha256: str | None = Field(default=None, index=True)
    size_bytes: int | None = None
    width: int | None = None
    height: int | None = None
    upload_status: str = Field(default="pending", index=True)
    analysis_status: str = Field(default="pending", index=True)
    upload_expires_at: datetime = Field(index=True)
    completed_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)


class CameraGaugeReading(SQLModel, table=True):
    __tablename__ = "camera_gauge_readings"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    camera_id: str = Field(foreign_key="camera_devices.id", index=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str | None = Field(default=None, foreign_key="site.id", index=True)
    frame_id: str | None = Field(default=None, foreign_key="camera_frames.id", index=True)
    gauge_id: str = Field(index=True)
    label: str
    value: float | None = None
    unit: str
    confidence: float
    raw_position: float | None = None
    status: str = Field(default="ok", index=True)
    source: str = Field(default="live", index=True)
    captured_at: datetime = Field(index=True)
    metadata_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, index=True)


class CameraOcrObservation(SQLModel, table=True):
    __tablename__ = "camera_ocr_observations"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    camera_id: str = Field(foreign_key="camera_devices.id", index=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str | None = Field(default=None, foreign_key="site.id", index=True)
    frame_id: str | None = Field(default=None, foreign_key="camera_frames.id", index=True)
    mode: str = Field(index=True)
    mode_confidence: float
    source: str = Field(default="live", index=True)
    captured_at: datetime = Field(index=True)
    raw_ocr_lines_json: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    structured_fields_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    work_order_raw_text: str | None = None
    gpt_summary_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    summary_status: str = Field(default="unknown", index=True)
    summary_error: str | None = None
    created_at: datetime = Field(default_factory=utc_now, index=True)


class CameraPersonObservation(SQLModel, table=True):
    __tablename__ = "camera_person_observations"
    __table_args__ = (Index("ix_camera_person_observations_camera_captured_at", "camera_id", "captured_at"),)

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    camera_id: str = Field(foreign_key="camera_devices.id", index=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str | None = Field(default=None, foreign_key="site.id", index=True)
    frame_id: str | None = Field(default=None, foreign_key="camera_frames.id", index=True)
    source: str = Field(default="live", index=True)
    captured_at: datetime = Field(index=True)
    image_width: int
    image_height: int
    calibration_id: str | None = Field(default=None, index=True)
    detector_name: str | None = Field(default=None, index=True)
    person_count: int = Field(default=0, index=True)
    detections_json: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, index=True)


class EquipmentWatchZone(SQLModel, table=True):
    __tablename__ = "equipment_watch_zones"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    camera_id: str = Field(foreign_key="camera_devices.id", index=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    name: str = Field(index=True)
    equipment_name: str = Field(index=True)
    roi_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    expected_state: str
    alert_on_states_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    min_confidence: float = 0.8
    severity: str = Field(default="medium", index=True)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)


class EquipmentStateObservation(SQLModel, table=True):
    __tablename__ = "equipment_state_observations"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    camera_id: str = Field(foreign_key="camera_devices.id", index=True)
    frame_id: str = Field(foreign_key="camera_frames.id", index=True)
    watch_zone_id: str | None = Field(default=None, foreign_key="equipment_watch_zones.id", index=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str | None = Field(default=None, foreign_key="site.id", index=True)
    state: str = Field(index=True)
    confidence: float
    status: str = Field(default="recorded", index=True)
    reason: str | None = None
    model_output_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    incident_id: str | None = Field(default=None, foreign_key="incidents.id", index=True)
    created_at: datetime = Field(default_factory=utc_now, index=True)


class InspectionRoute(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str = Field(foreign_key="site.id", index=True)
    name: str = Field(index=True)
    description: str = ""
    launch_point_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
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
    next_run_at: datetime | None = None
    last_run_at: datetime | None = None
    last_dispatched_at: datetime | None = None
    pause_reason: str | None = None
    last_outcome: str | None = None
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
    accepted_at: datetime | None = None
    closed_at: datetime | None = None
    updated_at: datetime = Field(default_factory=utc_now)


class InspectionEventRecord(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    mission_id: str = Field(foreign_key="mission.id", index=True)
    site_id: str | None = Field(default=None, foreign_key="site.id", index=True)
    category: str = Field(index=True)
    severity: str = Field(index=True)
    summary: str
    detected_at: datetime = Field(default_factory=utc_now, index=True)
    status: str = Field(default="open", index=True)
    evidence_artifact_names_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    source: str = Field(default="demo_analysis", index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class IncidentRecord(SQLModel, table=True):
    __tablename__ = "incidents"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str | None = Field(default=None, foreign_key="site.id", index=True)
    title: str = Field(index=True)
    description: str = ""
    status: str = Field(default="pending_review", index=True)
    severity: str = Field(default="medium", index=True)
    source: str = Field(default="manual", index=True)
    location_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    assignee_name: str | None = None
    reporter_name: str | None = None
    ai_summary: str | None = None
    ai_confidence: float | None = None
    created_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id", index=True)
    updated_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id", index=True)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)
    resolved_at: datetime | None = None


class IncidentEvidenceRecord(SQLModel, table=True):
    __tablename__ = "incident_evidence"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    incident_id: str = Field(foreign_key="incidents.id", index=True)
    evidence_type: str = Field(index=True)
    url: str | None = None
    text: str | None = None
    created_at: datetime = Field(default_factory=utc_now)


class IncidentCommentRecord(SQLModel, table=True):
    __tablename__ = "incident_comments"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    incident_id: str = Field(foreign_key="incidents.id", index=True)
    author_name: str
    content: str
    created_at: datetime = Field(default_factory=utc_now)


class IncidentHistoryRecord(SQLModel, table=True):
    __tablename__ = "incident_history"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    incident_id: str = Field(foreign_key="incidents.id", index=True)
    action: str = Field(index=True)
    from_value: str | None = None
    to_value: str | None = None
    actor_name: str
    created_at: datetime = Field(default_factory=utc_now, index=True)


class IncidentLineNotificationRecord(SQLModel, table=True):
    __tablename__ = "incident_line_notifications"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    incident_id: str | None = Field(default=None, foreign_key="incidents.id", index=True)
    action: str = Field(index=True)
    target_id: str | None = Field(default=None, index=True)
    message: str
    status: str = Field(default="queued", index=True)
    request_payload_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    response_payload_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    error_message: str | None = None
    created_at: datetime = Field(default_factory=utc_now, index=True)
    sent_at: datetime | None = None


class LineWebhookEventRecord(SQLModel, table=True):
    __tablename__ = "line_webhook_events"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    event_key: str = Field(index=True, unique=True)
    source_type: str | None = None
    source_id: str | None = Field(default=None, index=True)
    event_type: str | None = Field(default=None, index=True)
    payload_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    processed_status: str = Field(default="received", index=True)
    error_message: str | None = None
    created_at: datetime = Field(default_factory=utc_now, index=True)
    processed_at: datetime | None = None


class LineGroupBinding(SQLModel, table=True):
    __tablename__ = "line_group_bindings"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    group_id: str = Field(index=True, unique=True)
    source_type: str = Field(default="group", index=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str = Field(foreign_key="site.id", index=True)
    site_slug: str = Field(index=True)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=utc_now, index=True)


class InspectionReport(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    mission_id: str = Field(foreign_key="mission.id", index=True)
    status: str = Field(default="not_started", index=True)
    generated_at: datetime | None = None
    summary: str | None = None
    event_count: int = 0
    artifact_name: str | None = None
    mode: str = Field(default="normal", index=True)
    created_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    updated_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class IndustrialEngineJob(SQLModel, table=True):
    __tablename__ = "industrial_engine_jobs"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str | None = Field(default=None, foreign_key="site.id", index=True)
    created_by_user_id: str | None = Field(default=None, foreign_key="useraccount.id", index=True)
    mode: str = Field(index=True)
    status: str = Field(default="queued", index=True)
    current_stage: str | None = Field(default=None, index=True)
    failure_reason: str | None = None
    request_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    result_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    exports_json: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)
    started_at: datetime | None = None
    completed_at: datetime | None = None


class IndustrialEngineJobStage(SQLModel, table=True):
    __tablename__ = "industrial_engine_job_stages"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    job_id: str = Field(foreign_key="industrial_engine_jobs.id", index=True)
    sequence: int = Field(index=True)
    name: str = Field(index=True)
    status: str = Field(default="pending", index=True)
    reason: str | None = None
    output_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    started_at: datetime | None = None
    completed_at: datetime | None = None


class IndustrialEngineInputAsset(SQLModel, table=True):
    __tablename__ = "industrial_engine_input_assets"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    job_id: str = Field(foreign_key="industrial_engine_jobs.id", index=True)
    file_name: str
    content_type: str
    storage_key: str
    size_bytes: int
    created_at: datetime = Field(default_factory=utc_now, index=True)


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


class DecisionPointRecord(SQLModel, table=True):
    """Domain-neutral decision ledger row: plan / prediction / actual / attribution.

    The four JSON columns keep the schema portable across domains (factory
    dispatch today; hotel or kitchen dispatch reuse the same shape).
    """

    __tablename__ = "decision_points"
    __table_args__ = (Index("ix_decision_points_org_occurred_at", "organization_id", "occurred_at"),)

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str | None = Field(default=None, foreign_key="site.id", index=True)
    domain: str = Field(default="factory", index=True)
    event_type: str = Field(index=True)  # dispatch | plan_vs_actual | anomaly_response | maintenance
    source: str = Field(default="manual", index=True)  # work_order | incident | line_report | manual
    subject_ref: str = Field(default="", index=True)  # machine no / zone / mold id
    occurred_at: datetime = Field(index=True)
    plan_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    prediction_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    predicted_at: datetime | None = None
    actual_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    actual_recorded_at: datetime | None = None
    consistent: bool | None = Field(default=None, index=True)
    attribution: str = Field(default="none", index=True)
    attribution_note: str | None = None
    attributed_by: str | None = None
    attributed_at: datetime | None = None
    status: str = Field(default="awaiting_actual", index=True)  # awaiting_actual | resolved
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)


class ShiftRosterEntryRecord(SQLModel, table=True):
    __tablename__ = "shift_roster_entries"
    __table_args__ = (Index("ix_shift_roster_org_date", "organization_id", "work_date"),)

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    work_date: str = Field(index=True)  # YYYY-MM-DD
    shift: str = Field(default="day", index=True)  # day | night | full
    person_name: str = Field(index=True)
    zone_name: str | None = Field(default=None, index=True)
    machine_nos_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, index=True)


class SkillMatrixEntryRecord(SQLModel, table=True):
    __tablename__ = "skill_matrix_entries"
    __table_args__ = (Index("ix_skill_matrix_org_person_machine", "organization_id", "person_name", "machine_no", unique=True),)

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    person_name: str = Field(index=True)
    machine_no: str = Field(index=True)
    level: int = Field(default=1)  # 1 = can operate, 2 = proficient, 3 = expert/mentor
    updated_at: datetime = Field(default_factory=utc_now)


class SemanticZoneRecord(SQLModel, table=True):
    __tablename__ = "semantic_zones"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    site_id: str | None = Field(default=None, foreign_key="site.id", index=True)
    name: str = Field(index=True)
    x_min: float
    x_max: float
    z_min: float
    z_max: float
    machine_nos_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)


class MoldMaintenanceRuleRecord(SQLModel, table=True):
    __tablename__ = "mold_maintenance_rules"
    __table_args__ = (Index("ix_mold_rules_org_mold", "organization_id", "mold_no", unique=True),)

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    mold_no: str = Field(index=True)
    threshold_count: int
    current_count: int = Field(default=0)
    counter_source: str = Field(default="manual")  # manual | line_report | gauge:<id> | hmi_field:<id>
    last_reset_at: datetime | None = None
    last_alert_at: datetime | None = None
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)
