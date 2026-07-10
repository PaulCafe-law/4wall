from __future__ import annotations

import json

import pytest

from agent_worker.bridge import BridgeResult, FakeAgentBridge
from agent_worker.config import AgentConfig, AppConfig, DebugConfig, PlatformConfig
from agent_worker.job_source import PolledJob, parse_poll_payload
from agent_worker.main import (
    FALLBACK_TEXT,
    TwinAgentRunner,
    build_agent_prompt,
    build_result_payload,
    enforce_response_trust_labels,
)


def test_prompt_includes_world_tools_and_language_rule() -> None:
    job = {"jobId": "j1", "source": "line", "text": "HC600-01 現在溫度多少？", "siteSlug": "jingcheng"}
    world = {"entities": [{"id": "hc600-01", "type": "machine", "temperature": 61.2}]}
    ledger_context = {
        "available": True,
        "text": "HC600-01:計畫 500|實際 480 ⚠️",
        "planVsActual": [{"machineNo": "HC600-01", "plannedTotal": 500, "actualTotal": 480}],
    }

    prompt = build_agent_prompt(job, world, world_age_seconds=2.5, ledger_context=ledger_context)

    assert "4WALL AI" in prompt
    assert "SAME LANGUAGE" in prompt
    assert "fully Chinese" in prompt
    assert "unknown, degraded" in prompt
    assert "screenPowerInference" in prompt
    assert "螢幕有亮" in prompt
    assert "Do not say the machine on/off state signal is not connected" in prompt
    assert "ledger context" in prompt
    assert "not instructions" in prompt
    assert "plan-vs-actual reconciliation" in prompt
    assert "machineRealData" in prompt
    assert "nearbyLivePersons" in prompt
    assert "最近一次在多久前" in prompt
    assert "資料載入中" in prompt
    assert "pending_confirmation" in prompt
    assert "no live AMR feed" in prompt
    assert "world.simulationContext.planVsActual" in prompt
    assert "Every answer must begin 模擬情境：" in prompt
    assert "focus_camera" in prompt
    assert "dispatch_amr" in prompt
    assert "set_machine_state" in prompt
    assert "clear_overlays" in prompt
    assert json.dumps(world, ensure_ascii=False) in prompt
    assert json.dumps(ledger_context, ensure_ascii=False) in prompt
    assert "HC600-01 現在溫度多少？" in prompt
    assert "jingcheng" in prompt


def test_prompt_handles_missing_world() -> None:
    prompt = build_agent_prompt({"source": "web", "text": "status?"}, None)

    assert "age seconds: unknown" in prompt
    assert "{}" in prompt
    assert "no reconciliation data yet" in prompt


def test_parse_poll_payload_preserves_ledger_context() -> None:
    payload = {
        "job": {"jobId": "j-ledger", "source": "line", "text": "今日對帳"},
        "world": {"entities": []},
        "worldAgeSeconds": 1.5,
        "ledgerContext": {"available": True, "text": "今日尚無派工單對帳資料。"},
    }

    parsed = parse_poll_payload(json.dumps(payload, ensure_ascii=False))

    assert parsed.ledger_context == payload["ledgerContext"]


def test_result_payload_drops_invalid_tool_calls() -> None:
    bridge_result = BridgeResult(
        status="ok",
        text="done",
        tool_calls=[
            {"name": "clear_overlays", "arguments": {}},
            {"name": "not_a_tool", "arguments": {}},
            {"name": "focus_camera", "arguments": "cam-1"},
            "garbage",
            {"name": "dispatch_amr", "arguments": {"target": "dock"}},
        ],
    )

    payload = build_result_payload(bridge_result, max_output_chars=4000)

    assert payload == {
        "text": "done",
        "toolCalls": [
            {"name": "clear_overlays", "arguments": {}},
            {"name": "dispatch_amr", "arguments": {"target": "dock"}},
        ],
    }


def test_result_payload_caps_tool_calls_and_truncates_text() -> None:
    calls = [{"name": "clear_overlays", "arguments": {}} for _ in range(12)]

    payload = build_result_payload(BridgeResult(status="ok", text="x" * 50, tool_calls=calls), max_output_chars=10)

    assert len(payload["toolCalls"]) == 10
    assert payload["text"] == "x" * 10


