from __future__ import annotations

from pathlib import Path

import numpy as np

from ocr_worker.config import load_config
from ocr_worker.main import HmiOcrRunner
from ocr_worker.ocr_engine import OcrTextLine
from ocr_worker.work_order import build_work_order_fields


def _line(text: str, confidence: float, x: float, y: float) -> OcrTextLine:
    return OcrTextLine(text=text, confidence=confidence, box=[[x, y], [x + 30, y], [x + 30, y + 12], [x, y + 12]])


# Real PaddleOCR output captured from the deployed nckusoc worker on 2026-07-05
# (2880x1620 main stream, 619x377 work-order crop). Printed labels are garbled;
# geometry and the L/R markers carry the structure.
REAL_LINES = [
    _line("no", 0.46, 233, 9),
    _line("建從", 0.46, 56, 47),
    _line("88", 0.55, 199, 46),
    _line("188.8", 0.62, 221, 44),
    _line("F", 0.29, 468, 45),
    _line("西大總副站", 0.28, 60, 60),
    _line("新國#", 0.10, 61, 71),
    _line("報臺拍號", 0.47, 69, 113),
    _line("HC600", 0.82, 161, 113),
    _line("擬其號", 0.41, 376, 110),
    _line("GM096LC", 0.78, 464, 118),
    _line("生日期", 0.88, 71, 151),
    _line("115", 0.90, 165, 150),
    _line("平", 0.72, 212, 150),
    _line("兒", 0.60, 262, 150),
    _line("口", 0.32, 311, 150),
    _line("以穴", 0.69, 385, 146),
    _line("1", 0.97, 487, 151),
    _line("積", 0.23, 511, 151),
    _line("2穴", 0.77, 554, 150),
    _line("慎計生生款", 0.44, 65, 182),
    _line("L", 0.99, 152, 184),
    _line("1uwr2", 0.42, 276, 182),
    _line("rcs", 0.49, 318, 190),
    _line("R", 0.99, 361, 183),
    _line("20", 0.86, 441, 189),
    _line("10Y", 0.43, 484, 181),
    _line("(有）", 0.59, 77, 199),
    _line("200", 0.96, 220, 191),
    _line("1s", 0.59, 549, 192),
    _line("計生正款", 0.72, 64, 220),
    _line("L", 1.00, 152, 221),
    _line("PCS", 0.79, 317, 229),
    _line("R", 1.00, 361, 221),
    _line("(、）", 0.47, 61, 237),
    _line("1Cs", 0.57, 548, 230),
    _line("預計生產款", 0.59, 64, 255),
    _line("|L", 0.87, 150, 257),
    _line("10", 1.00, 226, 267),
    _line("rs", 0.73, 315, 265),
    _line("R", 0.99, 359, 258),
    _line("10", 0.95, 444, 260),
    _line("（川）", 0.46, 77, 272),
    _line("res", 0.79, 546, 265),
    _line("總計", 0.77, 82, 298),
    _line("|L", 0.94, 148, 295),
    _line("210", 0.95, 219, 301),
    _line("Ics", 0.51, 312, 301),
    _line("|R", 0.69, 355, 295),
    _line("210", 0.97, 434, 298),
    _line("rcs", 0.66, 544, 304),
    _line("行", 0.56, 90, 338),
    _line("PC", 0.85, 200, 333),
    _line("色", 0.76, 391, 336),
    _line("明", 0.99, 476, 329),
]


def test_real_sheet_header_codes() -> None:
    result = build_work_order_fields(REAL_LINES)
    assert result["fields"]["machineNo"]["value"] == "HC600"
    assert result["fields"]["moldNo"]["value"] == "GM096LC"


def test_real_sheet_quantities_positional_mapping() -> None:
    q = build_work_order_fields(REAL_LINES)["quantities"]
    # Row 1: both cells contain digit-bearing pen-stroke noise ("1uwr2" next to
    # the L 200; "20"+"10Y" split handwriting on R) -> honest unknown, never a
    # confidently wrong number.
    assert q["plannedShift"]["left"]["value"] == "unknown"
    assert "200" in q["plannedShift"]["left"]["rawText"]
    assert q["plannedShift"]["right"]["value"] == "unknown"
    # Row 2 is blank on the sheet.
    assert q["plannedCumulative"]["left"]["value"] == "unknown"
    assert q["plannedCumulative"]["right"]["value"] == "unknown"
    # Rows 3-4 are clean.
    assert q["producedCumulative"]["left"]["value"] == 10
    assert q["producedCumulative"]["right"]["value"] == 10
    assert q["total"]["left"]["value"] == 210
    assert q["total"]["right"]["value"] == 210


