from __future__ import annotations

import argparse
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont


PLANNER_ROOT = Path(__file__).resolve().parents[1]
if str(PLANNER_ROOT) not in sys.path:
    sys.path.insert(0, str(PLANNER_ROOT))

from app.line_floorplan.layout import BASE_HEIGHT, BASE_WIDTH, FloorplanLayout, load_floorplan_layout
from app.line_floorplan.fonts import find_cjk_font, load_font


BACKGROUND = "#F4EFE7"
INK = "#171B1F"
ZONE_FILL = "#E6DCC6"
ZONE_ACCENT = "#D9A441"
MACHINE_FILL = "#FFFDF8"
MACHINE_STROKE = "#171B1F"
CAMERA_FILL = "#2F8F5B"
MAP_RECT = (32, 112, 976, 432)
GLB_TOPDOWN_SOURCE = PLANNER_ROOT / "app" / "line_floorplan" / "assets" / "jingcheng_glb_topdown_crop.png"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render the static LINE floorplan base PNG.")
    parser.add_argument("--site-slug", default="jingcheng")
    parser.add_argument(
        "--output",
        default=str(PLANNER_ROOT / "app" / "line_floorplan" / "assets" / "jingcheng_base_1040.png"),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    layout = load_floorplan_layout(args.site_slug)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    font_path = find_cjk_font()
    if font_path is None:
        print("No CJK font found; rendering ASCII fallback labels.", file=sys.stderr)
    image = _render_base(layout, font_path=font_path)
    image.save(output, format="PNG", optimize=True)
    print(output)
    return 0


def _render_base(layout: FloorplanLayout, *, font_path: Path | None) -> Image.Image:
    image = Image.new("RGBA", (BASE_WIDTH, BASE_HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    title_font = _font(font_path, 30)
    label_font = _font(font_path, 20)
    small_font = _font(font_path, 16)
    use_cjk = font_path is not None

    if not GLB_TOPDOWN_SOURCE.exists():
        raise FileNotFoundError(f"missing GLB top-down source asset: {GLB_TOPDOWN_SOURCE}")

    map_x, map_y, map_width, map_height = MAP_RECT
    topdown = Image.open(GLB_TOPDOWN_SOURCE).convert("RGBA").resize(
        (map_width, map_height),
        Image.Resampling.LANCZOS,
    )
    image.alpha_composite(topdown, dest=(map_x, map_y))

    draw.rectangle((24, 24, BASE_WIDTH - 24, BASE_HEIGHT - 24), outline=INK, width=4)
    draw.text((44, 42), "靚程工廠 2D 即時廠區圖" if use_cjk else "Jingcheng Factory Live Floorplan", fill=INK, font=title_font)
    draw.text(
        (46, 78),
        "來源：factory.glb 俯視投影，狀態於請求時疊加" if use_cjk else "Source: factory.glb top-down projection; status overlays render at request time.",
        fill="#555B61",
        font=small_font,
    )
    draw.rectangle((map_x, map_y, map_x + map_width, map_y + map_height), outline="#555B61", width=2)

    overlay = Image.new("RGBA", (BASE_WIDTH, BASE_HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for index, zone in enumerate(layout.zones):
        fill = _rgba(ZONE_ACCENT if index == 0 else ZONE_FILL, 72)
        rect = zone.rect
        overlay_draw.rounded_rectangle(
            (rect.x, rect.y, rect.x + rect.width, rect.y + rect.height),
            radius=6,
            fill=fill,
            outline=_rgba(INK, 180),
            width=2,
        )
    image = Image.alpha_composite(image, overlay)
    draw = ImageDraw.Draw(image)

    for zone in layout.zones:
        _draw_zone_label(draw, _display_label(zone.label, zone.ascii_label, use_cjk), zone.rect, small_font, INK)

    for machine in layout.machines:
        rect = machine.rect
        draw.rounded_rectangle(
            (rect.x, rect.y, rect.x + rect.width, rect.y + rect.height),
            radius=6,
            fill=(255, 253, 248, 235),
            outline=MACHINE_STROKE,
            width=2,
        )
        _draw_centered_text(draw, machine.label, rect, label_font, INK)

    for camera in layout.cameras:
        point = camera.point
        draw.rectangle((point.x - 10, point.y - 10, point.x + 10, point.y + 10), fill=CAMERA_FILL, outline=INK, width=2)

    legend = "圓點：機台狀態  方塊：相機心跳  紅 未結異常  黃 儀表異常  綠 正常  灰 無資料" if use_cjk else "Circle: machine status  Square: camera heartbeat  Red open incident  Yellow gauge issue  Green normal  Gray no data"
    draw.text((46, BASE_HEIGHT - 66), legend, fill="#555B61", font=small_font)
    return image.convert("RGB")


def _draw_centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    rect,
    font: ImageFont.ImageFont,
    fill: str,
) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = rect.x + max(0, rect.width - text_width) / 2
    y = rect.y + max(0, rect.height - text_height) / 2
    draw.text((x, y), text, fill=fill, font=font)


def _draw_zone_label(
    draw: ImageDraw.ImageDraw,
    text: str,
    rect,
    font: ImageFont.ImageFont,
    fill: str,
) -> None:
    padding = 12
    draw.text((rect.x + padding, rect.y + padding), text, fill=fill, font=font)


def _display_label(label: str, ascii_label: str, use_cjk: bool) -> str:
    return label if use_cjk else ascii_label


def _font(font_path: Path | None, size: int) -> ImageFont.ImageFont:
    if font_path is not None:
        return load_font(size)
    return load_font(size, prefer_cjk=False)


def _rgba(hex_color: str, alpha: int) -> tuple[int, int, int, int]:
    value = hex_color.lstrip("#")
    return (
        int(value[0:2], 16),
        int(value[2:4], 16),
        int(value[4:6], 16),
        alpha,
    )


if __name__ == "__main__":
    raise SystemExit(main())
