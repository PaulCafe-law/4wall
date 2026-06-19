from __future__ import annotations

import tarfile

import pytest

from scripts.deploy_camera_agent_to_pi import (
    DEFAULT_REMOTE_ROOT,
    PiDeployConfig,
    build_command_plan,
    create_bundle,
    format_step,
    validate_config,
)


def test_create_bundle_contains_only_pi_agent_files(tmp_path) -> None:
    bundle_path = create_bundle(tmp_path / "bundle.tgz")

    with tarfile.open(bundle_path, "r:gz") as archive:
        names = set(archive.getnames())

    assert names == {
        "scripts/camera_agent.py",
        "deploy/pi-camera-agent/install.sh",
        "deploy/pi-camera-agent/fourwall-camera-agent.service",
        "deploy/pi-camera-agent/fourwall-camera-agent.env.example",
    }


def test_build_command_plan_deploys_env_without_printing_secret_values(tmp_path) -> None:
    env_file = tmp_path / "fourwall-camera-agent.env"
    env_file.write_text(
        "\n".join(
            [
                "CAMERA_AGENT_DEVICE_TOKEN=fwcam_secret_device_token",
                "CAMERA_AGENT_RTSP_URL=rtsp:/" + "/user:pass@192.168.1.31/stream",
            ]
        ),
        encoding="utf-8",
    )
    config = PiDeployConfig(
        host="192.168.1.100",
        user="pi",
        port=22,
        remote_root=DEFAULT_REMOTE_ROOT,
        env_file=env_file,
        install_packages=True,
        run_doctor=True,
        run_once=True,
        start_service=True,
        dry_run=True,
    )

    rendered = "\n".join(format_step(step) for step in build_command_plan(config, bundle_path=tmp_path / "bundle.tgz"))

    assert "pi@192.168.1.100" in rendered
    assert "/tmp/fourwall-camera-agent-bundle.tgz" in rendered
    assert "umask 077; cat > /tmp/fourwall-camera-agent.env" in rendered
    assert "/etc/fourwall-camera-agent.env" in rendered
    assert "camera_agent.py --doctor --json" in rendered
    assert "camera_agent.py --once" in rendered
    assert "systemctl start fourwall-camera-agent" in rendered
    assert "fwcam_secret_device_token" not in rendered
    assert "user:pass" not in rendered


def test_validate_config_rejects_remote_root_that_would_not_match_systemd_unit(tmp_path) -> None:
    config = PiDeployConfig(
        host="192.168.1.100",
        user=None,
        port=22,
        remote_root="/srv/fourwall",
        env_file=None,
        install_packages=False,
        run_doctor=False,
        run_once=False,
        start_service=False,
        dry_run=True,
    )

    with pytest.raises(SystemExit, match="remote_root_must_match_systemd_unit"):
        validate_config(config)