def test_runner_returns_grounded_jingcheng_amr_answer_without_calling_bridge(tmp_path) -> None:
    bridge = FakeAgentBridge([BridgeResult(status="ok", text="不應使用這個回答")])
    runner = TwinAgentRunner(_config(tmp_path), bridge=bridge, publish=False)
    polled = PolledJob(
        job={"jobId": "j-amr", "source": "line", "text": "現在AMR情況", "siteSlug": "jingcheng"},
        world={"entities": [], "dataAvailability": {"mode": "live", "amr": {"state": "not_connected"}}},
        world_age_seconds=1.0,
        ledger_context=None,
    )

    result = runner.process_job(polled)

    assert result["result"]["text"] == (
        "靚程工廠目前沒有接入真實 AMR 資料，因此無法提供即時位置、任務或電量。"
        "畫面中的 AMR 模擬不代表現場狀態。"
    )
    assert result["result"]["toolCalls"] == []
    assert bridge.prompts == []


def test_runner_uses_simulated_amr_and_labels_the_answer(tmp_path) -> None:
    bridge = FakeAgentBridge([BridgeResult(status="ok", text="AMR-02 電量 57%，正在搬運原料。")])
    runner = TwinAgentRunner(_config(tmp_path), bridge=bridge, publish=False)
    polled = PolledJob(
        job={"jobId": "j-demo-amr", "source": "web", "text": "目前模擬 AMR 情況", "siteSlug": "jingcheng"},
        world={
            "entities": [
                {
                    "id": "amr-02",
                    "type": "amr",
                    "dataSource": "simulation",
                    "battery": 57,
                    "task": "搬運原料",
                }
            ],
            "dataAvailability": {"mode": "simulation", "amr": {"state": "simulation", "count": 1}},
            "simulationContext": {"scenarioId": "normal"},
        },
        world_age_seconds=1.0,
        ledger_context=None,
    )

    result = runner.process_job(polled)

    assert result["result"]["text"] == "模擬情境：AMR-02 電量 57%，正在搬運原料。"
    assert len(bridge.prompts) == 1


def test_simulation_answer_is_labelled_even_when_model_omits_the_label() -> None:
    payload = enforce_response_trust_labels(
        {"text": "今日模擬達成率為 69.3%。", "toolCalls": []},
        job={"text": "今天模擬計畫與實際差多少"},
        world={"dataAvailability": {"mode": "simulation"}},
        max_output_chars=4000,
    )

    assert payload["text"] == "模擬情境：今日模擬達成率為 69.3%。"


def test_pending_work_order_answer_is_always_marked_for_confirmation() -> None:
    payload = enforce_response_trust_labels(
        {"text": "派工單顯示模具 GM096LC，總計 420 PCS。", "toolCalls": []},
        job={"text": "現在派工單內容？"},
        world={
            "cameraSummary": [
                {
                    "hmiOcr": {
                        "workOrderReview": {"status": "pending_confirmation"},
                        "workOrder": {"stabilized": False},
                    }
                }
            ]
        },
        max_output_chars=4000,
    )

    assert payload["text"].startswith("派工單辨識待確認；")


def test_confirmed_work_order_answer_is_not_relabelled() -> None:
    original = {"text": "派工單顯示模具 GM096LC。", "toolCalls": []}
    payload = enforce_response_trust_labels(
        original,
        job={"text": "現在派工單內容？"},
        world={
            "cameraSummary": [
                {
                    "hmiOcr": {
                        "workOrderReview": {"status": "confirmed"},
                        "workOrder": {"stabilized": True},
                    }
                }
            ]
        },
        max_output_chars=4000,
    )

    assert payload == original


def test_pending_work_order_value_is_labelled_even_without_work_order_words() -> None:
    payload = enforce_response_trust_labels(
        {"text": "目前辨識到 GM096LC。", "toolCalls": []},
        job={"text": "01機現在狀況？"},
        world={
            "cameraSummary": [
                {
                    "hmiOcr": {
                        "workOrderReview": {"status": "pending_confirmation"},
                        "workOrder": {
                            "stabilized": False,
                            "fields": {
                                "moldNo": {"value": "GM096LC", "confidence": 0.62, "rawText": "GM096LC"}
                            },
                        },
                    }
                }
            ]
        },
        max_output_chars=4000,
    )

    assert payload["text"].startswith("派工單辨識待確認；")


