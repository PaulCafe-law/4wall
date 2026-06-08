from __future__ import annotations

import argparse
import os
from pathlib import Path
import shlex
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Boxer annotation on rendered industrial RGB/depth frames.")
    parser.add_argument("--boxer-repo", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--rgb-dir", required=True)
    parser.add_argument("--depth-dir", required=True)
    parser.add_argument("--camera-poses", required=True)
    parser.add_argument("--vocabulary", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    boxer_repo = Path(args.boxer_repo)
    checkpoint = Path(args.checkpoint)
    rgb_dir = Path(args.rgb_dir)
    depth_dir = Path(args.depth_dir)
    camera_poses = Path(args.camera_poses)
    vocabulary = Path(args.vocabulary)
    output_dir = Path(args.output_dir)
    for path in (boxer_repo, checkpoint, rgb_dir, depth_dir, camera_poses, vocabulary):
        if not path.exists():
            print(f"required_input_missing:{path}", file=sys.stderr)
            return 2

    command_template = os.getenv("BOXER_ANNOTATION_COMMAND", "").strip()
    if not command_template:
        print(
            "BOXER_ANNOTATION_COMMAND is not configured; refusing to emit fake annotations.",
            file=sys.stderr,
        )
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    command = [
        part.format(
            boxer_repo=str(boxer_repo),
            checkpoint=str(checkpoint),
            rgb_dir=str(rgb_dir),
            depth_dir=str(depth_dir),
            camera_poses=str(camera_poses),
            vocabulary=str(vocabulary),
            output_dir=str(output_dir),
        )
        for part in shlex.split(command_template)
    ]
    result = subprocess.run(command, check=False, cwd=boxer_repo)
    if result.returncode != 0:
        return result.returncode
    expected = (
        output_dir / "object_annotations_raw.json",
        output_dir / "object_annotations_3d.json",
    )
    if not all(path.exists() for path in expected):
        print("boxer_command_did_not_emit_required_annotation_files", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
