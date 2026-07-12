from __future__ import annotations

import base64
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from io import BytesIO
import json
from typing import Any, Protocol
from urllib.request import Request, urlopen

from PIL import Image
from sqlmodel import Session, select

from app.incident_dto import CreateIncidentRequestDto, IncidentEvidenceInputDto, IncidentLocationDto
from app.incidents import create_incident
from app.models import (
    CameraDevice,
    CameraFrame,
    EquipmentStateObservation,
    EquipmentWatchZone,
    IncidentRecord,
    utc_now,
)
from app.storage import ArtifactStorage


DUPLICATE_FRAME_SKIP_WINDOW_SECONDS = 5 * 60


@dataclass(frozen=True)
class EquipmentStateResult:
    state: str
    confidence: float
    reason: str | None = None
    raw_output: dict[str, Any] = field(default_factory=dict)


class EquipmentStateProvider(Protocol):
    def analyze(
        self,
        *,
        frame: CameraFrame,
        zone: EquipmentWatchZone,
        frame_bytes: bytes,
    ) -> EquipmentStateResult: ...


class OllamaEquipmentStateProvider:
    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        timeout_seconds: int,
        auth_token: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.auth_token = auth_token.strip() if auth_token else None

    def analyze(
        self,
        *,
        frame: CameraFrame,
        zone: EquipmentWatchZone,
        frame_bytes: bytes,
    ) -> EquipmentStateResult:
        response = _post_ollama_generate(
            self.base_url,
            {
                "model": self.model,
                "prompt": _equipment_state_prompt(zone),
                "images": [base64.b64encode(frame_bytes).decode("ascii")],
                "format": "json",
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout_seconds=self.timeout_seconds,
            auth_token=self.auth_token,
        )
        payload = _parse_provider_json_response(response)
        return EquipmentStateResult(
            state=_clean_state(payload.get("state")),
            confidence=_clean_confidence(payload.get("confidence")),
            reason=_clean_reason(payload.get("reason")),
            raw_output={"provider": "ollama", "model": self.model, "response": payload},
        )


class NoopEquipmentStateProvider:
    def analyze(
        self,
        *,
        frame: CameraFrame,
        zone: EquipmentWatchZone,
        frame_bytes: bytes,
    ) -> EquipmentStateResult:
        return EquipmentStateResult(
            state="unknown",
            confidence=0.0,
            reason="Noop provider is configured for deployment smoke testing.",
            raw_output={"provider": "noop"},
        )


def build_equipment_state_provider(settings) -> EquipmentStateProvider | None:
    provider = getattr(settings, "camera_analysis_provider", "disabled").strip().lower()
    if provider in {"", "disabled", "none", "off"}:
        return None
    if provider == "noop":
        return NoopEquipmentStateProvider()
    if provider == "ollama":
        return OllamaEquipmentStateProvider(
            base_url=settings.camera_analysis_ollama_base_url,
            model=settings.camera_analysis_ollama_model,
            timeout_seconds=settings.camera_analysis_timeout_seconds,
            auth_token=getattr(settings, "camera_analysis_ollama_auth_token", None),
        )
    raise ValueError(f"unsupported_camera_analysis_provider:{provider}")


def process_next_queued_camera_frame(
    *,
    session: Session,
    storage: ArtifactStorage,
    settings,
    provider: EquipmentStateProvider | None = None,
) -> str | None:
    frame = session.exec(
        select(CameraFrame)
        .where(CameraFrame.upload_status == "uploaded", CameraFrame.analysis_status == "queued")
        .order_by(CameraFrame.captured_at.asc())
    ).first()
    if frame is None:
        return None
    analyze_camera_frame(session=session, storage=storage, settings=settings, frame=frame, provider=provider)
    return frame.id


def analyze_camera_frame(
    *,
    session: Session,
    storage: ArtifactStorage,
    settings,
    frame: CameraFrame,
    provider: EquipmentStateProvider | None = None,
) -> list[EquipmentStateObservation]:
    camera = session.get(CameraDevice, frame.camera_id)
    if camera is None:
        frame.analysis_status = "failed"
        frame.error_message = "camera_not_found"
        frame.updated_at = utc_now()
        session.add(frame)
        session.commit()
        return []

    if provider is None:
        frame.analysis_status = "failed"
        frame.error_message = "analysis_provider_not_configured"
        frame.updated_at = utc_now()
        session.add(frame)
        session.commit()
        return []

    frame_bytes = storage.read(frame.storage_key)
    if frame_bytes is None:
        frame.analysis_status = "failed"
        frame.error_message = "frame_object_missing"
        frame.updated_at = utc_now()
        session.add(frame)
        session.commit()
        return []

    zones = list(
        session.exec(
            select(EquipmentWatchZone).where(
                EquipmentWatchZone.camera_id == camera.id,
                EquipmentWatchZone.is_active == True,  # noqa: E712
            )
        ).all()
    )
    if not zones:
        frame.analysis_status = "skipped"
        frame.error_message = "no_active_watch_zones"
        frame.updated_at = utc_now()
        session.add(frame)
        session.commit()
        return []

    if _should_skip_duplicate_frame(session, frame):
        frame.analysis_status = "skipped"
        frame.error_message = "duplicate_frame_within_heartbeat_window"
        frame.updated_at = utc_now()
        session.add(frame)
        session.commit()
        return []

    observations: list[EquipmentStateObservation] = []
    failures = 0
    for zone in zones:
        try:
            zone_frame_bytes = _analysis_frame_bytes_for_zone(frame_bytes, zone, provider)
            result = provider.analyze(frame=frame, zone=zone, frame_bytes=zone_frame_bytes)
        except Exception as exc:
            failures += 1
            observation = EquipmentStateObservation(
                camera_id=camera.id,
                frame_id=frame.id,
                watch_zone_id=zone.id,
                organization_id=camera.organization_id,
                site_id=camera.site_id,
                state="unknown",
                confidence=0.0,
                status="failed",
                reason=str(exc),
                model_output_json={},
            )
            session.add(observation)
            observations.append(observation)
            continue

        incident = _maybe_create_incident(session, settings, camera, frame, zone, result)
        observation = EquipmentStateObservation(
            camera_id=camera.id,
            frame_id=frame.id,
            watch_zone_id=zone.id,
            organization_id=camera.organization_id,
            site_id=camera.site_id,
            state=result.state,
            confidence=result.confidence,
            status="incident_created" if incident is not None else "recorded",
            reason=result.reason,
            model_output_json=result.raw_output,
            incident_id=incident.id if incident is not None else None,
        )
        session.add(observation)
        observations.append(observation)

    frame.analysis_status = "failed" if failures == len(zones) else "succeeded"
    frame.error_message = "all_watch_zone_analysis_failed" if failures == len(zones) else None
    frame.updated_at = utc_now()
    session.add(frame)
    session.commit()
    return observations


def _maybe_create_incident(
    session: Session,
    settings,
    camera: CameraDevice,
    frame: CameraFrame,
    zone: EquipmentWatchZone,
    result: EquipmentStateResult,
) -> IncidentRecord | None:
    if result.confidence < zone.min_confidence:
        return None
    alert_states = {state.strip().lower() for state in zone.alert_on_states_json}
    if result.state.strip().lower() not in alert_states:
        return None
    evidence_text = (
        f"Camera frame {frame.id} from camera {camera.id} observed equipment "
        f"{zone.equipment_name} state={result.state} confidence={result.confidence:.2f}. "
        f"Storage key: {frame.storage_key}."
    )
    return create_incident(
        session,
        settings,
        CreateIncidentRequestDto(
            organizationId=camera.organization_id,
            siteId=camera.site_id,
            title=f"{zone.equipment_name} state: {result.state}",
            description=result.reason or f"Camera analysis detected {result.state} for {zone.equipment_name}.",
            severity=zone.severity,
            source="camera",
            location=IncidentLocationDto(
                siteId=camera.site_id,
                equipmentName=zone.equipment_name,
                cameraId=camera.id,
                description=zone.name,
            ),
            evidence=[IncidentEvidenceInputDto(type="text", text=evidence_text)],
            reporterName="camera-analysis",
            aiSummary=result.reason,
            aiConfidence=result.confidence,
        ),
        actor_user_id=None,
        actor_name="camera-analysis",
    )


def _analysis_frame_bytes_for_zone(
    frame_bytes: bytes,
    zone: EquipmentWatchZone,
    provider: EquipmentStateProvider,
) -> bytes:
    if isinstance(provider, NoopEquipmentStateProvider):
        return frame_bytes
    return _crop_frame_for_zone(frame_bytes, zone)


def _should_skip_duplicate_frame(session: Session, frame: CameraFrame) -> bool:
    if not frame.checksum_sha256:
        return False
    previous = session.exec(
        select(CameraFrame)
        .where(
            CameraFrame.camera_id == frame.camera_id,
            CameraFrame.id != frame.id,
            CameraFrame.upload_status == "uploaded",
            CameraFrame.checksum_sha256 == frame.checksum_sha256,
        )
        .order_by(CameraFrame.captured_at.desc())
    ).first()
    if previous is None:
        return False
    return _as_utc(frame.captured_at) - _as_utc(previous.captured_at) < timedelta(
        seconds=DUPLICATE_FRAME_SKIP_WINDOW_SECONDS
    )


def _crop_frame_for_zone(frame_bytes: bytes, zone: EquipmentWatchZone) -> bytes:
    with Image.open(BytesIO(frame_bytes), formats=("JPEG", "PNG")) as image:
        rgb_image = image.convert("RGB")
        box = _roi_crop_box(zone.roi_json, rgb_image.width, rgb_image.height)
        cropped = rgb_image.crop(box)
        output = BytesIO()
        cropped.save(output, format="JPEG", quality=90)
        return output.getvalue()


def _roi_crop_box(roi: dict[str, Any], image_width: int, image_height: int) -> tuple[int, int, int, int]:
    if roi.get("type") != "box":
        raise ValueError("unsupported_watch_zone_roi")
    x = _roi_number(roi, "x")
    y = _roi_number(roi, "y")
    width = _roi_number(roi, "w")
    height = _roi_number(roi, "h")
    if x < 0 or y < 0 or width <= 0 or height <= 0:
        raise ValueError("invalid_watch_zone_roi")

    if max(x, y, width, height) <= 1:
        left = round(x * image_width)
        top = round(y * image_height)
        right = round((x + width) * image_width)
        bottom = round((y + height) * image_height)
    else:
        left = round(x)
        top = round(y)
        right = round(x + width)
        bottom = round(y + height)

    left = max(0, min(left, image_width))
    top = max(0, min(top, image_height))
    right = max(0, min(right, image_width))
    bottom = max(0, min(bottom, image_height))
    if right <= left or bottom <= top:
        raise ValueError("empty_watch_zone_roi")
    return (left, top, right, bottom)


def _roi_number(roi: dict[str, Any], key: str) -> float:
    value = roi.get(key)
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ValueError("invalid_watch_zone_roi")
    return float(value)


def _equipment_state_prompt(zone: EquipmentWatchZone) -> str:
    alert_states = ", ".join(zone.alert_on_states_json) or "none"
    return (
        "Analyze only this cropped equipment ROI image. Return JSON only with keys "
        '"state", "confidence", and "reason". '
        f'Equipment name: "{zone.equipment_name}". '
        f'Expected state: "{zone.expected_state}". '
        f'Alert states: "{alert_states}". '
        "Use one concise state label. If the image is unclear, use state \"unknown\" "
        "and confidence below 0.5."
    )


def _post_ollama_generate(
    base_url: str,
    payload: dict[str, Any],
    *,
    timeout_seconds: int,
    auth_token: str | None = None,
) -> dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    request = Request(
        f"{base_url.rstrip('/')}/api/generate",
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        method="POST",
        headers=headers,
    )
    with urlopen(request, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def _parse_provider_json_response(response: dict[str, Any]) -> dict[str, Any]:
    raw = response.get("response")
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        raise ValueError("camera_analysis_provider_response_missing")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("camera_analysis_provider_response_not_json") from exc
    if not isinstance(parsed, dict):
        raise ValueError("camera_analysis_provider_response_not_object")
    return parsed


def _clean_state(value: Any) -> str:
    if not isinstance(value, str):
        return "unknown"
    state = value.strip()
    return state[:80] or "unknown"


def _clean_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, confidence))


def _clean_reason(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    reason = value.strip()
    return reason[:500] or None


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
