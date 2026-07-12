"""Fail-closed LINE dispatch-ticket evidence selection and cropping."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from typing import Any
from zoneinfo import ZoneInfo

from PIL import Image
from sqlmodel import Session, select

from app.models import CameraFrame, CameraOcrObservation


DISPATCH_TICKET_MAX_AGE_SECONDS = 3 * 60
DISPATCH_TICKET_MAX_FUTURE_SKEW_SECONDS = 5 * 60
DISPATCH_TICKET_FOOTNOTE = "⚠️ 數字為自動辨識,以圖為準"
DISPATCH_TICKET_ALIGNMENT_ERROR = "目前無法確認派工單畫面，請檢查攝影機位置並重新校正。"
_OBSERVATION_SCAN_LIMIT = 50
_TAIPEI_TZ = ZoneInfo("Asia/Taipei")


class DispatchTicketCropError(RuntimeError):
    pass


@dataclass(frozen=True)
class WorkOrderCapture:
    observation: CameraOcrObservation
    frame: CameraFrame
    work_order_roi: tuple[int, int, int, int]
    frame_size: tuple[int, int]
    calibration_id: str


def find_latest_work_order_capture(
    session: Session,
    *,
    organization_id: str,
    site_id: str,
    camera_ids: tuple[str, ...] | None = None,
    now: datetime | None = None,
) -> WorkOrderCapture | None:
    """Return only a fresh observation and the exact frame it analyzed.

    The newest observation containing ``workOrder`` is authoritative. If its
    frame link, scope, calibration, alignment, or pixel ROI is invalid, fail
    closed instead of falling back to an older observation or newer frame.
    """

    if camera_ids is not None and not camera_ids:
        return None
    statement = select(CameraOcrObservation).where(
        CameraOcrObservation.organization_id == organization_id,
        CameraOcrObservation.site_id == site_id,
    )
    if camera_ids is not None:
        statement = statement.where(CameraOcrObservation.camera_id.in_(camera_ids))
    observations = session.exec(
        statement
        .order_by(CameraOcrObservation.created_at.desc())
        .limit(_OBSERVATION_SCAN_LIMIT)
    ).all()
    # The newest observation from the expected camera is authoritative. If it
    # omits or invalidates workOrder evidence, fail closed immediately instead
    # of scanning backward to an older sheet.
    observation = observations[0] if observations else None
    return _capture_from_observation(
        session,
        observation,
        organization_id=organization_id,
        site_id=site_id,
        camera_ids=camera_ids,
        now=now,
    )


def find_work_order_capture_for_frame(
    session: Session,
    *,
    organization_id: str,
    site_id: str,
    frame_id: str,
    camera_ids: tuple[str, ...] | None = None,
    now: datetime | None = None,
) -> WorkOrderCapture | None:
    """Validate a URL-addressed crop without making it race the next valid frame.

    The newest scoped observation must still be valid, so a newly detected
    alignment failure immediately disables older cached crops. When the newest
    observation is valid, a different requested frame may still be served while
    its own exact observation remains fresh and valid. This covers the normal
    interval between replying with frame F1 and LINE fetching it after F2 arrives.
    """

    if not frame_id or (camera_ids is not None and not camera_ids):
        return None
    statement = select(CameraOcrObservation).where(
        CameraOcrObservation.organization_id == organization_id,
        CameraOcrObservation.site_id == site_id,
    )
    if camera_ids is not None:
        statement = statement.where(CameraOcrObservation.camera_id.in_(camera_ids))
    latest = session.exec(
        statement.order_by(CameraOcrObservation.created_at.desc()).limit(1)
    ).first()
    latest_capture = _capture_from_observation(
        session,
        latest,
        organization_id=organization_id,
        site_id=site_id,
        camera_ids=camera_ids,
        now=now,
    )
    if latest_capture is None:
        return None
    if latest_capture.frame.id == frame_id:
        return latest_capture

    requested = session.exec(
        statement.where(CameraOcrObservation.frame_id == frame_id)
        .order_by(CameraOcrObservation.created_at.desc())
        .limit(1)
    ).first()
    return _capture_from_observation(
        session,
        requested,
        organization_id=organization_id,
        site_id=site_id,
        camera_ids=camera_ids,
        now=now,
    )


def _capture_from_observation(
    session: Session,
    observation: CameraOcrObservation | None,
    *,
    organization_id: str,
    site_id: str,
    camera_ids: tuple[str, ...] | None,
    now: datetime | None,
) -> WorkOrderCapture | None:
    if (
        observation is None
        or observation.source != "live"
        or observation_is_stale(observation, now=now)
        or not observation.frame_id
    ):
        return None
    evidence = _validated_capture_evidence(observation.structured_fields_json or {})
    if evidence is None:
        return None
    roi, frame_size, calibration_id = evidence

    frame = session.get(CameraFrame, observation.frame_id)
    if (
        frame is None
        or frame.id != observation.frame_id
        or frame.camera_id != observation.camera_id
        or frame.organization_id != organization_id
        or frame.site_id != site_id
        or frame.upload_status != "uploaded"
        or abs((_as_utc(frame.captured_at) - _as_utc(observation.captured_at)).total_seconds()) > 1
        or (camera_ids is not None and observation.camera_id not in camera_ids)
    ):
        return None
    if frame.width is not None and frame.width != frame_size[0]:
        return None
    if frame.height is not None and frame.height != frame_size[1]:
        return None
    return WorkOrderCapture(
        observation=observation,
        frame=frame,
        work_order_roi=roi,
        frame_size=frame_size,
        calibration_id=calibration_id,
    )


def observation_is_stale(
    observation: CameraOcrObservation,
    *,
    now: datetime | None = None,
    max_age_seconds: int = DISPATCH_TICKET_MAX_AGE_SECONDS,
) -> bool:
    current = _as_utc(now or datetime.now(timezone.utc))
    received_age = (current - _as_utc(observation.created_at)).total_seconds()
    captured_age = (current - _as_utc(observation.captured_at)).total_seconds()
    return (
        received_age > max_age_seconds
        or received_age < -DISPATCH_TICKET_MAX_FUTURE_SKEW_SECONDS
        or captured_age > max_age_seconds
        or captured_age < -DISPATCH_TICKET_MAX_FUTURE_SKEW_SECONDS
    )


def frame_is_stale(
    frame: CameraFrame,
    *,
    now: datetime | None = None,
    max_age_seconds: int = DISPATCH_TICKET_MAX_AGE_SECONDS,
) -> bool:
    """Compatibility guard for callers; selection freshness uses the OCR receipt."""

    current = _as_utc(now or datetime.now(timezone.utc))
    age_seconds = (current - _as_utc(frame.captured_at)).total_seconds()
    return age_seconds > max_age_seconds or age_seconds < -DISPATCH_TICKET_MAX_FUTURE_SKEW_SECONDS


def dispatch_ticket_storage_key(frame_id: str) -> str:
    return f"line-dispatch-tickets/{frame_id}.png"


def crop_dispatch_ticket_png(
    image_bytes: bytes,
    *,
    roi: tuple[int, int, int, int],
    frame_size: tuple[int, int],
) -> bytes:
    """Crop the observation's exact pixel ROI from its exact-sized frame."""

    try:
        image = Image.open(BytesIO(image_bytes), formats=("JPEG", "PNG"))
        image.load()
    except Exception as exc:
        raise DispatchTicketCropError("invalid_dispatch_ticket_image") from exc
    if image.size != frame_size:
        raise DispatchTicketCropError("dispatch_ticket_frame_size_mismatch")
    validated = _validated_pixel_roi(roi, frame_size)
    if validated is None:
        raise DispatchTicketCropError("dispatch_ticket_roi_out_of_bounds")
    x, y, width, height = validated
    cropped = image.convert("RGB").crop((x, y, x + width, y + height))
    output = BytesIO()
    cropped.save(output, format="PNG", optimize=True)
    return output.getvalue()