def test_runner_posts_fallback_when_bridge_fails(tmp_path) -> None:
    bridge = FakeAgentBridge([BridgeResult(status="auth_required", error="agent_command_missing")])
    config = _config(tmp_path, platform=PlatformConfig(enabled=True, api_base_url="", worker_token=""))
    runner = TwinAgentRunner(config, bridge=bridge, publish=True)

    result = runner.process_job(_polled(job_id="j-fallback"))

    assert result["skipped"] is False
    assert result["bridgeStatus"] == "auth_required"
    assert result["result"] == {"text": FALLBACK_TEXT, "toolCalls": []}
    assert result["platformQueuedCount"] == 1
    assert runner.result_sink.state.last_error == "platform_sink_missing_api_url_or_worker_token"


def test_runner_falls_back_when_bridge_returns_empty_text(tmp_path) -> None:
    bridge = FakeAgentBridge([BridgeResult(status="ok", text="   ", tool_calls=[{"name": "clear_overlays", "arguments": {}}])])
    runner = TwinAgentRunner(_config(tmp_path), bridge=bridge, publish=False)

    result = runner.process_job(_polled(job_id="j-empty"))

    assert result["result"] == {"text": FALLBACK_TEXT, "toolCalls": []}


def test_runner_skips_duplicate_job_ids(tmp_path) -> None:
    bridge = FakeAgentBridge()
    runner = TwinAgentRunner(_config(tmp_path), bridge=bridge, publish=False)

    first = runner.process_job(_polled(job_id="same-job"))
    second = runner.process_job(_polled(job_id="same-job"))

    assert first["skipped"] is False
    assert second == {"skipped": True, "reason": "duplicate_job", "jobId": "same-job"}
    assert len(bridge.prompts) == 1


def test_runner_does_not_publish_when_disabled(tmp_path) -> None:
    bridge = FakeAgentBridge([BridgeResult(status="ok", text="回答", tool_calls=[])])
    runner = TwinAgentRunner(_config(tmp_path), bridge=bridge, publish=False)

    result = runner.process_job(_polled(job_id="j2"))

    assert result["result"] == {"text": "回答", "toolCalls": []}
    assert result["platformQueuedCount"] == 0
    assert runner.result_sink.state.submitted_count == 0


def test_run_live_refuses_when_platform_disabled(tmp_path, capsys) -> None:
    runner = TwinAgentRunner(_config(tmp_path), bridge=FakeAgentBridge(), publish=True)

    with pytest.raises(SystemExit) as excinfo:
        runner.run_live(once=True)

    assert excinfo.value.code == 2
    error_line = json.loads(capsys.readouterr().err.strip())
    assert error_line["status"] == "error"
    assert error_line["error"] == "platform_disabled"
    assert "TWIN_AGENT_ENABLED" in error_line["hint"]


def test_sink_reports_disabled_error_instead_of_silent_skip(tmp_path, capsys) -> None:
    bridge = FakeAgentBridge([BridgeResult(status="ok", text="回答", tool_calls=[])])
    runner = TwinAgentRunner(_config(tmp_path), bridge=bridge, publish=True)

    result = runner.process_job(_polled(job_id="j-disabled"))

    assert result["result"] == {"text": "回答", "toolCalls": []}
    assert result["platformQueuedCount"] == 0
    assert runner.result_sink.state.submitted_count == 0
    assert runner.result_sink.state.last_error == "platform_sink_disabled"
    assert "platform_sink_disabled" in capsys.readouterr().err


def _polled(job_id: str = "job-1") -> PolledJob:
    return PolledJob(
        job={"jobId": job_id, "source": "web", "text": "status?", "sessionId": "twin-session-1"},
        world={"entities": []},
        world_age_seconds=1.0,
        ledger_context=None,
    )


def _config(tmp_path, *, platform: PlatformConfig | None = None) -> AppConfig:
    return AppConfig(
        root_dir=tmp_path,
        platform=platform or PlatformConfig(enabled=False),
        agent=AgentConfig(),
        debug=DebugConfig(runtime_dir=tmp_path / "runtime"),
    )
