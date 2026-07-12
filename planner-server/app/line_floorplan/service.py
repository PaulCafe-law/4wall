from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Protocol
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from app.models import (
    CameraDevice,
    CameraFrame,
    CameraGaugeReading,
    CameraOcrObservation,
    CameraPersonObservation,
    IncidentRecord,
    LineGroupBinding,
    Site,
)
from app.storage import ArtifactStorage

from .layout import FloorplanLayout, MachineLayout, Point


TAIPEI_TZ = ZoneInfo("Asia/Taipei")
CAMERA_HEARTBEAT_FRESH_SECONDS = 90
GAUGE_FRESH_SECONDS = 15 * 60
HMI_FRESH_SECONDS = 3 * 60
PERSON_FRESH_SECONDS = 60
HMI_MIN_CONFIDENCE = 0.55
HMI_STRUCTURED_SUFFICIENT_FIELD_COUNT = 4
MACHINE_STATUS_RED = "red"
MACHINE_STATUS_YELLOW = "yellow"
MACHINE_STATUS_GREEN = "green"
MACHINE_STATUS_GRAY = "gray"
UNRESOLVED_INCIDENT_STATUSES = {"pending_review", "confirmed", "in_progress"}


class FloorplanBindingScope(Protocol):
    organization_id: str
    site_id: str
    site_slug: str


@dataclass(frozen=True)
class GaugeReadingView:
    gauge_id: str
    label: str
    value: float | None
    unit: str
    confidence: float
    status: str
    captured_at: datetime | None
    minutes_ago: int | None
    trend: str
    stale: bool


@dataclass(frozen=True)
class HmiFieldView:
    label: str
    value: str
    confidence: float


@dataclass(frozen=True)
class HmiSectionView:
    label: str
    fields: tuple[HmiFieldView, ...]


@dataclass(frozen=True)
class HmiScreenView:
    machine_label: str
    mode_label: str
    sections: tuple[HmiSectionView, ...]
    raw_lines: tuple[str, ...]
    captured_at: datetime


@dataclass(frozen=True)
class MachineDetailView:
    machine: MachineLayout
    site: Site
    gauges: tuple[GaugeReadingView, ...]
    today_incident_count: int
    thumbnail_url: str | None
    thumbnail_ttl_seconds: int
    hmi_screen: HmiScreenView | None


@dataclass(frozen=True)
class FloorplanSnapshot:
    machine_statuses: dict[str, str]
    camera_statuses: dict[str, str]
    rendered_at_taipei: datetime


def get_active_group_binding(session: Session, *, group_id: str) -> LineGroupBinding | None:
    return session.exec(
        select(LineGroupBinding).where(
            LineGroupBinding.group_id == group_id,
            LineGroupBinding.source_type == "group",
            LineGroupBinding.is_active == True,  # noqa: E712
        )
    ).first()


def get_site_for_binding(session: Session, layout: FloorplanLayout, binding: FloorplanBindingScope) -> Site | None:
    if binding.site_slug != layout.site_slug or binding.site_id != layout.site_id:
        return None
    site = session.get(Site, binding.site_id)
    if site is None or site.organization_id != binding.organization_id:
        return None
    return site


def get_floorplan_snapshot(
    session: Session,
    *,
    layout: FloorplanLayout,
    binding: FloorplanBindingScope,
    now: datetime | None = None,
) -> FloorplanSnapshot:
    now_utc = _as_utc(now or datetime.now(timezone.utc))
    cameras = _site_cameras(session, binding)
    today_incidents = _today_incidents(session, binding, now_utc)
    machine_statuses = {
        machine.id: _machine_status(session, binding, machine, today_incidents, now_utc)
        for machine in layout.machines
    }
    camera_statuses = {
        camera.name_contains: _camera_status(_matching_cameras(cameras, camera.name_contains), now_utc)
        for camera in layout.cameras
    }
    return FloorplanSnapshot(
        machine_statuses=machine_statuses,
        camera_statuses=camera_statuses,
        rendered_at_taipei=now_utc.astimezone(TAIPEI_TZ),
    )


