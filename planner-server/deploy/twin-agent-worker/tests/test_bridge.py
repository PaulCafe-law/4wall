from __future__ import annotations

import sys
from pathlib import Path

from agent_worker.bridge import AgentBridge, _command_env
from agent_worker.config import AgentConfig


def test_bridge_requires_command() -> None:
    result = AgentBridge(AgentConfig(command=[])).run("hello")

    assert result.status == "auth_required"
    assert result.error == "agent_command_missing"


def test_bridge_requires_auth_cache_dir_when_configured(tmp_path: Path) -> None:
    config = AgentConfig(command=[sys.executable, "-c", "print()"], auth_cache_dir=tmp_path / "missing-cache")

    result = AgentBridge(config).run("hello")

    assert result.status == "auth_required"
    assert result.error == "agent_auth_cache_dir_missing"


def test_bridge_missing_binary_is_auth_required(tmp_path: Path) -> None:
    result = AgentBridge(AgentConfig(command=[str(tmp_path / "no-such-bridge.exe")])).run("hello")

    assert result.status == "auth_required"
    assert result.error.startswith("agent_command_not_found:")


def test_bridge_parses_strict_json_reply(tmp_path: Path) -> None:
    script = _write_script(
        tmp_path,
        """
import json, sys
payload = json.load(sys.stdin)
print(json.dumps({"text": "model=" + payload["model"], "toolCalls": [{"name": "clear_overlays", "arguments": {}}]}))
""",
    )
    config = AgentConfig(model="gpt-5", command=[sys.executable, str(script)])

    result = AgentBridge(config).run("hello")

    assert result.status == "ok"
    assert result.text == "model=gpt-5"
    assert result.tool_calls == [{"name": "clear_overlays", "arguments": {}}]


def test_bridge_substitutes_model_and_scrubs_sensitive_env(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-secret")
    script = _write_script(
        tmp_path,
        """
import json, os, sys
print(json.dumps({"text": sys.argv[1] + ":" + os.environ.get("OPENAI_API_KEY", "scrubbed"), "toolCalls": []}))
""",
    )
    config = AgentConfig(model="o4", command=[sys.executable, str(script), "{model}"])

    result = AgentBridge(config).run("hello")

    assert result.status == "ok"
    assert result.text == "o4:scrubbed"


def test_command_env_scrubs_worker_token_and_api_key_suffix(monkeypatch) -> None:
    monkeypatch.setenv("TWIN_AGENT_WORKER_TOKEN", "fwtwin_secret")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-listed")
    monkeypatch.setenv("SOME_VENDOR_API_KEY", "sk-suffix")
    monkeypatch.setenv("another_api_key", "sk-lowercase")
    monkeypatch.setenv("TWIN_AGENT_HARMLESS", "keep-me")

    env = _command_env(AgentConfig(model="gpt-5"))

    assert "TWIN_AGENT_WORKER_TOKEN" not in env
    assert "OPENAI_API_KEY" not in env
    assert "SOME_VENDOR_API_KEY" not in env
    assert "another_api_key" not in env
    assert env["TWIN_AGENT_HARMLESS"] == "keep-me"
    assert env["TWIN_AGENT_MODEL"] == "gpt-5"


def test_bridge_maps_auth_stderr_to_auth_required(tmp_path: Path) -> None:
    script = _write_script(
        tmp_path,
        """
import sys
sys.stderr.write("please run codex login first")
raise SystemExit(3)
""",
    )

    result = AgentBridge(AgentConfig(command=[sys.executable, str(script)])).run("hello")

    assert result.status == "auth_required"
    assert "login" in result.error


def test_bridge_maps_other_stderr_to_failed(tmp_path: Path) -> None:
    script = _write_script(
        tmp_path,
        """
import sys
sys.stderr.write("boom")
raise SystemExit(3)
""",
    )

    result = AgentBridge(AgentConfig(command=[sys.executable, str(script)])).run("hello")

    assert result.status == "failed"
    assert result.error == "boom"


def test_bridge_empty_output_is_failed(tmp_path: Path) -> None:
    script = _write_script(tmp_path, "raise SystemExit(0)")

    result = AgentBridge(AgentConfig(command=[sys.executable, str(script)])).run("hello")

    assert result.status == "failed"
    assert result.error == "agent_empty_output"


def test_bridge_wraps_non_json_stdout_as_text(tmp_path: Path) -> None:
    script = _write_script(tmp_path, 'print("plain text answer")')

    result = AgentBridge(AgentConfig(command=[sys.executable, str(script)])).run("hello")

    assert result.status == "ok"
    assert result.text == "plain text answer"
    assert result.tool_calls == []


def test_bridge_timeout_is_failed(tmp_path: Path) -> None:
    script = _write_script(
        tmp_path,
        """
import time
time.sleep(5)
""",
    )
    config = AgentConfig(command=[sys.executable, str(script)], timeout_sec=0.5)

    result = AgentBridge(config).run("hello")

    assert result.status == "failed"
    assert result.error == "agent_timeout"


def _write_script(tmp_path: Path, body: str) -> Path:
    script = tmp_path / "echo_bridge.py"
    script.write_text(body.strip() + "\n", encoding="utf-8")
    return script