def test_real_sheet_date_cavity_material_color() -> None:
    fields = build_work_order_fields(REAL_LINES)["fields"]
    assert fields["productionDate"]["value"] == "115年"
    assert fields["moldCavity"]["value"] == "1模2穴"
    assert fields["material"]["value"] == "PC"
    # 透 is occluded by the ruler; the lone 明 snaps to the known color 透明.
    assert fields["color"]["value"] == "透明"
    assert fields["color"]["rawText"] == "明"


def test_fields_outside_roi_stay_unknown() -> None:
    fields = build_work_order_fields(REAL_LINES)["fields"]
    for key in ("packaging", "shipDate", "remark"):
        assert fields[key]["value"] == "unknown"


def test_empty_lines_produce_full_unknown_schema() -> None:
    result = build_work_order_fields([])
    assert result["template"] == "hc600_dispatch_sheet_v1"
    assert result["sourceLineCount"] == 0
    assert all(field["value"] == "unknown" for field in result["fields"].values())
    for row in result["quantities"].values():
        assert row["left"]["value"] == "unknown"
        assert row["right"]["value"] == "unknown"


def test_material_never_captures_stray_marker_when_total_row_marker_garbles() -> None:
    # If the total row's weak '|R' (conf 0.69) misreads, that row falls out of
    # quantity detection — its leftover '|L' must not become the material value.
    lines = [
        _line("1R", 0.69, 355, 295) if (line.text == "|R" and line.box[0][1] == 295) else line
        for line in REAL_LINES
    ]
    fields = build_work_order_fields(lines)["fields"]
    assert fields["material"]["value"] == "PC"
    assert fields["material"]["value"] != "L"


def test_color_publishes_only_when_it_snaps_to_a_known_color() -> None:
    # Live frames have OCR'd the half-occluded 透明 as "a巴"; raw garble must
    # never be published as the product color.
    lines = [
        _line("a巴", 0.62, 476, 329) if (line.text == "明") else line
        for line in REAL_LINES
    ]
    fields = build_work_order_fields(lines)["fields"]
    assert fields["color"]["value"] == "unknown"


def test_material_and_color_degrade_to_unknown_without_quantity_anchor() -> None:
    # All eight L/R markers garbled (glare frame): the scan region loses its
    # anchor, so material/color must degrade instead of grabbing header garble.
    markers = {"L", "|L", "R", "|R"}
    lines = [
        _line("X", line.confidence, line.box[0][0], line.box[0][1]) if line.text in markers else line
        for line in REAL_LINES
    ]
    fields = build_work_order_fields(lines)["fields"]
    assert fields["material"]["value"] == "unknown"
    assert fields["color"]["value"] == "unknown"


def _quantity_grid(row_extras: dict[int, list]) -> list[OcrTextLine]:
    lines: list[OcrTextLine] = []
    for index, y in enumerate((180, 220, 255, 295)):
        lines.append(_line("款", 0.5, 60, y))
        lines.append(_line("L", 0.99, 152, y))
        lines.append(_line("R", 0.99, 361, y))
        lines.extend(row_extras.get(index, []))
    return lines


def test_two_clean_numbers_in_one_cell_degrade_to_unknown() -> None:
    # Operator corrections leave two legible numbers in one cell; reporting
    # either one confidently would be a lie.
    lines = _quantity_grid({0: [_line("30", 0.95, 200, 180), _line("40", 0.95, 260, 180)]})
    cell = build_work_order_fields(lines)["quantities"]["plannedShift"]["left"]
    assert cell["value"] == "unknown"
    assert "30" in cell["rawText"] and "40" in cell["rawText"]


def test_asymmetric_values_map_to_their_own_sides_and_label_digits_stay_out() -> None:
    # 90/60 like the real sheet; the digit inside the printed label (第3款)
    # sits left of the L marker and must never poison the L cell.
    lines = _quantity_grid(
        {
            2: [
                _line("第3款", 0.4, 60, 256),
                _line("90", 0.95, 220, 255),
                _line("60", 0.94, 440, 255),
            ]
        }
    )
    row = build_work_order_fields(lines)["quantities"]["producedCumulative"]
    assert row["left"]["value"] == 90
    assert row["right"]["value"] == 60