def build_machine_detail_view(
    session: Session,
    storage: ArtifactStorage,
    *,
    layout: FloorplanLayout,
    binding: FloorplanBindingScope,
    machine: MachineLayout,
    now: datetime | None = None,
    include_legacy_gauges: bool = True,
) -> MachineDetailView | None:
    site = get_site_for_binding(session, layout, binding)
    if site is None:
        return None
    now_utc = _as_utc(now or datetime.now(timezone.utc))
    gauges = (
        tuple(_gauge_view(session, binding, machine, gauge_id, now_utc) for gauge_id in machine.gauge_ids)
        if include_legacy_gauges
        else ()
    )
    today_incident_count = sum(
        1
        for incident in _today_incidents(session, binding, now_utc)
        if _incident_matches_machine(incident, machine)
    )
    thumbnail_url = _latest_machine_thumbnail_url(session, storage, binding, machine, ttl_seconds=600)
    return MachineDetailView(
        machine=machine,
        site=site,
        gauges=gauges,
        today_incident_count=today_incident_count,
        thumbnail_url=thumbnail_url,
        thumbnail_ttl_seconds=600,
        hmi_screen=build_hmi_screen_view(
            session,
            layout=layout,
            binding=binding,
            machine=machine,
            now=now_utc,
        ),
    )


def build_hmi_screen_view(
    session: Session,
    *,
    layout: FloorplanLayout,
    binding: FloorplanBindingScope,
    machine: MachineLayout,
    now: datetime | None = None,
) -> HmiScreenView | None:
    """Return only fresh, aligned, current-frame HMI evidence for one scoped machine."""

    if get_site_for_binding(session, layout, binding) is None:
        return None
    camera_ids = _camera_ids_for_matches(session, binding, machine.camera_matches)
    if not camera_ids:
        return None
    observation = session.exec(
        select(CameraOcrObservation)
        .where(
            CameraOcrObservation.organization_id == binding.organization_id,
            CameraOcrObservation.site_id == binding.site_id,
            CameraOcrObservation.camera_id.in_(camera_ids),
        )
        .order_by(CameraOcrObservation.created_at.desc())
    ).first()
    if observation is None:
        return None
    if observation.source != "live" or not observation.frame_id:
        return None
    now_utc = _as_utc(now or datetime.now(timezone.utc))
    created_at = _as_utc(observation.created_at)
    captured_at = _as_utc(observation.captured_at)
    if not _received_and_captured_are_fresh(
        now_utc,
        created_at=created_at,
        captured_at=captured_at,
        max_age_seconds=HMI_FRESH_SECONDS,
    ):
        return None
    if not observation.frame_id:
        return None
    frame = session.get(CameraFrame, observation.frame_id)
    if (
        frame is None
        or frame.camera_id != observation.camera_id
        or frame.organization_id != binding.organization_id
        or frame.site_id != binding.site_id
        or frame.upload_status != "uploaded"
        or abs((_as_utc(frame.captured_at) - captured_at).total_seconds()) > 1
    ):
        return None

    structured = observation.structured_fields_json or {}
    if not _hmi_capture_is_valid(structured, frame=frame):
        return None
    visibility = structured.get("screenVisibility") or {}
    if not isinstance(visibility, dict) or visibility.get("status") != "lit":
        return None

    sections = _hmi_sections(observation.mode, structured)
    structured_field_count = sum(len(section.fields) for section in sections)
    raw_lines = (
        _reliable_hmi_raw_lines(observation.raw_ocr_lines_json)
        if structured_field_count < HMI_STRUCTURED_SUFFICIENT_FIELD_COUNT
        else ()
    )
    if not sections and not raw_lines:
        return None
    screen = structured.get("screen")
    mode = str((screen.get("kind") if isinstance(screen, dict) else None) or observation.mode)
    return HmiScreenView(
        machine_label=machine.label,
        mode_label={
            "temperature_monitor": "溫度監視",
            "machine_monitor": "機器監視",
        }.get(mode, "螢幕資訊"),
        sections=sections,
        raw_lines=raw_lines,
        captured_at=captured_at,
    )


