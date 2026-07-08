from __future__ import annotations

import json

import pytest

from agent_worker.bridge import BridgeResult, FakeAgentBridge
from agent_worker.config import AgentConfig, AppConfig, DebugConfig, PlatformConfig
from agent_worker.job_source import PolledJob, parse_poll_payload
from agent_worker.main import FALLBACK_TEXT, TwinAgentRunner, build_agent_prompt, build_result_payload


def test_prompt_includes_world_tools_and_language_rule() -> None:
    job = {"jobId": "j1", "source": "line", "text": "HC600-01 現在溫度多少？", "siteSlug": "jingcheng"}
    world = {"entities": [{"id": "hc600-01", "type": "machine", "temperature": 61.2}]}
    ledger_context = {
        "available": True,
        "text": "HC600-01:計畫 500|實際 480 ⚠️",
        "planVsActual": [{"machineNo": "HC600-01", "plannedTotal": 500, "actualTotal": 480}],
    }

    prompt = build_agent_prompt(job, world, world_age_seconds=2.5, ledger_context=ledger_context)

    assert "SAME LANGUAGE" in prompt
    assert "ledger context" in prompt
    assert "plan-vs-actual reconciliation" in prompt
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
