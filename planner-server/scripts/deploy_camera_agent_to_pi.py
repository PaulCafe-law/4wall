from __future__ import annotations

import argparse
from dataclasses import dataclass
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tarfile
import tempfile
from typing import Sequence


PLANNER_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PI_HOST = "192.168.1.100"
DEFAULT_REMOTE_ROOT = "/opt/fourwall"
REMOTE_BUNDLE_PATH = "/tmp/fourwall-camera-agent-bundle.tgz"
REMOTE_ENV_PATH = "/tmp/fourwall-camera-agent.env"

BUNDLE_FILES = (
    ("scripts/camera_agent.py", "scripts/camera_agent.py"),
    ("deploy/pi-camera-agent/install.sh", "deploy/pi-camera-agent/install.sh"),
    ("deploy/pi-camera-agent/fourwall-camera-agent.service", "deploy/pi-camera-agent/fourwall-camera-agent.service"),
    (
        "deploy/pi-camera-agent/fourwall-camera-agent.env.example",
        "deploy/pi-camera-agent/fourwall-camera-agent.env.example",
    ),
)


@dataclass(frozen=True)
class PiDeployConfig:
    host: str
    user: str | None
    port: int
    remote_root: str
    env_file: Path | None
    install_packages: bool
    run_doctor: bool
    run_once: bool
    start_service: bool
    dry_run: bool


@dataclass(frozen=True)
class CommandStep:
    name: str
    command: list[str]
    stdin_path: Path | None = None


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deploy the Factory Camera Pi agent over SSH/SCP.")
    parser.add_argument("--host", default=os.getenv("PI_HOST", DEFAULT_PI_HOST), help="Pi hostname or IP address.")
    parser.add_argument("--user", default=os.getenv("PI_USER"), help="SSH user. Defaults to SSH config.")
    parser.add_argument("--port", type=int, default=int(os.getenv("PI_SSH_PORT", "22")), help="SSH port.")
    parser.add_argument(
        "--remote-root",
        default=os.getenv("PI_REMOTE_ROOT", DEFAULT_REMOTE_ROOT),
        help="Remote install root. The systemd unit expects /opt/fourwall by default.",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        help="Optional local /etc/fourwall-camera-agent.env replacement to upload. Contents are never printed.",
    )
    parser.add_argument("--skip-packages", action="store_true", help="Do not install ffmpeg/python3 on the Pi.")
    parser.add_argument("--skip-doctor", action="store_true", help="Do not run camera_agent.py --doctor after install.")
    parser.add_argument("--run-once", action="store_true", help="Run one capture/upload smoke after doctor.")
    parser.add_argument("--start-service", action="store_true", help="Start the systemd service after doctor/smoke.")
    parser.add_argument("--dry-run", action="store_true", help="Print the SSH/SCP commands without executing them.")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    config = PiDeployConfig(
        host=args.host,
        user=args.user,
        port=args.port,
        remote_root=args.remote_root.rstrip("/"),
        env_file=args.env_file,
        install_packages=not args.skip_packages,
        run_doctor=not args.skip_doctor,
        run_once=args.run_once,
        start_service=args.start_service,
        dry_run=args.dry_run,
    )
    validate_config(config)

    if config.dry_run:
        for step in build_command_plan(config, bundle_path=Path("fourwall-camera-agent-bundle.tgz")):
            print(f"# {step.name}")
            print(format_step(step))
        return 0

    require_tool("ssh")
    require_tool("scp")
    with tempfile.TemporaryDirectory(prefix="fourwall-camera-agent-") as temp_dir:
        bundle_path = Path(temp_dir) / "fourwall-camera-agent-bundle.tgz"
        create_bundle(bundle_path)
        for step in build_command_plan(config, bundle_path=bundle_path):
            print(f"running {step.name}", flush=True)
            run_step(step)
    return 0


def validate_config(config: PiDeployConfig) -> None:
    if not config.host.strip():
        raise SystemExit("pi_host_required")
    if config.port <= 0:
        raise SystemExit("pi_ssh_port_must_be_positive")
    if config.remote_root != DEFAULT_REMOTE_ROOT:
        raise SystemExit("remote_root_must_match_systemd_unit:/opt/fourwall")
    if config.env_file is not None and not config.env_file.exists():
        raise SystemExit(f"env_file_not_found:{config.env_file}")