def latest_machine_people_count(
    session: Session,
    *,
    layout: FloorplanLayout,
    binding: FloorplanBindingScope,
    machine: MachineLayout,
    now: datetime | None = None,
) -> int | None:
    """Return the latest anonymous count, never detections, identity, or coordinates."""

    if get_site_for_binding(session, layout, binding) is None:
        return None
    camera_ids = _camera_ids_for_matches(session, binding, machine.person_camera_matches)
    if not camera_ids:
        return None
    observation = session.exec(
        select(CameraPersonObservation)
        .where(
            CameraPersonObservation.organization_id == binding.organization_id,
            CameraPersonObservation.site_id == binding.site_id,
            CameraPersonObservation.camera_id.in_(camera_ids),
        )
        .order_by(CameraPersonObservation.created_at.desc())
    ).first()
    if observation is None:
        return None
    if observation.source != "live" or not observation.frame_id:
        return None
    frame = session.get(CameraFrame, observation.frame_id)
    if (
        frame is None
        or frame.camera_id != observation.camera_id
        or frame.organization_id != binding.organization_id
        or frame.site_id != binding.site_id
        or frame.upload_status != "uploaded"
        or abs((_as_utc(frame.captured_at) - _as_utc(observation.captured_at)).total_seconds()) > 1
        or (frame.width is not None and frame.width != observation.image_width)
        or (frame.height is not None and frame.height != observation.image_height)
    ):
        return None
    if not _received_and_captured_are_fresh(
        _as_utc(now or datetime.now(timezone.utc)),
        created_at=_as_utc(observation.created_at),
        captured_at=_as_utc(observation.captured_at),
        max_age_seconds=PERSON_FRESH_SECONDS,
    ):
        return None
    return max(0, int(observation.person_count))


def camera_ids_for_matches(
    session: Session,
    *,
    binding: FloorplanBindingScope,
    matches: tuple[str, ...],
) -> tuple[str, ...]:
    """Resolve layout camera-name matchers inside the already-scoped site."""

    return tuple(_camera_ids_for_matches(session, binding, matches))


def build_site_gauge_views(
    session: Session,
    *,
    layout: FloorplanLayout,
    binding: FloorplanBindingScope,
    now: datetime | None = None,
) -> dict[str, tuple[GaugeReadingView, ...]]:
    now_utc = _as_utc(now or datetime.now(timezone.utc))
    return {
        machine.id: tuple(_gauge_view(session, binding, machine, gauge_id, now_utc) for gauge_id in machine.gauge_ids)
        for machine in layout.machines
        if machine.gauge_ids
    }


def build_floorplan_state_payload(
    session: Session,
    *,
    layout: FloorplanLayout,
    binding: FloorplanBindingScope,
    now: datetime | None = None,
) -> dict[str, Any] | None:
    site = get_site_for_binding(session, layout, binding)
    if site is None:
        return None
    now_utc = _as_utc(now or datetime.now(timezone.utc))
    snapshot = get_floorplan_snapshot(session, layout=layout, binding=binding, now=now_utc)
    incidents = [
        incident
        for incident in _today_incidents(session, binding, now_utc)
        if incident.status in UNRESOLVED_INCIDENT_STATUSES
    ]
    cameras = _site_cameras(session, binding)
    return {
        "siteSlug": layout.site_slug,
        "siteId": layout.site_id,
        "siteName": site.name,
        "serverTime": _iso(snapshot.rendered_at_taipei),
        "timezone": "Asia/Taipei",
        "canvas": {"width": layout.canvas_width, "height": layout.canvas_height},
        "zones": [
            {"id": zone.id, "label": zone.label, "rect": _rect_payload(zone.rect)}
            for zone in layout.zones
        ],
        "machines": [
            {
                "id": machine.id,
                "label": machine.label,
                "rect": _rect_payload(machine.rect),
                "point": _point_payload(machine_center(machine)),
                "status": snapshot.machine_statuses.get(machine.id, MACHINE_STATUS_GRAY),
                "lineEnabled": machine.line_enabled,
                # Analog PRESS/FLOW readings remain available to internal
                # camera pages, but never cross the LINE presentation boundary.
                "gauges": [],
            }
            for machine in layout.machines
        ],
        "cameras": [
            {
                "nameContains": camera.name_contains,
                "label": camera.label,
                "point": _point_payload(camera.point),
                "machineId": camera.machine_id,
                "status": snapshot.camera_statuses.get(camera.name_contains, MACHINE_STATUS_GRAY),
                "matchedCount": len(_matching_cameras(cameras, camera.name_contains)),
                "lastHeartbeatAt": _latest_camera_heartbeat(cameras, camera.name_contains),
            }
            for camera in layout.cameras
        ],
        "incidents": [_incident_payload(incident, layout) for incident in incidents],
    }


