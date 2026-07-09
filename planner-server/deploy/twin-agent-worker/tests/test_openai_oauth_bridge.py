from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path


BRIDGE_PATH = Path(__file__).parents[1] / "scripts" / "openai_oauth_bridge.py"
SPEC = importlib.util.spec_from_file_location("openai_oauth_bridge", BRIDGE_PATH)
assert SPEC is not None and SPEC.loader is not None
oauth_bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(oauth_bridge)


def test_path_codex_uses_supported_node_when_available(monkeypatch, tmp_path: Path) -> None:
    supported_node = tmp_path / "node"
    supported_node.write_text("", encoding="utf-8")
    monkeypatch.setattr(oauth_bridge, "DEFAULT_NODE", supported_node)
    monkeypatch.setattr(oauth_bridge.shutil, "which", lambda command: "/usr/local/bin/codex")

    command, node_bin, error = oauth_bridge._resolve_codex_command(
        argparse.Namespace(codex_cli="", node="")
    )

    assert command == ["/usr/local/bin/codex"]
    assert node_bin == str(supported_node.parent)
    assert error == ""
