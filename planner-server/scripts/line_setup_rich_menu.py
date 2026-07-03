from __future__ import annotations

import argparse
from io import BytesIO
import json
import os
from pathlib import Path
import sys

import httpx
from PIL import Image, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.line_floorplan.fonts import load_font


LINE_RICH_MENU_URL = "https://api.line.me/v2/bot/richmenu"
LINE_RICH_MENU_DATA_URL = "https://api-data.line.me/v2/bot/richmenu"
LINE_DEFAULT_RICH_MENU_URL = "https://api.line.me/v2/bot/user/all/richmenu"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create the LINE floorplan P0 rich menu.")
    parser.add_argument("--apply", action="store_true", help="Call the LINE API. Default is dry-run JSON only.")
    parser.add_argument("--name", default="factory-floorplan-p0")
    parser.add_argument("--chat-bar-text", default="靚程工廠")
    return parser.parse_args()


def main() -> int:
    _configure_stdio()
    args = parse_args()
    payload = build_rich_menu_payload(name=args.name, chat_bar_text=args.chat_bar_text)
    if not args.apply:
        print(json.dumps({"dryRun": True, "richMenu": payload}, ensure_ascii=False, indent=2))
        return 0

    token = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")
    if not token:
        raise SystemExit("missing_LINE_CHANNEL_ACCESS_TOKEN")
    rich_menu_id = _create_rich_menu(token, payload)
    _upload_rich_menu_image(token, rich_menu_id, _render_rich_menu_image())
    _set_default_rich_menu(token, rich_menu_id)
    print(json.dumps({"dryRun": False, "richMenuId": rich_menu_id, "default": True}, ensure_ascii=False, indent=2))
    return 0


def build_rich_menu_payload(*, name: str, chat_bar_text: str) -> dict:
    return {
        "size": {"width": 2500, "height": 1686},
        "selected": True,
        "name": name,
        "chatBarText": chat_bar_text,
        "areas": [
            _area(0, 0, 1250, 843, "廠區圖", "floorplan"),
            _area(1250, 0, 1250, 843, "機台", "machines"),
            _area(0, 843, 1250, 843, "儀表", "gauges"),
            _area(1250, 843, 1250, 843, "今日異常", "daily_incidents"),
        ],
    }


def _area(x: int, y: int, width: int, height: int, label: str, action: str) -> dict:
    return {
        "bounds": {"x": x, "y": y, "width": width, "height": height},
        "action": {"type": "postback", "label": label, "data": f"action={action}"},
    }


def _create_rich_menu(token: str, payload: dict) -> str:
    response = httpx.post(
        LINE_RICH_MENU_URL,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=20,
    )
    response.raise_for_status()
    return str(response.json()["richMenuId"])


def _upload_rich_menu_image(token: str, rich_menu_id: str, image: bytes) -> None:
    response = httpx.post(
        f"{LINE_RICH_MENU_DATA_URL}/{rich_menu_id}/content",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "image/png"},
        content=image,
        timeout=20,
    )
    response.raise_for_status()


def _set_default_rich_menu(token: str, rich_menu_id: str) -> None:
    response = httpx.post(
        f"{LINE_DEFAULT_RICH_MENU_URL}/{rich_menu_id}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    response.raise_for_status()


def _render_rich_menu_image() -> bytes:
    image = Image.new("RGB", (2500, 1686), "#F4EFE7")
    draw = ImageDraw.Draw(image)
    font = _font(132)
    labels = [
        ("廠區圖", (0, 0, 1250, 843)),
        ("機台", (1250, 0, 2500, 843)),
        ("儀表", (0, 843, 1250, 1686)),
        ("今日異常", (1250, 843, 2500, 1686)),
    ]
    for index, (label, bounds) in enumerate(labels):
        fill = "#E6DCC6" if index % 2 == 0 else "#FFFFFF"
        draw.rectangle(bounds, fill=fill, outline="#171B1F", width=8)
        bbox = draw.textbbox((0, 0), label, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x1, y1, x2, y2 = bounds
        draw.text(
            (x1 + (x2 - x1 - text_width) / 2, y1 + (y2 - y1 - text_height) / 2),
            label,
            fill="#171B1F",
            font=font,
        )
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _font(size: int) -> ImageFont.ImageFont:
    return load_font(size)


def _configure_stdio() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
