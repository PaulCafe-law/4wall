from __future__ import annotations

from scripts import render_predeploy


class _Settings:
    @classmethod
    def from_env(cls):
        return cls()


def test_render_predeploy_returns_zero_when_upgrade_succeeds(monkeypatch) -> None:
    monkeypatch.setattr(render_predeploy.command, "upgrade", lambda config, revision: None)

    assert render_predeploy.main() == 0


def test_render_predeploy_allows_already_at_head_after_upgrade_error(monkeypatch) -> None:
    def fail_upgrade(config, revision):
        raise RuntimeError("simulated alembic failure")

    monkeypatch.setattr(render_predeploy.command, "upgrade", fail_upgrade)
    monkeypatch.setattr(render_predeploy.Settings, "from_env", _Settings.from_env)
    monkeypatch.setattr(render_predeploy, "_database_revision", lambda settings: "20260707_0014")
    monkeypatch.setattr(render_predeploy, "_script_heads", lambda config: {"20260707_0014"})

    assert render_predeploy.main() == 0


def test_render_predeploy_fails_when_database_is_not_at_head(monkeypatch) -> None:
    def fail_upgrade(config, revision):
        raise RuntimeError("simulated alembic failure")

    monkeypatch.setattr(render_predeploy.command, "upgrade", fail_upgrade)
    monkeypatch.setattr(render_predeploy.Settings, "from_env", _Settings.from_env)
    monkeypatch.setattr(render_predeploy, "_database_revision", lambda settings: "20260704_0013")
    monkeypatch.setattr(render_predeploy, "_script_heads", lambda config: {"20260707_0014"})

    assert render_predeploy.main() == 1
