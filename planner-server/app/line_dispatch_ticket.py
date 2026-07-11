"""LINE「派工單」指令的影像裁切與摘要邏輯。

Pure read-side helpers: find the newest work-order OCR observation for an exact
organization/site scope, crop the dispatch-sheet region out of the matching
camera frame, and build the human summary text. Ledger/engine logic stays in
app.dispatch.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from zoneinfo import ZoneInfo

from PIL import Image
from sqlmodel import Session, select

from app.models import CameraFrame, CameraOcrObservation


# ROI of the paper dispatch sheet in the camera image, expressed at the
# reference capture resolution and scaled proportionally to the actual frame.
DISPATCH_TICKET_REFERENCE_WIDTH = 2560
DISPATCH_TICKET_REFERENCE_HEIGHT = 1440
DISPATCH_TICKET_ROI = (900, 120, 550, 335)  # x, y, width, height
DISPATCH_TICKET_MAX_AGE_SECONDS = 2 * 60 * 60
DISPATCH_TICKET_MAX_FUTURE_SKEW_SECONDS = 5 * 60
DISPATCH_TICKET_FOOTNOTE = "⚠️ 數字為自動辨識,以圖為準"
_OBSERVATION_SCAN_LIMIT = 50
_TAIPEI_TZ = ZoneInfo("Asia/Taipei")


class DispatchTicketCropError(RuntimeError):
    pass


@dataclass(frozen=True)
class WorkOrderCapture:
    observation: CameraOcrObservation
    frame: CameraFrame | None


def find_latest_work_order_capture(
    session: Session,
    *,
    organization_id: str,
    site_id: str,
) -> WorkOrderCapture | None:
    """Latest OCR observation carrying structuredFields.workOrder, plus the
    newest uploaded frame from the same camera."""

    observations = session.exec(
        select(CameraOcrObservation)
        .where(
            CameraOcrObservation.organization_id == organization_id,
            CameraOcrObservation.site_id == site_id,
        )
        .order_by(CameraOcrObservation.captured_at.desc(), CameraOcrObservation.created_at.desc())
        .limit(_OBSERVATION_SCAN_LIMIT)
    ).all()
    observation = next(
        (item for item in observations if (item.structured_fields_json or {}).get("workOrder")),
        None,
    )
    if observation is None:
        return None
    frame = session.exec(
        select(CameraFrame)
        .where(
            CameraFrame.camera_id == observation.camera_id,
            CameraFrame.organization_id == organization_id,
            CameraFrame.site_id == site_id,
            CameraFrame.upload_status == "uploaded",
        )
        .order_by(CameraFrame.captured_at.desc(), CameraFrame.created_at.desc())
    ).first()
    return WorkOrderCapture(observation=observation, frame=frame)


def frame_is_stale(
    frame: CameraFrame,
    *,
    now: datetime | None = None,
    max_age_seconds: int = DISPATCH_TICKET_MAX_AGE_SECONDS,
) -> bool:
    current = _as_utc(now or datetime.now(timezone.utc))
    age_seconds = (current - _as_utc(frame.captured_at)).total_seconds()
    return age_seconds > max_age_seconds or age_seconds < -DISPATCH_TICKET_MAX_FUTURE_SKEW_SECONDS


def dispatch_ticket_storage_key(frame_id: str) -> str:
    return f"line-dispatch-tickets/{frame_id}.png"


def crop_dispatch_ticket_png(image_bytes: bytes) -> bytes:
    """Crop the dispatch-sheet ROI (scaled to the actual frame size) as PNG."""

    try:
        image = Image.open(BytesIO(image_bytes), formats=("JPEG", "PNG"))
        image.load()
    except Exception as exc:  # Pillow raises many concrete types here.
        raise DispatchTicketCropError("invalid_dispatch_ticket_image") from exc
    width, height = image.size
    if width <= 0 or height <= 0:
        raise DispatchTicketCropError("empty_dispatch_ticket_image")
    scale_x = width / DISPATCH_TICKET_REFERENCE_WIDTH
    scale_y = height / DISPATCH_TICKET_REFERENCE_HEIGHT
    roi_x, roi_y, roi_width, roi_height = DISPATCH_TICKET_ROI
    left = max(0, min(width, round(roi_x * scale_x)))
    top = max(0, min(height, round(roi_y * scale_y)))
    right = max(left, min(width, round((roi_x + roi_width) * scale_x)))
    bottom = max(top, min(height, round((roi_y + roi_height) * scale_y)))
    if right - left < 1 or bottom - top < 1:
        raise DispatchTicketCropError("dispatch_ticket_roi_out_of_bounds")
    cropped = image.convert("RGB").crop((left, top, right, bottom))
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


def _work_order_total(work_order: dict) -> int | None:
    # Same cell convention as app.dispatch._quantity_value (display-only copy).
    row = (work_order.get("quantities") or {}).get("total") or {}
    for cell in ("left", "right"):
        value = (row.get(cell) or {}).get("value")
        if isinstance(value, (int, float)):
            return int(value)
    return None


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