def build_machine_detail_payload(detail: MachineDetailView) -> dict[str, Any]:
    return {
        "machineId": detail.machine.id,
        "label": detail.machine.label,
        "siteId": detail.site.id,
        "siteName": detail.site.name,
        "rect": _rect_payload(detail.machine.rect),
        "point": _point_payload(machine_center(detail.machine)),
        "gauges": [_gauge_payload(gauge) for gauge in detail.gauges],
        "todayIncidentCount": detail.today_incident_count,
        "thumbnailUrl": detail.thumbnail_url,
        "thumbnailTtlSeconds": detail.thumbnail_ttl_seconds if detail.thumbnail_url else 0,
        "thumbnailFallbackText": None if detail.thumbnail_url else "暫無可公開縮圖",
        "lineEnabled": detail.machine.line_enabled,
        "hmiScreen": _hmi_payload(detail.hmi_screen),
    }


def today_bounds_taipei(now: datetime | None = None) -> tuple[datetime, datetime, date]:
    current = _as_utc(now or datetime.now(timezone.utc)).astimezone(TAIPEI_TZ)
    day = current.date()
    start = datetime.combine(day, time.min, tzinfo=TAIPEI_TZ).astimezone(timezone.utc)
    end = (datetime.combine(day, time.min, tzinfo=TAIPEI_TZ) + timedelta(days=1)).astimezone(timezone.utc)
    return start, end, day


