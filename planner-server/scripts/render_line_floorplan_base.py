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
    image = Image.new("RGB", (BASE_WIDTH, BASE_HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    title_font = _font(font_path, 32)
    label_font = _font(font_path, 22)
    small_font = _font(font_path, 16)
    use_cjk = font_path is not None

    draw.rectangle((30, 34, BASE_WIDTH - 30, BASE_HEIGHT - 34), outline=INK, width=5)
    draw.line((30, 155, BASE_WIDTH - 30, 155), fill=INK, width=2)
    draw.line((30, 545, BASE_WIDTH - 30, 545), fill=INK, width=2)
    draw.text((48, 58), "Jingcheng Factory 2D Floorplan", fill=INK, font=title_font)
    draw.text((48, 96), "LINE imagemap base - static layout only", fill="#555B61", font=small_font)

    for index, zone in enumerate(layout.zones):
        fill = ZONE_ACCENT if index == 0 else ZONE_FILL
        rect = zone.rect
        draw.rounded_rectangle(
            (rect.x, rect.y, rect.x + rect.width, rect.y + rect.height),
            radius=10,
            fill=fill,
            outline=INK,
            width=2,
        )
        _draw_zone_label(draw, _display_label(zone.label, zone.ascii_label, use_cjk), rect, small_font, INK)

    for machine in layout.machines:
        rect = machine.rect
        draw.rounded_rectangle(
            (rect.x, rect.y, rect.x + rect.width, rect.y + rect.height),
            radius=6,
            fill=MACHINE_FILL,
            outline=MACHINE_STROKE,
            width=3,
        )
        _draw_centered_text(draw, machine.label, rect, label_font, INK)

    for camera in layout.cameras:
        point = camera.point
        draw.rectangle((point.x - 10, point.y - 10, point.x + 10, point.y + 10), fill=CAMERA_FILL, outline=INK, width=2)
        label = _display_label(camera.label, camera.ascii_label, use_cjk)
        draw.text((point.x + 14, point.y - 11), label, fill=INK, font=small_font)

    draw.text((48, BASE_HEIGHT - 72), "Status overlay is rendered at request time.", fill="#555B61", font=small_font)
    return image


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


if __name__ == "__main__":
    raise SystemExit(main())
