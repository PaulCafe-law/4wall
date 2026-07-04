from __future__ import annotations

import sys

import numpy as np

from ocr_worker.config import GptConfig
from ocr_worker.hmi_analysis import build_structured_fields, classify_hmi_mode, raw_ocr_lines_payload
from ocr_worker.main import build_ocr_observation, recognize_scaled
from ocr_worker.ocr_engine import OcrTextLine
from ocr_worker.summarizer import GptSummarizer


def test_classifies_temperature_monitor_page() -> None:
    lines = [
        OcrTextLine(text="設定 一段 二段 三段 四段 五段 油溫", confidence=0.9),
        OcrTextLine(text="現在 99 180 180 182 180 39", confidence=0.88),
        OcrTextLine(text="加熱 保溫 高溫 低溫 TEMP", confidence=0.86),
    ]

    result = classify_hmi_mode(lines)

    assert result.mode == "temperature_monitor"
    assert result.confidence > 0.7
    assert "設定" in result.matched_keywords


def test_classifies_live_temperature_monitor_with_ocr_variant() -> None:
    for variant in ("权定中", "股定中", "设正"):
        lines = [
            OcrTextLine(text=variant, confidence=0.779),
            OcrTextLine(text="PC", confidence=0.833),
            OcrTextLine(text="国", confidence=0.042),
        ]

        result = classify_hmi_mode(lines)

        assert result.mode == "temperature_monitor"
        assert result.confidence > 0.0
        assert variant in result.matched_keywords


def test_classifies_machine_monitor_page() -> None:
    lines = [
        OcrTextLine(text="機器監視 模號 VR185HC 上模 67 秒", confidence=0.91),
        OcrTextLine(text="射出四段 壓力 0 Bar 速度 0 計時 37.7", confidence=0.89),
        OcrTextLine(text="操作 手動 停止 重切模 558.1 mm 螺桿 0.5 mm", confidence=0.85),
    ]

    result = classify_hmi_mode(lines)

    assert result.mode == "machine_monitor"
    assert result.confidence > 0.7
    assert "機器監視" in result.matched_keywords


def test_builds_ocr_observation_payload_with_unknown_summary() -> None:
    lines = [OcrTextLine(text="機器監視 壓力 0 Bar", confidence=0.9)]
    mode = classify_hmi_mode(lines)
    structured = build_structured_fields(
        mode_result=mode,
        hmi_lines=lines,
        field_readings=[],
        min_confidence=0.55,
    )

    payload = build_ocr_observation(
        captured_at="2026-07-04T10:00:00+08:00",
        mode=mode.mode,
        mode_confidence=mode.confidence,
        raw_lines=raw_ocr_lines_payload(lines, region="hmi"),
        structured_fields=structured,
        work_order_raw_text="HC600 FLJ2R02",
    )

    assert payload["source"] == "live"
    assert payload["mode"] == "machine_monitor"
    assert payload["summaryStatus"] == "unknown"
    assert payload["rawOcrLines"][0]["region"] == "hmi"
    assert payload["structuredFields"]["screen"]["kind"] == "machine_monitor"


def test_ocr_observation_payload_normalizes_human_text_to_traditional_chinese() -> None:
    payload = build_ocr_observation(
        captured_at="2026-07-04T10:00:00+08:00",
        mode="machine_monitor",
        mode_confidence=0.86,
        raw_lines=[
            {"text": "生产日期 预计总数 后处理", "confidence": 0.9, "box": None, "region": "work_order"}
        ],
        structured_fields={"operationMode": {"value": "手动生产"}},
        work_order_raw_text="HC600 生产日期 预计总数 后处理",
    )

    assert payload["rawOcrLines"][0]["text"] == "生產日期 預計總數 後處理"
    assert payload["structuredFields"]["operationMode"]["value"] == "手動生產"
    assert payload["workOrderRawText"] == "HC600 生產日期 預計總數 後處理"


def test_recognize_scaled_maps_boxes_back_to_original_coordinates() -> None:
    class FakeEngine:
        def recognize(self, image):
            assert image.shape[:2] == (30, 60)
            return [OcrTextLine("188", 0.9, box=[[30, 60], [90, 60], [90, 90], [30, 90]])]

    lines = recognize_scaled(FakeEngine(), np.zeros((10, 20, 3), dtype=np.uint8), scale=3.0)

    assert lines[0].box == [[10, 20], [30, 20], [30, 30], [10, 30]]


def test_gpt_summarizer_requires_account_auth_command_when_enabled() -> None:
    result = GptSummarizer(GptConfig(enabled=True, command=[])).summarize({"mode": "unknown"})

    assert result.status == "auth_required"
    assert result.error == "gpt_summary_command_missing"


def test_gpt_summarizer_accepts_json_from_command_bridge() -> None:
    command = [
        sys.executable,
        "-c",
        "import json,sys; json.load(sys.stdin); print(json.dumps({'summary':'ok','screenMode':'machine_monitor'}))",
    ]

    result = GptSummarizer(GptConfig(enabled=True, command=command)).summarize({"mode": "machine_monitor"})

    assert result.status == "ok"
    assert result.summary["summary"] == "ok"
    assert result.summary["screenMode"] == "machine_monitor"


def test_gpt_summarizer_normalizes_summary_to_traditional_chinese() -> None:
    command = [
        sys.executable,
        "-c",
        "import json,sys; json.load(sys.stdin); print(json.dumps({'summary':'HC600 生产中，预计后处理'}))",
    ]

    result = GptSummarizer(GptConfig(enabled=True, command=command)).summarize({"mode": "machine_monitor"})

    assert result.status == "ok"
    assert result.summary["summary"] == "HC600 生產中，預計後處理"


def test_gpt_summarizer_reuses_cached_summary_inside_min_interval() -> None:
    command = [
        sys.executable,
        "-c",
        "import json,sys; json.load(sys.stdin); print(json.dumps({'summary':'cached-source'}))",
    ]
    summarizer = GptSummarizer(GptConfig(enabled=True, command=command, min_interval_sec=300))

    first = summarizer.summarize({"mode": "machine_monitor"})
    second = summarizer.summarize({"mode": "machine_monitor"})

    assert first.status == "ok"
    assert second.status == "ok"
    assert second.summary["summary"] == "cached-source"
    assert second.summary["cached"] is True


def test_gpt_summarizer_does_not_reuse_cached_summary_for_different_payload() -> None:
    command = [
        sys.executable,
        "-c",
        "import json,sys; json.load(sys.stdin); print(json.dumps({'summary':'first'}))",
    ]
    summarizer = GptSummarizer(GptConfig(enabled=True, command=command, min_interval_sec=300))

    first = summarizer.summarize({"mode": "machine_monitor", "workOrderRawText": "HC600"})
    second = summarizer.summarize({"mode": "machine_monitor", "workOrderRawText": "HC700"})

    assert first.status == "ok"
    assert second.status == "unknown"
    assert second.error == "gpt_summary_rate_limited"
    assert second.summary == {}


def test_gpt_summarizer_strips_llm_api_key_env_from_command_bridge(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-should-not-reach-child")
    command = [
        sys.executable,
        "-c",
        "import os,sys; sys.stdin.read(); print('present' if os.getenv('OPENAI_API_KEY') else 'missing')",
    ]

    result = GptSummarizer(GptConfig(enabled=True, command=command)).summarize({"mode": "machine_monitor"})

    assert result.status == "ok"
    assert result.summary["summary"] == "missing"