def machine_center(machine: MachineLayout) -> Point:
    return Point(x=machine.rect.x + machine.rect.width // 2, y=machine.rect.y + machine.rect.height // 2)


def _rect_payload(rect) -> dict[str, int]:
    return {"x": rect.x, "y": rect.y, "width": rect.width, "height": rect.height}


def _point_payload(point: Point) -> dict[str, int]:
    return {"x": point.x, "y": point.y}


def _gauge_payload(gauge: GaugeReadingView) -> dict[str, Any]:
    return {
        "gaugeId": gauge.gauge_id,
        "label": gauge.label,
        "value": gauge.value,
        "unit": gauge.unit,
        "confidence": gauge.confidence,
        "status": gauge.status,
        "capturedAt": _iso(gauge.captured_at),
        "minutesAgo": gauge.minutes_ago,
        "trend": gauge.trend,
        "stale": gauge.stale,
    }


def _hmi_payload(view: HmiScreenView | None) -> dict[str, Any] | None:
    if view is None:
        return None
    return {
        "machineLabel": view.machine_label,
        "modeLabel": view.mode_label,
        "capturedAt": _iso(view.captured_at),
        "sections": [
            {
                "label": section.label,
                "fields": [
                    {"label": field.label, "value": field.value, "confidence": field.confidence}
                    for field in section.fields
                ],
            }
            for section in view.sections
        ],
        "rawLines": list(view.raw_lines),
    }


def _incident_payload(incident: IncidentRecord, layout: FloorplanLayout) -> dict[str, Any]:
    machine = _incident_machine(incident, layout)
    location = incident.location_json or {}
    point = _incident_point(location, machine)
    return {
        "id": incident.id,
        "title": _incident_public_title(machine, location),
        "severity": incident.severity,
        "status": incident.status,
        "createdAt": _iso(incident.created_at),
        "machineId": machine.id if machine else location.get("equipmentId"),
        "machineLabel": machine.label if machine else location.get("equipmentName"),
        "point": _point_payload(point) if point else None,
    }


def _incident_public_title(machine: MachineLayout | None, location: dict[str, Any]) -> str:
    machine_label = machine.label if machine else str(location.get("equipmentName") or "").strip()
    subject = machine_label or "現場"
    return f"{subject} 未結異常"


def _incident_machine(incident: IncidentRecord, layout: FloorplanLayout) -> MachineLayout | None:
    for machine in layout.machines:
        if _incident_matches_machine(incident, machine):
            return machine
    return None


def _incident_point(location: dict[str, Any], machine: MachineLayout | None) -> Point | None:
    try:
        x = location.get("floorplanX")
        y = location.get("floorplanY")
        if x is not None and y is not None:
            return Point(x=int(x), y=int(y))
    except (TypeError, ValueError):
        pass
    return machine_center(machine) if machine is not None else None


def _latest_camera_heartbeat(cameras: list[CameraDevice], needle: str) -> str | None:
    heartbeats = [
        _as_utc(camera.last_heartbeat_at)
        for camera in _matching_cameras(cameras, needle)
        if camera.last_heartbeat_at is not None
    ]
    if not heartbeats:
        return None
    return _iso(max(heartbeats))


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _site_cameras(session: Session, binding: FloorplanBindingScope) -> list[CameraDevice]:
    return list(
        session.exec(
            select(CameraDevice).where(
                CameraDevice.organization_id == binding.organization_id,
                CameraDevice.site_id == binding.site_id,
            )
        ).all()
    )


def _matching_cameras(cameras: list[CameraDevice], needle: str) -> list[CameraDevice]:
    normalized = needle.lower()
    return [camera for camera in cameras if normalized in camera.name.lower()]


def _camera_status(cameras: list[CameraDevice], now_utc: datetime) -> str:
    if not cameras:
        return MACHINE_STATUS_GRAY
    for camera in cameras:
        heartbeat = _as_utc(camera.last_heartbeat_at) if camera.last_heartbeat_at else None
        if (
            camera.status == "active"
            and heartbeat is not None
            and (now_utc - heartbeat).total_seconds() <= CAMERA_HEARTBEAT_FRESH_SECONDS
            and not camera.last_error
        ):
            return MACHINE_STATUS_GREEN
    return MACHINE_STATUS_RED


def _machine_status(
    session: Session,
    binding: FloorplanBindingScope,
    machine: MachineLayout,
    today_incidents: list[IncidentRecord],
    now_utc: datetime,
) -> str:
    if any(_incident_matches_machine(incident, machine) for incident in today_incidents if incident.status in UNRESOLVED_INCIDENT_STATUSES):
        return MACHINE_STATUS_RED
    if not machine.gauge_ids:
        return MACHINE_STATUS_GRAY
    views = [_gauge_view(session, binding, machine, gauge_id, now_utc) for gauge_id in machine.gauge_ids]
    if any(view.status in {"degraded", "failed"} and not view.stale for view in views):
        return MACHINE_STATUS_YELLOW
    if all(view.status == "ok" and not view.stale and view.captured_at is not None for view in views):
        return MACHINE_STATUS_GREEN
    return MACHINE_STATUS_GRAY


def _gauge_view(
    session: Session,
    binding: FloorplanBindingScope,
    machine: MachineLayout,
    gauge_id: str,
    now_utc: datetime,
) -> GaugeReadingView:
    latest = _latest_gauge_reading(session, binding, machine, gauge_id)
    if latest is None:
        return GaugeReadingView(
            gauge_id=gauge_id,
            label=gauge_id,
            value=None,
            unit="",
            confidence=0.0,
            status="missing",
            captured_at=None,
            minutes_ago=None,
            trend="→",
            stale=True,
        )
    captured_at = _as_utc(latest.captured_at)
    previous = _comparison_gauge_reading(session, binding, machine, gauge_id, captured_at - timedelta(hours=1))
    minutes_ago = max(0, round((now_utc - captured_at).total_seconds() / 60))
    stale = (now_utc - captured_at).total_seconds() > GAUGE_FRESH_SECONDS
    return GaugeReadingView(
        gauge_id=gauge_id,
        label=latest.label,
        value=latest.value,
        unit=latest.unit,
        confidence=latest.confidence,
        status=latest.status,
        captured_at=captured_at,
        minutes_ago=minutes_ago,
        trend=_trend(latest, previous),
        stale=stale,
    )


def _latest_gauge_reading(
    session: Session,
    binding: FloorplanBindingScope,
    machine: MachineLayout,
    gauge_id: str,
) -> CameraGaugeReading | None:
    camera_ids = _machine_camera_ids(session, binding, machine)
    statement = (
        select(CameraGaugeReading)
        .where(
            CameraGaugeReading.organization_id == binding.organization_id,
            CameraGaugeReading.site_id == binding.site_id,
            CameraGaugeReading.gauge_id == gauge_id,
        )
        .order_by(CameraGaugeReading.captured_at.desc(), CameraGaugeReading.created_at.desc())
    )
    if camera_ids:
        statement = statement.where(CameraGaugeReading.camera_id.in_(camera_ids))
    return session.exec(statement).first()


def _comparison_gauge_reading(
    session: Session,
    binding: FloorplanBindingScope,
    machine: MachineLayout,
    gauge_id: str,
    target_at: datetime,
) -> CameraGaugeReading | None:
    camera_ids = _machine_camera_ids(session, binding, machine)
    statement = (
        select(CameraGaugeReading)
        .where(
            CameraGaugeReading.organization_id == binding.organization_id,
            CameraGaugeReading.site_id == binding.site_id,
            CameraGaugeReading.gauge_id == gauge_id,
            CameraGaugeReading.captured_at <= target_at,
        )
        .order_by(CameraGaugeReading.captured_at.desc(), CameraGaugeReading.created_at.desc())
    )
    if camera_ids:
        statement = statement.where(CameraGaugeReading.camera_id.in_(camera_ids))
    return session.exec(statement).first()


def _machine_camera_ids(session: Session, binding: FloorplanBindingScope, machine: MachineLayout) -> list[str]:
    return _camera_ids_for_matches(session, binding, machine.camera_matches)


def _camera_ids_for_matches(
    session: Session,
    binding: FloorplanBindingScope,
    matches: tuple[str, ...],
) -> list[str]:
    if not matches:
        return []
    cameras = _site_cameras(session, binding)
    ids: list[str] = []
    for needle in matches:
        ids.extend(camera.id for camera in _matching_cameras(cameras, needle))
    return sorted(set(ids))


def _hmi_capture_is_valid(structured: dict[str, Any], *, frame: CameraFrame) -> bool:
    capture = structured.get("captureRegions") or {}
    if not isinstance(capture, dict) or not str(capture.get("calibrationId") or "").strip():
        return False
    frame_size = capture.get("frameSize")
    hmi = capture.get("hmi") or {}
    if not isinstance(frame_size, list) or len(frame_size) != 2 or not isinstance(hmi, dict):
        return False
    try:
        frame_width, frame_height = (int(value) for value in frame_size)
        x, y, width, height = (int(value) for value in hmi.get("roi") or [])
    except (TypeError, ValueError):
        return False
    return (
        hmi.get("alignmentStatus") == "ok"
        and frame_width > 0
        and frame_height > 0
        and (frame.width is None or frame.width == frame_width)
        and (frame.height is None or frame.height == frame_height)
        and x >= 0
        and y >= 0
        and width > 0
        and height > 0
        and x + width <= frame_width
        and y + height <= frame_height
    )


def _received_and_captured_are_fresh(
    now: datetime,
    *,
    created_at: datetime,
    captured_at: datetime,
    max_age_seconds: int,
) -> bool:
    received_age = (now - created_at).total_seconds()
    captured_age = (now - captured_at).total_seconds()
    return 0 <= received_age <= max_age_seconds and 0 <= captured_age <= max_age_seconds


def _hmi_sections(mode: str, structured: dict[str, Any]) -> tuple[HmiSectionView, ...]:
    screen_value = structured.get("screen")
    screen = screen_value if isinstance(screen_value, dict) else {}
    resolved_mode = str(screen.get("kind") or mode)
    if resolved_mode == "temperature_monitor":
        details_value = screen.get("temperatureCellReadings")
        details = details_value if isinstance(details_value, dict) else {}
        section_labels = {"setpoint": "設定", "current": "現在", "keepWarm": "保溫"}
        slot_labels = {
            "barrel1": "一段",
            "barrel2": "二段",
            "barrel3": "三段",
            "barrel4": "四段",
            "barrel5": "五段",
            "oilTemperature": "油溫",
        }
        sections: list[HmiSectionView] = []
        for section_id, section_label in section_labels.items():
            cells_value = details.get(section_id)
            cells = cells_value if isinstance(cells_value, dict) else {}
            fields = tuple(
                field
                for slot_id in slot_labels
                if (field := _hmi_field_view(cells.get(slot_id), fallback_label=slot_labels[slot_id])) is not None
            )
            if fields:
                sections.append(HmiSectionView(label=section_label, fields=fields))
        return tuple(sections)

    fixed_fields = structured.get("fixedFields") or {}
    if not isinstance(fixed_fields, dict):
        return ()
    allowed_fragments = (
        "operationmode",
        "shotstage",
        "station",
        "pressure",
        "speed",
        "timer",
        "position",
        "mold",
        "screw",
        "ejector",
        "模式",
        "射出",
        "站",
        "壓力",
        "速度",
        "計時",
        "位置",
        "開模",
        "螺桿",
        "頂針",
    )
    fields: list[HmiFieldView] = []
    seen: set[tuple[str, str]] = set()
    for field_id, payload in fixed_fields.items():
        haystack = f"{field_id} {(payload or {}).get('label', '')}".lower() if isinstance(payload, dict) else str(field_id).lower()
        if not any(fragment in haystack for fragment in allowed_fragments):
            continue
        field = _hmi_field_view(payload, fallback_label=str(field_id))
        if field is None or (field.label, field.value) in seen:
            continue
        seen.add((field.label, field.value))
        fields.append(field)
    return (HmiSectionView(label="機器監視", fields=tuple(fields)),) if fields else ()


def _hmi_field_view(payload: Any, *, fallback_label: str) -> HmiFieldView | None:
    if not isinstance(payload, dict) or payload.get("status") != "ok":
        return None
    try:
        confidence = float(payload.get("confidence"))
    except (TypeError, ValueError):
        return None
    value = payload.get("value")
    if confidence < HMI_MIN_CONFIDENCE or value is None or str(value).strip().lower() in {"", "unknown"}:
        return None
    unit = str(payload.get("unit") or "").strip()
    if unit.lower() == "c":
        unit = "°C"
    value_text = f"{value} {unit}".strip()
    return HmiFieldView(
        label=str(payload.get("label") or fallback_label).strip(),
        value=value_text,
        confidence=confidence,
    )


def _reliable_hmi_raw_lines(lines: list[dict]) -> tuple[str, ...]:
    output: list[str] = []
    seen: set[str] = set()
    for line in lines or []:
        if not isinstance(line, dict) or line.get("region") != "hmi":
            continue
        try:
            confidence = float(line.get("confidence"))
        except (TypeError, ValueError):
            continue
        text = str(line.get("text") or "").strip()
        if confidence < HMI_MIN_CONFIDENCE or not text or text in seen:
            continue
        seen.add(text)
        output.append(text)
        if len(output) == 8:
            break
    return tuple(output)


def _latest_machine_thumbnail_url(
    session: Session,
    storage: ArtifactStorage,
    binding: FloorplanBindingScope,
    machine: MachineLayout,
    *,
    ttl_seconds: int,
) -> str | None:
    cameras = _site_cameras(session, binding)
    # Only the machine's explicitly approved detail cameras may supply a hero.
    # Layout overview/person cameras are intentionally excluded.
    matched_ids = sorted(
        {camera.id for needle in machine.camera_matches for camera in _matching_cameras(cameras, needle)}
    )
    if not matched_ids:
        return None
    frame = session.exec(
        select(CameraFrame)
        .where(
            CameraFrame.camera_id.in_(matched_ids),
            CameraFrame.organization_id == binding.organization_id,
            CameraFrame.site_id == binding.site_id,
            CameraFrame.upload_status == "uploaded",
        )
        .order_by(CameraFrame.captured_at.desc(), CameraFrame.created_at.desc())
    ).first()
    if frame is None:
        return None
    return storage.create_presigned_get_url(key=frame.storage_key, expires_in_seconds=min(ttl_seconds, 600))


def _today_incidents(session: Session, binding: FloorplanBindingScope, now_utc: datetime) -> list[IncidentRecord]:
    start, end, _ = today_bounds_taipei(now_utc)
    return list(
        session.exec(
            select(IncidentRecord)
            .where(
                IncidentRecord.organization_id == binding.organization_id,
                IncidentRecord.site_id == binding.site_id,
                IncidentRecord.created_at >= start,
                IncidentRecord.created_at < end,
            )
            .order_by(IncidentRecord.created_at.desc())
        ).all()
    )


def _incident_matches_machine(incident: IncidentRecord, machine: MachineLayout) -> bool:
    location = incident.location_json or {}
    equipment_id = str(location.get("equipmentId") or "")
    equipment_name = str(location.get("equipmentName") or "")
    description = str(location.get("description") or "")
    return (
        equipment_id == machine.id
        or equipment_name == machine.label
        or machine.id in description
        or machine.label in description
    )


def _trend(latest: CameraGaugeReading, previous: CameraGaugeReading | None) -> str:
    if previous is None or latest.value is None or previous.value is None:
        return "→"
    delta = latest.value - previous.value
    if abs(delta) < 0.01:
        return "→"
    return "↗" if delta > 0 else "↘"


def _as_utc(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
