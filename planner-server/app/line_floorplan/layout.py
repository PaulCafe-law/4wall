from __future__ import annotations

from dataclasses import dataclass
import json
from functools import lru_cache
from pathlib import Path
from typing import Any


BASE_WIDTH = 1040
BASE_HEIGHT = 700
SUPPORTED_LINE_IMAGEMAP_WIDTHS = {240, 300, 460, 700, 1040}


class FloorplanLayoutError(RuntimeError):
    pass


@dataclass(frozen=True)
class Rect:
    x: int
    y: int
    width: int
    height: int

    @classmethod
    def from_json(cls, values: list[Any]) -> "Rect":
        if len(values) != 4:
            raise FloorplanLayoutError("invalid_rect")
        x, y, width, height = (int(value) for value in values)
        if width <= 0 or height <= 0:
            raise FloorplanLayoutError("invalid_rect_size")
        return cls(x=x, y=y, width=width, height=height)

    def scaled(self, width: int) -> "Rect":
        ratio = width / BASE_WIDTH
        return Rect(
            x=round(self.x * ratio),
            y=round(self.y * ratio),
            width=round(self.width * ratio),
            height=round(self.height * ratio),
        )

    def to_line_area(self) -> dict[str, int]:
        return {"x": self.x, "y": self.y, "width": self.width, "height": self.height}


@dataclass(frozen=True)
class Point:
    x: int
    y: int

    @classmethod
    def from_json(cls, values: list[Any]) -> "Point":
        if len(values) != 2:
            raise FloorplanLayoutError("invalid_point")
        return cls(x=int(values[0]), y=int(values[1]))

    def scaled(self, width: int) -> "Point":
        ratio = width / BASE_WIDTH
        return Point(x=round(self.x * ratio), y=round(self.y * ratio))


@dataclass(frozen=True)
class ZoneLayout:
    id: str
    label: str
    ascii_label: str
    rect: Rect


@dataclass(frozen=True)
class MachineLayout:
    id: str
    label: str
    rect: Rect
    gauge_ids: tuple[str, ...]
    camera_matches: tuple[str, ...]


@dataclass(frozen=True)
class CameraLayout:
    name_contains: str
    label: str
    ascii_label: str
    point: Point
    machine_id: str | None


@dataclass(frozen=True)
class FloorplanLayout:
    site_slug: str
    site_id: str
    canvas_width: int
    canvas_height: int
    zones: tuple[ZoneLayout, ...]
    machines: tuple[MachineLayout, ...]
    cameras: tuple[CameraLayout, ...]
    meta: dict[str, Any]

    def machine(self, machine_id: str) -> MachineLayout | None:
        for machine in self.machines:
            if machine.id == machine_id:
                return machine
        return None


@lru_cache(maxsize=8)
def load_floorplan_layout(site_slug: str) -> FloorplanLayout:
    safe_slug = site_slug.strip().lower()
    if not safe_slug or safe_slug != "jingcheng":
        raise FloorplanLayoutError("floorplan_layout_not_found")
    path = Path(__file__).resolve().parent / "layouts" / f"{safe_slug}.json"
    if not path.exists():
        raise FloorplanLayoutError("floorplan_layout_not_found")
    data = json.loads(path.read_text(encoding="utf-8"))
    return _parse_layout(data)


def validate_imagemap_width(width: int) -> int:
    if width not in SUPPORTED_LINE_IMAGEMAP_WIDTHS:
        raise FloorplanLayoutError("unsupported_imagemap_width")
    return width


def floorplan_asset_path(site_slug: str) -> Path:
    return Path(__file__).resolve().parent / "assets" / f"{site_slug}_base_{BASE_WIDTH}.png"


def _parse_layout(data: dict[str, Any]) -> FloorplanLayout:
    canvas = data.get("canvas") or {}
    canvas_width = int(canvas.get("width") or 0)
    canvas_height = int(canvas.get("height") or 0)
    if canvas_width != BASE_WIDTH or canvas_height != BASE_HEIGHT:
        raise FloorplanLayoutError("invalid_canvas")
    zones = tuple(
        ZoneLayout(
            id=str(item["id"]),
            label=str(item["label"]),
            ascii_label=str(item.get("asciiLabel") or item["id"]),
            rect=Rect.from_json(item["rect"]),
        )
        for item in data.get("zones") or []
    )
    machines = tuple(
        MachineLayout(
            id=str(item["id"]),
            label=str(item["label"]),
            rect=Rect.from_json(item["rect"]),
            gauge_ids=tuple(str(value) for value in item.get("gaugeIds") or []),
            camera_matches=tuple(str(value) for value in item.get("cameraMatches") or []),
        )
        for item in data.get("machines") or []
    )
    cameras = tuple(
        CameraLayout(
            name_contains=str(item["nameContains"]),
            label=str(item["label"]),
            ascii_label=str(item.get("asciiLabel") or item["nameContains"]),
            point=Point.from_json(item["point"]),
            machine_id=str(item["machineId"]) if item.get("machineId") else None,
        )
        for item in data.get("cameras") or []
    )
    return FloorplanLayout(
        site_slug=str(data["siteSlug"]),
        site_id=str(data["siteId"]),
        canvas_width=canvas_width,
        canvas_height=canvas_height,
        zones=zones,
        machines=machines,
        cameras=cameras,
        meta=dict(data.get("_meta") or {}),
    )
