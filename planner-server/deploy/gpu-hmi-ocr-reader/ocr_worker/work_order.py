"""Structured parsing of the HC600 paper dispatch sheet (派工單) OCR lines.

The printed sheet layout is fixed, but PaddleOCR badly garbles the printed
labels (機台編號 -> 報臺拍號, 預計生產數 -> 慎計生生款, ...), so keyword
matching alone is unreliable. Geometry is the strong signal instead: the four
quantity rows always appear in the same top-to-bottom order and the L / R
column markers OCR at high confidence, so rows are clustered by their box
centroids and mapped positionally. Values are accepted only when a window
contains exactly one clean numeric token and no other digit-bearing noise —
ambiguous handwriting degrades to "unknown" rather than a wrong number.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .hmi_analysis import normalize_text
from .ocr_engine import OcrTextLine


UNKNOWN = "unknown"

# Row titles transcribed from the physical HC600 dispatch sheet (operator-
# confirmed 2026-07-05): 有掛/無掛 refer to hanger vs no-hanger production.
QUANTITY_ROW_SCHEMA: tuple[tuple[str, str], ...] = (
    ("plannedWithHanger", "預計生產數（有掛）"),
    ("plannedScheduledNoHanger", "預計生產數（有排程、無掛）"),
    ("plannedNoHanger", "預計生產數（無掛）"),
    ("total", "總計"),
)

HEADER_FIELD_LABELS: dict[str, str] = {
    "machineNo": "機台編號",
    "moldNo": "模具編號",
    "productionDate": "生產日期",
    "moldCavity": "模具穴數",
    "material": "材質",
    "color": "顏色",
    "packaging": "包裝方式",
    "shipDate": "出貨日期",
    "remark": "備註",
}

KNOWN_COLORS: tuple[str, ...] = ("透明", "白色", "黑色", "紅色", "藍色", "黃色", "綠色", "灰色")

_L_MARKERS = {"L", "|L", "L|", "(L)"}
_R_MARKERS = {"R", "|R", "R|", "(R)"}
_CODE_PATTERN = re.compile(r"^[A-Z]{1,4}[0-9]{2,6}[A-Z0-9]{0,4}$")
_INT_PATTERN = re.compile(r"^[0-9]{1,6}$")
_ROC_YEAR_PATTERN = re.compile(r"^1[0-9]{2}$")
_CJK_PATTERN = re.compile(r"[一-鿿]")


@dataclass(frozen=True)
class _Line:
    text: str
    norm: str
    confidence: float
    cx: float
    cy: float


def build_work_order_fields(work_order_lines: list[OcrTextLine]) -> dict[str, Any]:
    lines = _positioned_lines(work_order_lines)
    fields = {key: _leaf(UNKNOWN, 0.0, "", label=label) for key, label in HEADER_FIELD_LABELS.items()}
    quantities = {
        key: {"label": label, "left": _leaf(UNKNOWN, 0.0, ""), "right": _leaf(UNKNOWN, 0.0, "")}
        for key, label in QUANTITY_ROW_SCHEMA
    }
    result: dict[str, Any] = {
        "template": "hc600_dispatch_sheet_v1",
        "unit": "PCS",
        "sourceLineCount": len(lines),
        "fields": fields,
        "quantities": quantities,
    }
    if not lines:
        return result

    rows = _cluster_rows(lines)
    quantity_rows = [row for row in rows if _find_marker(row, _L_MARKERS) and _find_marker(row, _R_MARKERS)]

    if len(quantity_rows) == len(QUANTITY_ROW_SCHEMA):
        for (key, _label), row in zip(QUANTITY_ROW_SCHEMA, quantity_rows):
            quantities[key]["left"], quantities[key]["right"] = _quantity_cells(row)
    else:
        # Row count surprise: only trust the row whose printed label survived OCR.
        for row in quantity_rows:
            if "總計" in _row_label_text(row):
                quantities["total"]["left"], quantities["total"]["right"] = _quantity_cells(row)

    first_quantity_cy = quantity_rows[0][0].cy if quantity_rows else float("inf")
    last_quantity_cy = quantity_rows[-1][0].cy if quantity_rows else float("-inf")
    max_x = max(line.cx for line in lines)

    _fill_header_codes(rows, fields, first_quantity_cy, max_x)
    _fill_date_and_cavity(rows, fields, first_quantity_cy, max_x)
    if quantity_rows:
        # Without the quantity band as an anchor the scan region is unbounded
        # and would grab garbled header labels; degrade to unknown instead.
        _fill_material_and_color(rows, fields, last_quantity_cy, max_x)
    return result


def _positioned_lines(raw_lines: list[OcrTextLine]) -> list[_Line]:
    lines: list[_Line] = []
    for line in raw_lines:
        text = line.text.strip()
        if not text or not line.box:
            continue
        xs = [point[0] for point in line.box]
        ys = [point[1] for point in line.box]
        lines.append(
            _Line(
                text=text,
                norm=normalize_text(text).strip("|"),
                confidence=float(line.confidence),
                cx=sum(xs) / len(xs),
                cy=sum(ys) / len(ys),
            )
        )
    return sorted(lines, key=lambda item: item.cy)


def _cluster_rows(lines: list[_Line]) -> list[list[_Line]]:
    if not lines:
        return []
    tolerance = max(10.0, 0.04 * lines[-1].cy)
    rows: list[list[_Line]] = []
    for line in lines:
        if rows and abs(line.cy - rows[-1][-1].cy) <= tolerance:
            rows[-1].append(line)
        else:
            rows.append([line])
    return [sorted(row, key=lambda item: item.cx) for row in rows]


def _find_marker(row: list[_Line], markers: set[str]) -> _Line | None:
    for line in row:
        if normalize_text(line.text) in markers:
            return line
    return None


def _row_label_text(row: list[_Line]) -> str:
    marker = _find_marker(row, _L_MARKERS)
    limit = marker.cx if marker else float("inf")
    return "".join(line.norm for line in row if line.cx < limit)


def _quantity_cells(row: list[_Line]) -> tuple[dict[str, Any], dict[str, Any]]:
    l_marker = _find_marker(row, _L_MARKERS)
    r_marker = _find_marker(row, _R_MARKERS)
    left = _window_value(row, l_marker.cx, r_marker.cx) if l_marker and r_marker else _leaf(UNKNOWN, 0.0, "")
    right = _window_value(row, r_marker.cx, float("inf")) if r_marker else _leaf(UNKNOWN, 0.0, "")
    return left, right


def _window_value(row: list[_Line], x_from: float, x_to: float) -> dict[str, Any]:
    in_window = [line for line in row if x_from < line.cx < x_to and normalize_text(line.text) not in _L_MARKERS | _R_MARKERS]
    clean = [line for line in in_window if _INT_PATTERN.fullmatch(line.norm)]
    noisy_digits = [line for line in in_window if line not in clean and any(ch.isdigit() for ch in line.norm)]
    raw = " ".join(line.text for line in in_window)
    if len(clean) == 1 and not noisy_digits:
        return _leaf(int(clean[0].norm), clean[0].confidence, clean[0].text)
    return _leaf(UNKNOWN, 0.0, raw)


def _fill_header_codes(rows: list[list[_Line]], fields: dict[str, Any], first_quantity_cy: float, max_x: float) -> None:
    midpoint = max_x / 2 if max_x > 0 else float("inf")
    for row in rows:
        if row[0].cy >= first_quantity_cy:
            break
        for line in row:
            if not _CODE_PATTERN.fullmatch(line.norm) or sum(ch.isdigit() for ch in line.norm) < 2:
                continue
            key = "machineNo" if line.cx < midpoint else "moldNo"
            if fields[key]["value"] == UNKNOWN or line.confidence > fields[key]["confidence"]:
                fields[key] = _leaf(line.norm, line.confidence, line.text, label=HEADER_FIELD_LABELS[key])


def _fill_date_and_cavity(rows: list[list[_Line]], fields: dict[str, Any], first_quantity_cy: float, max_x: float) -> None:
    midpoint = max_x / 2 if max_x > 0 else float("inf")
    for row in rows:
        if row[0].cy >= first_quantity_cy:
            break
        row_text = "".join(line.norm for line in row)
        if "日期" in row_text and fields["productionDate"]["value"] == UNKNOWN:
            year = next((line for line in row if _ROC_YEAR_PATTERN.fullmatch(line.norm)), None)
            if year is not None:
                fields["productionDate"] = _leaf(
                    f"{year.norm}年", year.confidence, " ".join(line.text for line in row), label=HEADER_FIELD_LABELS["productionDate"]
                )
        if "穴" in row_text and fields["moldCavity"]["value"] == UNKNOWN:
            # 生產日期 and 模具穴數 share this printed row; the cavity cell is the
            # right half, so digits from the date cell must not leak in.
            right_side = [line for line in row if line.cx > midpoint]
            digits = [ch for line in right_side for ch in line.norm if ch.isdigit()]
            if len(digits) == 2:
                value = f"{digits[0]}模{digits[1]}穴"
                confidence = min(line.confidence for line in right_side if any(ch.isdigit() for ch in line.norm))
                fields["moldCavity"] = _leaf(
                    value, confidence, " ".join(line.text for line in right_side), label=HEADER_FIELD_LABELS["moldCavity"]
                )


def _fill_material_and_color(rows: list[list[_Line]], fields: dict[str, Any], last_quantity_cy: float, max_x: float) -> None:
    midpoint = max_x / 2 if max_x > 0 else float("inf")
    for row in rows:
        if row[0].cy <= last_quantity_cy:
            continue
        # A row carrying an L/R column marker is a (possibly half-garbled)
        # quantity row that slipped past detection — its stray "L" would
        # otherwise pass the material regex with high confidence.
        if any(normalize_text(line.text) in _L_MARKERS | _R_MARKERS for line in row):
            continue
        for line in row:
            if fields["material"]["value"] == UNKNOWN and line.cx < midpoint and re.fullmatch(r"[A-Z]{1,8}", line.norm):
                fields["material"] = _leaf(line.norm, line.confidence, line.text, label=HEADER_FIELD_LABELS["material"])
            if (
                fields["color"]["value"] == UNKNOWN
                and line.cx >= midpoint
                and _CJK_PATTERN.search(line.norm)
                and line.norm not in {"色", "顏色", "材質"}
            ):
                # Handwritten colors OCR unstably frame to frame (透明 has been
                # read as 明 and as a巴); publish only when the token snaps to a
                # known color name — anything else stays a blank cell.
                snapped = next((color for color in KNOWN_COLORS if line.norm in color or color in line.norm), None)
                if snapped is not None:
                    fields["color"] = _leaf(
                        snapped, line.confidence, line.text, label=HEADER_FIELD_LABELS["color"]
                    )
        if fields["material"]["value"] != UNKNOWN and fields["color"]["value"] != UNKNOWN:
            break


def _leaf(value: Any, confidence: float, raw_text: str, *, label: str | None = None) -> dict[str, Any]:
    leaf: dict[str, Any] = {"value": value, "confidence": round(confidence, 3), "rawText": raw_text}
    if label is not None:
        leaf["label"] = label
    return leaf