def create_bundle(output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(output_path, "w:gz") as archive:
        for source_name, archive_name in BUNDLE_FILES:
            source_path = PLANNER_ROOT / source_name
            if not source_path.exists():
                raise FileNotFoundError(source_path)
            archive.add(source_path, arcname=archive_name)
    return output_path


def build_command_plan(config: PiDeployConfig, *, bundle_path: Path) -> list[CommandStep]:
    remote_planner_root = f"{config.remote_root}/planner-server"
    steps = [
        CommandStep("copy camera agent bundle", _scp(config, str(bundle_path), REMOTE_BUNDLE_PATH)),
    ]
    if config.install_packages:
        steps.append(
            CommandStep(
                "install runtime packages",
                _ssh(config, "sudo apt-get update && sudo apt-get install -y ffmpeg python3"),
            )
        )
    steps.extend(
        [
            CommandStep(
                "extract camera agent bundle",
                _ssh(
                    config,
                    " && ".join(
                        [
                            f"sudo mkdir -p {shlex.quote(remote_planner_root)}",
                            f"sudo tar -xzf {shlex.quote(REMOTE_BUNDLE_PATH)} -C {shlex.quote(remote_planner_root)}",
                            (
                                "sudo chown -R root:root "
                                f"{shlex.quote(remote_planner_root)}/scripts/camera_agent.py "
                                f"{shlex.quote(remote_planner_root)}/deploy/pi-camera-agent"
                            ),
                        ]
                    ),
                ),
            ),
            CommandStep(
                "install systemd service",
                _ssh(config, f"cd {shlex.quote(remote_planner_root)}/deploy/pi-camera-agent && sudo bash install.sh"),
            ),
        ]
    )
    if config.env_file is not None:
        steps.append(
            CommandStep(
                "upload camera agent env",
                _ssh(config, f"umask 077; cat > {shlex.quote(REMOTE_ENV_PATH)}"),
                stdin_path=config.env_file,
            )
        )
        steps.append(
            CommandStep(
                "install camera agent env",
                _ssh(
                    config,
                    " && ".join(
                        [
                            (
                                f"sudo install -o root -g fourwall-camera -m 0640 "
                                f"{shlex.quote(REMOTE_ENV_PATH)} /etc/fourwall-camera-agent.env"
                            ),
                            f"rm -f {shlex.quote(REMOTE_ENV_PATH)}",
                        ]
                    ),
                ),
            )
        )
    if config.run_doctor:
        steps.append(
            CommandStep(
                "run camera agent doctor",
                _ssh(config, _agent_command(remote_planner_root, "--doctor --json")),
            )
        )
    if config.run_once:
        steps.append(CommandStep("run one capture/upload smoke", _ssh(config, _agent_command(remote_planner_root, "--once"))))
    if config.start_service:
        steps.append(
            CommandStep(
                "start camera agent service",
                _ssh(
                    config,
                    "sudo systemctl start fourwall-camera-agent && "
                    "sudo systemctl status fourwall-camera-agent --no-pager",
                ),
            )
        )
    return steps


def _agent_command(remote_planner_root: str, args: str) -> str:
    command = (
        "set -a; source /etc/fourwall-camera-agent.env; set +a; "
        f"cd {shlex.quote(remote_planner_root)}; python3 scripts/camera_agent.py {args}"
    )
    return f"sudo -u fourwall-camera bash -lc {shlex.quote(command)}"


def _target(config: PiDeployConfig) -> str:
    return f"{config.user}@{config.host}" if config.user else config.host


def _ssh(config: PiDeployConfig, remote_command: str) -> list[str]:
    return ["ssh", "-p", str(config.port), _target(config), remote_command]


def _scp(config: PiDeployConfig, source: str, remote_path: str) -> list[str]:
    return ["scp", "-P", str(config.port), source, f"{_target(config)}:{remote_path}"]


def require_tool(name: str) -> None:
    if shutil.which(name) is None:
        raise SystemExit(f"required_tool_missing:{name}")


def run_step(step: CommandStep) -> None:
    if step.stdin_path is None:
        subprocess.run(step.command, check=True)
        return
    with step.stdin_path.open("rb") as stdin:
        subprocess.run(step.command, stdin=stdin, check=True)


def format_command(command: Sequence[str]) -> str:
    return " ".join(shlex.quote(part) for part in command)


def format_step(step: CommandStep) -> str:
    rendered = format_command(step.command)
    if step.stdin_path is not None:
        rendered = f"{rendered} < {shlex.quote(str(step.stdin_path))}"
    return rendered


if __name__ == "__main__":
    raise SystemExit(main())
