from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from io import BytesIO
from threading import Lock

from PIL import Image, ImageDraw, ImageFont
from sqlmodel import Session

from .fonts import load_font
from .layout import BASE_HEIGHT, BASE_WIDTH, FloorplanLayout, floorplan_asset_path
from .service import FloorplanBindingScope, FloorplanSnapshot, get_floorplan_snapshot


CACHE_SECONDS = 60
STATUS_COLORS = {
    "red": "#C93B2F",
    "yellow": "#D9A441",
    "green": "#2F8F5B",
    "gray": "#8B949E",
}


@dataclass(frozen=True)
class RenderedFloorplan:
    content: bytes
    cache_status: str
    width: int
    height: int


_CACHE: dict[tuple[str, str, int], tuple[datetime, RenderedFloorplan]] = {}
_CACHE_LOCK = Lock()


def render_floorplan_png(
    session: Session,
    *,
    layout: FloorplanLayout,
    binding: FloorplanBindingScope,
    width: int,
    now: datetime | None = None,
) -> RenderedFloorplan:
    current = _as_utc(now or datetime.now(timezone.utc))
    cache_key = (layout.site_slug, _binding_cache_id(binding), width)
    with _CACHE_LOCK:
        cached = _CACHE.get(cache_key)
        if cached is not None:
            expires_at, rendered = cached
            if current < expires_at:
                return RenderedFloorplan(
                    content=rendered.content,
                    cache_status="hit",
                    width=rendered.width,
                    height=rendered.height,
                )
            _CACHE.pop(cache_key, None)

    snapshot = get_floorplan_snapshot(session, layout=layout, binding=binding, now=current)
    rendered = _draw_floorplan(layout=layout, snapshot=snapshot, width=width)
    with _CACHE_LOCK:
        _CACHE[cache_key] = (current + timedelta(seconds=CACHE_SECONDS), rendered)
    return rendered


def clear_floorplan_render_cache() -> None:
    with _CACHE_LOCK:
        _CACHE.clear()


def _binding_cache_id(binding: FloorplanBindingScope) -> str:
    source_id = getattr(binding, "source_id", None)
    if source_id:
        return str(source_id)
    group_id = getattr(binding, "group_id", None)
    if group_id:
        return str(group_id)
    return f"{binding.organization_id}:{binding.site_id}"


def _draw_floorplan(layout: FloorplanLayout, snapshot: FloorplanSnapshot, width: int) -> RenderedFloorplan:
    base = Image.open(floorplan_asset_path(layout.site_slug)).convert("RGBA")
    height = round(BASE_HEIGHT * (width / BASE_WIDTH))
    if width != BASE_WIDTH:
        base = base.resize((width, height), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(base)
    _draw_machine_statuses(draw, layout, snapshot, width)
    _draw_camera_statuses(draw, layout, snapshot, width)
    _draw_timestamp(draw, snapshot, width, height)
    output = BytesIO()
    base.save(output, format="PNG", optimize=True)
    return RenderedFloorplan(content=output.getvalue(), cache_status="miss", width=width, height=height)


def _draw_machine_statuses(
    draw: ImageDraw.ImageDraw,
    layout: FloorplanLayout,
    snapshot: FloorplanSnapshot,
    width: int,
) -> None:
    ratio = width / BASE_WIDTH
    radius = max(5, round(9 * ratio))
    outline = max(2, round(3 * ratio))
    for machine in layout.machines:
        rect = machine.rect.scaled(width)
        status = snapshot.machine_statuses.get(machine.id, "gray")
        color = STATUS_COLORS.get(status, STATUS_COLORS["gray"])
        cx = rect.x + rect.width - radius - max(4, round(6 * ratio))
        cy = rect.y + radius + max(4, round(6 * ratio))
        draw.ellipse(
            (cx - radius, cy - radius, cx + radius, cy + radius),
            fill=color,
            outline="#F4EFE7",
            width=outline,
        )


def _draw_camera_statuses(
    draw: ImageDraw.ImageDraw,
    layout: FloorplanLayout,
    snapshot: FloorplanSnapshot,
    width: int,
) -> None:
    ratio = width / BASE_WIDTH
    radius = max(5, round(8 * ratio))
    outline = max(2, round(3 * ratio))
    for camera in layout.cameras:
        point = camera.point.scaled(width)
        status = snapshot.camera_statuses.get(camera.name_contains, "gray")
        color = STATUS_COLORS.get(status, STATUS_COLORS["gray"])
        draw.rectangle(
            (point.x - radius, point.y - radius, point.x + radius, point.y + radius),
            fill=color,
            outline="#171B1F",
            width=outline,
        )


def _draw_timestamp(draw: ImageDraw.ImageDraw, snapshot: FloorplanSnapshot, width: int, height: int) -> None:
    text = f"TPE {snapshot.rendered_at_taipei:%Y-%m-%d %H:%M:%S}"
    font = _font(max(10, round(width / 64)))
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    padding = max(6, round(width / 86))
    x = max(0, width - text_width - padding * 2)
    y = max(0, height - text_height - padding * 2)
    draw.rectangle((x - padding, y - padding, width, height), fill=(244, 239, 231, 220))
    draw.text((x, y), text, fill="#171B1F", font=font)


def _font(size: int) -> ImageFont.ImageFont:
    return load_font(size)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
