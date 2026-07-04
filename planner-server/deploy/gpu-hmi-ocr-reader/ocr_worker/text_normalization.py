from __future__ import annotations

from typing import Any


_OPENCC_CONVERTER: Any | None = None
_OPENCC_LOAD_ATTEMPTED = False

_PHRASE_FALLBACKS = (
    ("生产", "生產"),
    ("生産", "生產"),
    ("预计", "預計"),
    ("预估", "預估"),
    ("总数", "總數"),
    ("总计", "總計"),
    ("后处理", "後處理"),
    ("已设定", "已設定"),
    ("设定", "設定"),
    ("机器", "機器"),
    ("监视", "監視"),
    ("压力", "壓力"),
    ("温度", "溫度"),
    ("派工单", "派工單"),
    ("画面", "畫面"),
)

_CHAR_FALLBACKS = str.maketrans(
    {
        "产": "產",
        "産": "產",
        "预": "預",
        "计": "計",
        "总": "總",
        "后": "後",
        "处": "處",
        "设": "設",
        "号": "號",
        "机": "機",
        "监": "監",
        "视": "視",
        "压": "壓",
        "温": "溫",
        "画": "畫",
        "单": "單",
        "动": "動",
        "为": "為",
        "对": "對",
        "应": "應",
        "过": "過",
        "与": "與",
        "线": "線",
        "实": "實",
        "发": "發",
        "现": "現",
        "转": "轉",
        "类": "類",
        "数": "數",
        "据": "據",
        "认": "認",
        "录": "錄",
        "电": "電",
        "显": "顯",
        "页": "頁",
        "务": "務",
        "厂": "廠",
    }
)


def normalize_traditional_chinese(value: Any) -> Any:
    if isinstance(value, str):
        return to_traditional_chinese(value)
    if isinstance(value, list):
        return [normalize_traditional_chinese(item) for item in value]
    if isinstance(value, tuple):
        return tuple(normalize_traditional_chinese(item) for item in value)
    if isinstance(value, dict):
        return {
            normalize_traditional_chinese(key): normalize_traditional_chinese(item)
            for key, item in value.items()
        }
    return value


def to_traditional_chinese(text: str) -> str:
    converter = _get_opencc_converter()
    if converter is None:
        return _fallback_to_traditional(text)
    return converter.convert(text)


def _get_opencc_converter() -> Any | None:
    global _OPENCC_CONVERTER, _OPENCC_LOAD_ATTEMPTED
    if _OPENCC_LOAD_ATTEMPTED:
        return _OPENCC_CONVERTER
    _OPENCC_LOAD_ATTEMPTED = True
    try:
        from opencc import OpenCC  # type: ignore

        _OPENCC_CONVERTER = OpenCC("s2twp")
    except Exception:
        _OPENCC_CONVERTER = None
    return _OPENCC_CONVERTER


def _fallback_to_traditional(text: str) -> str:
    converted = text
    for source, target in _PHRASE_FALLBACKS:
        converted = converted.replace(source, target)
    return converted.translate(_CHAR_FALLBACKS)
