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
LINE_BOT_INFO_URL = "https://api.line.me/v2/bot/info"
EXPECTED_BOT_DISPLAY_NAME = "4wallaitech"
EXPECTED_BOT_BASIC_ID = "@941wjxxe"
DEFAULT_RICH_MENU_OWNED_BY_OTHER_CHANNEL = "the richmenu is owned by another channel"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create the six-cell 4WALL LINE rich menu.")
    parser.add_argument("--apply", action="store_true", help="Call the LINE API. Default is dry-run JSON only.")
    parser.add_argument("--name", default="factory-ops-v2")
    parser.add_argument("--chat-bar-text", default="選單")
    parser.add_argument("--expected-display-name", default=EXPECTED_BOT_DISPLAY_NAME)
    parser.add_argument("--expected-basic-id", default=EXPECTED_BOT_BASIC_ID)
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
    info = _get_bot_info(token)
    if info.get("displayName") != args.expected_display_name or info.get("basicId") != args.expected_basic_id:
        raise SystemExit("line_bot_identity_mismatch")
    previous_default_id = _get_default_rich_menu_id(token)
    rich_menu_id = _create_rich_menu(token, payload)
    try:
        _upload_rich_menu_image(token, rich_menu_id, _render_rich_menu_image())
        _set_default_rich_menu(token, rich_menu_id)
        if _get_default_rich_menu_id(token) != rich_menu_id:
            raise RuntimeError("line_default_rich_menu_verification_failed")
    except Exception:
        if previous_default_id:
            _set_default_rich_menu(token, previous_default_id)
        else:
            _cancel_default_rich_menu(token)
        raise
    print(
        json.dumps(
            {
                "dryRun": False,
                "displayName": info.get("displayName"),
                "basicId": info.get("basicId"),
                "richMenuId": rich_menu_id,
                "previousDefaultRichMenuId": previous_default_id,
                "default": True,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def build_rich_menu_payload(*, name: str, chat_bar_text: str) -> dict:
    return {
        "size": {"width": 2500, "height": 1686},
        "selected": True,
        "name": name,
        "chatBarText": chat_bar_text,
        "areas": [
            _area(0, 0, 834, 843, "2D圖", "floorplan"),
            _area(834, 0, 833, 843, "檢視工程進度", "project_progress"),
            _area(1667, 0, 833, 843, "前往官網", "official_site"),
            _area(0, 843, 834, 843, "找機台", "machines"),
            _area(834, 843, 833, 843, "找人", "people_portal"),
            _area(1667, 843, 833, 843, "聯絡我們", "contact_us"),
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


def _cancel_default_rich_menu(token: str) -> None:
    response = httpx.delete(
        LINE_DEFAULT_RICH_MENU_URL,
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    if response.status_code not in {200, 404}:
        response.raise_for_status()


def _get_default_rich_menu_id(token: str) -> str | None:
    response = httpx.get(
        LINE_DEFAULT_RICH_MENU_URL,
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    if response.status_code == 404:
        return None
    if response.status_code == 403:
        message = str(response.json().get("message") or "")
        if message == DEFAULT_RICH_MENU_OWNED_BY_OTHER_CHANNEL:
            return None
    response.raise_for_status()
    return str(response.json().get("richMenuId") or "") or None


def _get_bot_info(token: str) -> dict:
    response = httpx.get(
        LINE_BOT_INFO_URL,
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    response.raise_for_status()
    return dict(response.json())


def _render_rich_menu_image() -> bytes:
    image = Image.new("RGB", (2500, 1686), "#F4EFE7")
    draw = ImageDraw.Draw(image)
    labels = [
        ("2D圖", (0, 0, 834, 843), 132),
        ("檢視\n工程\n進度", (834, 0, 1667, 843), 112),
        ("前往\n官網", (1667, 0, 2500, 843), 120),
        ("找機台", (0, 843, 834, 1686), 132),
        ("找人", (834, 843, 1667, 1686), 132),
        ("聯絡\n我們", (1667, 843, 2500, 1686), 120),
    ]
    for index, (label, bounds, font_size) in enumerate(labels):
        fill = "#E6DCC6" if index % 2 == 0 else "#FFFFFF"
        draw.rectangle(bounds, fill=fill, outline="#171B1F", width=8)
        font = _font(font_size)
        bbox = draw.multiline_textbbox((0, 0), label, font=font, align="center", spacing=20)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x1, y1, x2, y2 = bounds
        draw.multiline_text(
            (x1 + (x2 - x1 - text_width) / 2, y1 + (y2 - y1 - text_height) / 2),
            label,
            fill="#171B1F",
            font=font,
            align="center",
            spacing=20,
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
