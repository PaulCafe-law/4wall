from __future__ import annotations

import argparse
import json
from math import isfinite
import os
from pathlib import Path
import sys

import numpy as np


def _load_spz(path: Path):
    try:
        from gsply import read_spz
    except Exception as exc:  # pragma: no cover - runtime dependency gate
        raise RuntimeError("gsply is required to read World Labs SPZ assets") from exc

    data = read_spz(str(path))
    if hasattr(data, "denormalize"):
        denormalized = data.denormalize()
        if denormalized is not None:
            data = denormalized
    if hasattr(data, "to_rgb"):
        rgb = data.to_rgb()
        if rgb is not None:
            data = rgb
    return data


def _as_numpy(value, *, name: str, dims: int) -> np.ndarray:
    array = np.asarray(value)
    if array.ndim != dims:
        raise RuntimeError(f"{name}_wrong_rank:{array.shape}")
    return array.astype(np.float32, copy=False)


def _metric_float(metadata: dict, key: str, default: float) -> float:
    value = metadata.get(key)
    if value is None:
        return default
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if isfinite(parsed) else default


def _camera_basis_from_yaw_pitch(yaw_deg: float, pitch_deg: float) -> tuple[np.ndarray, np.ndarray]:
    yaw = np.deg2rad(yaw_deg)
    pitch = np.deg2rad(pitch_deg)
    forward = np.array(
        [
            np.sin(yaw) * np.cos(pitch),
            np.sin(pitch),
            np.cos(yaw) * np.cos(pitch),
        ],
        dtype=np.float32,
    )
    forward = forward / max(float(np.linalg.norm(forward)), 1e-6)
    up = np.array([0.0, 1.0, 0.0], dtype=np.float32)
    if abs(float(np.dot(forward, up))) > 0.95:
        up = np.array([0.0, 0.0, 1.0], dtype=np.float32)
    right = np.cross(forward, up)
    right = right / max(float(np.linalg.norm(right)), 1e-6)
    down = np.cross(forward, right)
    down = down / max(float(np.linalg.norm(down)), 1e-6)
    rotation = np.stack([right, down, forward], axis=1).astype(np.float32)
    return rotation, forward


def _camera_matrices(
    poses: list[dict],
    *,
    camera_origin: np.ndarray,
    width: int,
    height: int,
) -> list[dict]:
    fx = fy = float(max(width, height) * 0.62)
    cx = float(width / 2.0)
    cy = float(height / 2.0)
    intrinsics = np.array([[fx, 0.0, cx], [0.0, fy, cy], [0.0, 0.0, 1.0]], dtype=np.float32)
    cameras: list[dict] = []
    for index, pose in enumerate(poses):
        rotation_payload = pose.get("rotation") or {}
        yaw_deg = float(rotation_payload.get("yawDeg", index * 45.0))
        pitch_deg = float(rotation_payload.get("pitchDeg", 0.0))
        rotation, forward = _camera_basis_from_yaw_pitch(yaw_deg, pitch_deg)
        cam_to_world = np.eye(4, dtype=np.float32)
        cam_to_world[:3, :3] = rotation
        cam_to_world[:3, 3] = camera_origin
        world_to_cam = np.linalg.inv(cam_to_world).astype(np.float32)
        cameras.append(
            {
                "cameraPoseId": pose.get("cameraPoseId") or f"pose_{index + 1:04d}",
                "intrinsics": intrinsics.tolist(),
                "camToWorld": cam_to_world.tolist(),
                "worldToCam": world_to_cam.tolist(),
                "cameraPlacement": "worldlabs_panorama_origin",
                "cameraOrigin": camera_origin.tolist(),
                "forward": forward.tolist(),
                "width": width,
                "height": height,
            }
        )
    return cameras