def test_output_schema_contract_required_by_web_parser() -> None:
    # web-app/src/lib/work-order.ts silently drops rows/leaves missing these
    # keys — pin the producer shape so a refactor cannot break the UI quietly.
    for result in (build_work_order_fields(REAL_LINES), build_work_order_fields([])):
        assert result["template"].startswith("hc600_dispatch_sheet")
        assert isinstance(result["unit"], str)
        assert isinstance(result["sourceLineCount"], int)
        for row in result["quantities"].values():
            assert isinstance(row["label"], str) and row["label"]
            for side in ("left", "right"):
                leaf = row[side]
                assert isinstance(leaf["confidence"], (int, float))
                assert isinstance(leaf["rawText"], str)
                assert isinstance(leaf["value"], (int, str))
        for leaf in result["fields"].values():
            assert isinstance(leaf["label"], str) and leaf["label"]
            assert isinstance(leaf["confidence"], (int, float))
            assert isinstance(leaf["rawText"], str)


def test_missing_quantity_rows_only_trusts_total_label() -> None:
    lines = [
        _line("總計", 0.9, 82, 298),
        _line("L", 0.99, 148, 295),
        _line("210", 0.95, 219, 301),
        _line("R", 0.99, 355, 295),
        _line("210", 0.97, 434, 298),
        # A second quantity row without a legible label.
        _line("??款", 0.3, 64, 182),
        _line("L", 0.99, 152, 184),
        _line("55", 0.9, 220, 191),
        _line("R", 0.99, 361, 183),
    ]
    q = build_work_order_fields(lines)["quantities"]
    assert q["total"]["left"]["value"] == 210
    assert q["total"]["right"]["value"] == 210
    # Two rows found but schema expects four -> non-total rows stay unknown.
    assert q["plannedShift"]["left"]["value"] == "unknown"
    assert q["producedCumulative"]["left"]["value"] == "unknown"


class _SheetOnlyEngine:
    """Returns the captured sheet lines for the work-order crop, nothing else."""

    def recognize(self, image):
        height, width = image.shape[:2]
        if width >= 600:
            return list(REAL_LINES)
        return []


def test_runner_attaches_structured_work_order_to_published_observation(tmp_path: Path) -> None:
    # Pins the main.py wiring: without this, the workOrder key could be
    # un-wired (or renamed) with every other test still green and both UIs
    # silently falling back to the raw-text blob.
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        "\n".join(
            [
                "frame_source:",
                "  mode: file",
                "  path: unused.jpg",
                "platform:",
                "  enabled: false",
                "ocr:",
                "  engine: paddle",
                "  lang: chinese_cht",
                "  ocr_version: PP-OCRv5",
                "  device: cpu",
                "  min_confidence: 0.55",
                "hmi:",
                "  camera_label: test-camera",
                "  detector_name: test_detector",
                "  roi: [0, 0, 0, 0]",
                "  fields: []",
                "work_order:",
                "  enabled: true",
                "  roi: [0, 0, 0, 0]",
                "gpt:",
                "  enabled: false",
                "debug:",
                "  runtime_dir: runtime",
                "  save_crops: false",
            ]
        ),
        encoding="utf-8",
    )
    config = load_config(config_path)
    runner = HmiOcrRunner(config, publish=False, engine=_SheetOnlyEngine())

    result = runner.process_frame(np.zeros((377, 619, 3), dtype=np.uint8), frame_name="test")

    sheet = result["ocrObservation"]["structuredFields"]["workOrder"]
    assert sheet["template"] == "hc600_dispatch_sheet_v1"
    assert sheet["fields"]["machineNo"]["value"] == "HC600"
    assert sheet["quantities"]["total"]["left"]["value"] == 210
    assert sheet["quantities"]["total"]["right"]["value"] == 210


def test_runner_omits_work_order_key_when_disabled(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        "\n".join(
            [
                "frame_source:",
                "  mode: file",
                "  path: unused.jpg",
                "platform:",
                "  enabled: false",
                "ocr:",
                "  engine: paddle",
                "  lang: chinese_cht",
                "  ocr_version: PP-OCRv5",
                "  device: cpu",
                "  min_confidence: 0.55",
                "hmi:",
                "  camera_label: test-camera",
                "  detector_name: test_detector",
                "  roi: [0, 0, 0, 0]",
                "  fields: []",
                "work_order:",
                "  enabled: false",
                "gpt:",
                "  enabled: false",
                "debug:",
                "  runtime_dir: runtime",
                "  save_crops: false",
            ]
        ),
        encoding="utf-8",
    )
    config = load_config(config_path)
    runner = HmiOcrRunner(config, publish=False, engine=_SheetOnlyEngine())

    result = runner.process_frame(np.zeros((377, 619, 3), dtype=np.uint8), frame_name="test")

    assert "workOrder" not in result["ocrObservation"]["structuredFields"]
