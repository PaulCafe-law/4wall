from __future__ import annotations

import os
from pathlib import Path

from PIL import ImageFont


CJK_FONT_CANDIDATES = (
    "C:/Windows/Fonts/msjh.ttc",
    "C:/Windows/Fonts/mingliu.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansTC-Regular.ttf",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
)
CJK_FONT_GLOBS = (
    "/usr/share/fonts/**/NotoSansCJK*.ttc",
    "/usr/share/fonts/**/NotoSansCJK*.otf",
    "/usr/share/fonts/**/NotoSansTC*.ttf",
)
FONT_ENV_KEYS = ("LINE_FLOORPLAN_FONT_FILE", "LINE_RICH_MENU_FONT_FILE")


def find_cjk_font() -> Path | None:
    for key in FONT_ENV_KEYS:
        value = os.getenv(key)
        if value:
            candidate = Path(value)
            if candidate.exists():
                return candidate
    for value in CJK_FONT_CANDIDATES:
        candidate = Path(value)
        if candidate.exists():
            return candidate
    for pattern in CJK_FONT_GLOBS:
        for candidate in sorted(Path("/").glob(pattern.lstrip("/"))):
            if candidate.exists():
                return candidate
    return None


def load_font(size: int, *, prefer_cjk: bool = True) -> ImageFont.ImageFont:
    if prefer_cjk:
        font_path = find_cjk_font()
        if font_path is not None:
            return ImageFont.truetype(str(font_path), size=size)
    try:
        return ImageFont.truetype("arial.ttf", size=size)
    except OSError:
        return ImageFont.load_default()