def _save_depth_png(path: Path, depth: np.ndarray) -> None:
    from PIL import Image

    depth_mm = np.nan_to_num(depth, nan=0.0, posinf=0.0, neginf=0.0)
    depth_mm = np.clip(depth_mm * 1000.0, 0, 65535).astype(np.uint16)
    Image.fromarray(depth_mm).save(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a World Labs SPZ into RGB/depth frames with gsplat.")
    parser.add_argument("--world-spz", required=True)
    parser.add_argument("--metric-metadata", required=True)
    parser.add_argument("--camera-poses", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--width", type=int, default=768)
    parser.add_argument("--height", type=int, default=512)
    args = parser.parse_args()
    os.environ["PATH"] = f"{Path(sys.executable).parent}{os.pathsep}{os.environ.get('PATH', '')}"

    world_spz = Path(args.world_spz)
    metric_metadata = Path(args.metric_metadata)
    camera_poses = Path(args.camera_poses)
    output_dir = Path(args.output_dir)
    for path in (world_spz, metric_metadata, camera_poses):
        if not path.exists():
            print(f"required_input_missing:{path}", file=sys.stderr)
            return 2

    try:
        import torch
        from gsplat.rendering import rasterization
        from PIL import Image
    except Exception as exc:  # pragma: no cover - runtime dependency gate
        print(f"gsplat_runtime_import_failed:{exc}", file=sys.stderr)
        return 2

    data = _load_spz(world_spz)
    means = _as_numpy(data.means, name="means", dims=2)
    scales = _as_numpy(data.scales, name="scales", dims=2)
    quats = _as_numpy(data.quats, name="quats", dims=2)
    opacities = np.asarray(data.opacities, dtype=np.float32).squeeze()
    if opacities.ndim != 1:
        raise RuntimeError(f"opacities_wrong_rank:{opacities.shape}")
    colors = _as_numpy(data.sh0, name="colors", dims=2)
    if colors.shape[1] < 3:
        raise RuntimeError(f"colors_missing_rgb_channels:{colors.shape}")
    colors = colors[:, :3]

    metric = json.loads(metric_metadata.read_text(encoding="utf-8"))
    scale_factor = _metric_float(metric, "metric_scale_factor", 1.0)
    ground_offset = _metric_float(metric, "ground_plane_offset", 0.0)
    means = means * scale_factor
    scales = scales * abs(scale_factor)
    means[:, 1] -= ground_offset
    camera_origin = np.array([0.0, -ground_offset, 0.0], dtype=np.float32)

    if means.size == 0:
        print("spz_contains_no_gaussians", file=sys.stderr)
        return 2
    poses_payload = json.loads(camera_poses.read_text(encoding="utf-8"))
    poses = poses_payload.get("poses") or []
    if not poses:
        print("camera_poses_empty", file=sys.stderr)
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    rgb_dir = output_dir / "rgb"
    depth_dir = output_dir / "depth"
    rgb_dir.mkdir(exist_ok=True)
    depth_dir.mkdir(exist_ok=True)

    cameras = _camera_matrices(poses, camera_origin=camera_origin, width=args.width, height=args.height)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    means_t = torch.from_numpy(means).to(device)
    quats_t = torch.from_numpy(quats).to(device)
    scales_t = torch.from_numpy(scales).to(device)
    opacities_t = torch.from_numpy(np.clip(opacities, 0.0, 1.0)).to(device)
    colors_t = torch.from_numpy(np.clip(colors, 0.0, 1.0)).to(device)
    background = torch.tensor([[1.0, 1.0, 1.0]], dtype=torch.float32, device=device)
    nonblank = 0

    for index, camera in enumerate(cameras):
        pose_id = camera["cameraPoseId"]
        viewmat = torch.tensor(camera["worldToCam"], dtype=torch.float32, device=device).unsqueeze(0)
        intrinsics = torch.tensor(camera["intrinsics"], dtype=torch.float32, device=device).unsqueeze(0)
        with torch.no_grad():
            rendered, alphas, _ = rasterization(
                means=means_t,
                quats=quats_t,
                scales=scales_t,
                opacities=opacities_t,
                colors=colors_t,
                viewmats=viewmat,
                Ks=intrinsics,
                width=args.width,
                height=args.height,
                render_mode="RGB+ED",
                backgrounds=background,
                packed=False,
            )
        frame = rendered[0].detach().float().cpu().numpy()
        alpha = alphas[0].detach().float().cpu().numpy()
        rgb = np.clip(frame[..., :3], 0.0, 1.0)
        depth = frame[..., 3]
        if np.nanmax(alpha) > 0.01:
            nonblank += 1
        rgb_u8 = (rgb * 255.0).astype(np.uint8)
        Image.fromarray(rgb_u8).save(rgb_dir / f"{pose_id}.png")
        np.save(depth_dir / f"{pose_id}.npy", depth.astype(np.float32))
        _save_depth_png(depth_dir / f"{pose_id}.png", depth.astype(np.float32))
        cameras[index]["rgb"] = f"rgb/{pose_id}.png"
        cameras[index]["depthNpy"] = f"depth/{pose_id}.npy"
        cameras[index]["depthPng"] = f"depth/{pose_id}.png"

    if nonblank == 0:
        print("gsplat_render_produced_only_blank_frames", file=sys.stderr)
        return 2

    metadata = {
        "renderer": "gsplat",
        "device": str(device),
        "gaussianCount": int(means.shape[0]),
        "width": args.width,
        "height": args.height,
        "nonblankFrames": nonblank,
        "cameraPlacement": "worldlabs_panorama_origin",
        "metricScaleFactor": scale_factor,
        "groundPlaneOffset": ground_offset,
        "cameras": cameras,
    }
    (output_dir / "render_metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
