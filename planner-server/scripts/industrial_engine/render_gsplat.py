from __future__ import annotations

import argparse
import os
from pathlib import Path
import shlex
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Render World Labs SPZ into RGB/depth frames through gsplat.")
    parser.add_argument("--world-spz", required=True)
    parser.add_argument("--metric-metadata", required=True)
    parser.add_argument("--camera-poses", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    world_spz = Path(args.world_spz)
    metric_metadata = Path(args.metric_metadata)
    camera_poses = Path(args.camera_poses)
    output_dir = Path(args.output_dir)
    for path in (world_spz, metric_metadata, camera_poses):
        if not path.exists():
            print(f"required_input_missing:{path}", file=sys.stderr)
            return 2

    command_template = os.getenv("GSPLAT_RENDER_COMMAND", "").strip()
    if not command_template:
        print(
            "GSPLAT_RENDER_COMMAND is not configured; refusing to emit fake RGB/depth frames.",
            file=sys.stderr,
        )
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    command = [
        part.format(
            world_spz=str(world_spz),
            metric_metadata=str(metric_metadata),
            camera_poses=str(camera_poses),
            output_dir=str(output_dir),
        )
        for part in shlex.split(command_template)
    ]
    result = subprocess.run(command, check=False)
    if result.returncode != 0:
        return result.returncode
    if not (output_dir / "rgb").exists() or not (output_dir / "depth").exists():
        print("gsplat_command_did_not_emit_rgb_and_depth_directories", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