def build_dispatch_ticket_summary(observation: CameraOcrObservation) -> str:
    work_order = (observation.structured_fields_json or {}).get("workOrder") or {}
    fields = work_order.get("fields") or {}
    machine_no = (fields.get("machineNo") or {}).get("value")
    mold_no = (fields.get("moldNo") or {}).get("value")
    total = _work_order_total(work_order)
    captured_taipei = _as_utc(observation.captured_at).astimezone(_TAIPEI_TZ)
    lines = [f"機台:{machine_no or '未辨識'}"]
    if mold_no:
        lines.append(f"模具:{mold_no}")
    lines.append(f"總計:{total if total is not None else '未辨識'} PCS")
    lines.append(f"擷取時間:{captured_taipei:%m/%d %H:%M}")
    lines.append(DISPATCH_TICKET_FOOTNOTE)
    return "\n".join(lines)


def _validated_capture_evidence(
    structured_fields: dict[str, Any],
) -> tuple[tuple[int, int, int, int], tuple[int, int], str] | None:
    work_order = structured_fields.get("workOrder")
    regions = structured_fields.get("captureRegions")
    if not isinstance(work_order, dict) or not isinstance(regions, dict):
        return None
    if work_order.get("alignmentStatus") != "ok" or work_order.get("currentEvidence") is not True:
        return None
    work_region = regions.get("workOrder")
    calibration_id = regions.get("calibrationId")
    frame_size_value = regions.get("frameSize")
    if (
        not isinstance(work_region, dict)
        or work_region.get("alignmentStatus") != "ok"
        or not isinstance(calibration_id, str)
        or not calibration_id.strip()
        or not isinstance(frame_size_value, (list, tuple))
        or len(frame_size_value) != 2
    ):
        return None
    if any(isinstance(part, bool) or not isinstance(part, int) or part <= 0 for part in frame_size_value):
        return None
    frame_size = (frame_size_value[0], frame_size_value[1])
    roi = _validated_pixel_roi(work_region.get("roi"), frame_size)
    if roi is None:
        return None
    return roi, frame_size, calibration_id.strip()


def _validated_pixel_roi(value: Any, frame_size: tuple[int, int]) -> tuple[int, int, int, int] | None:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    if any(isinstance(part, bool) or not isinstance(part, int) for part in value):
        return None
    x, y, width, height = value
    frame_width, frame_height = frame_size
    if x < 0 or y < 0 or width <= 0 or height <= 0:
        return None
    if x + width > frame_width or y + height > frame_height:
        return None
    return (x, y, width, height)


def _work_order_total(work_order: dict) -> int | None:
    row = (work_order.get("quantities") or {}).get("total") or {}
    for cell in ("left", "right"):
        value = (row.get(cell) or {}).get("value")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return int(value)
    return None


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
