from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import traceback
from typing import Any

import numpy as np


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_vocabulary(path: Path) -> list[str]:
    labels = [line.strip() for line in path.read_text(encoding="utf-8").splitlines()]
    labels = [label for label in labels if label and not label.startswith("#")]
    if not labels:
        raise RuntimeError("vocabulary_empty")
    return labels


def _stem(path: Path) -> str:
    return path.stem


def _depth_for(depth_dir: Path, pose_id: str) -> Path:
    for suffix in (".npy", ".png", ".tiff", ".tif"):
        candidate = depth_dir / f"{pose_id}{suffix}"
        if candidate.exists():
            return candidate
    raise RuntimeError(f"depth_missing_for_pose:{pose_id}")


def _load_depth(path: Path) -> np.ndarray:
    if path.suffix == ".npy":
        return np.load(path).astype(np.float32)
    import cv2

    depth = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if depth is None:
        raise RuntimeError(f"depth_read_failed:{path}")
    depth = depth.astype(np.float32)
    if path.suffix.lower() in {".png", ".tiff", ".tif"} and depth.max(initial=0) > 255:
        depth = depth / 1000.0
    return depth


def _fallback_camera_metadata(camera_poses: Path, rgb_dir: Path) -> dict[str, Any]:
    poses = (_load_json(camera_poses).get("poses") or [])
    if not poses:
        raise RuntimeError("camera_poses_empty")
    import cv2

    first_rgb = sorted(rgb_dir.glob("*.png"))[0]
    image = cv2.imread(str(first_rgb), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"rgb_read_failed:{first_rgb}")
    height, width = image.shape[:2]
    fx = fy = float(max(width, height) * 0.85)
    intrinsics = [[fx, 0.0, width / 2.0], [0.0, fy, height / 2.0], [0.0, 0.0, 1.0]]
    cameras = []
    for index, pose in enumerate(poses):
        position = pose.get("position") or {}
        cam_to_world = np.eye(4, dtype=np.float32)
        cam_to_world[:3, 3] = [
            float(position.get("x", 0.0)),
            float(position.get("y", 1.5)),
            float(position.get("z", 0.0)),
        ]
        cameras.append(
            {
                "cameraPoseId": pose.get("cameraPoseId") or f"pose_{index + 1:04d}",
                "intrinsics": intrinsics,
                "camToWorld": cam_to_world.tolist(),
                "width": width,
                "height": height,
            }
        )
    return {"cameras": cameras, "width": width, "height": height}


def _read_render_metadata(rgb_dir: Path, camera_poses: Path) -> dict[str, Any]:
    metadata_path = rgb_dir.parent / "render_metadata.json"
    if metadata_path.exists():
        return _load_json(metadata_path)
    return _fallback_camera_metadata(camera_poses, rgb_dir)


def _resize_image_and_depth(image: np.ndarray, depth: np.ndarray, intrinsics: np.ndarray, size: int | None):
    if not size:
        return image, depth, intrinsics
    import cv2

    height, width = image.shape[:2]
    image_resized = cv2.resize(image, (size, size), interpolation=cv2.INTER_AREA)
    depth_resized = cv2.resize(depth, (size, size), interpolation=cv2.INTER_NEAREST)
    scaled = intrinsics.copy()
    scaled[0, :] *= float(size) / float(width)
    scaled[1, :] *= float(size) / float(height)
    return image_resized, depth_resized, scaled


def _to_float_list(value) -> list[float]:
    return [float(item) for item in np.asarray(value, dtype=np.float32).reshape(-1).tolist()]


def _exception_detail(exc: Exception) -> str:
    detail = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)).strip()
    return detail or type(exc).__name__


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Boxer on 4WALL rendered RGB/depth frames.")
    parser.add_argument("--boxer-repo", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--rgb-dir", required=True)
    parser.add_argument("--depth-dir", required=True)
    parser.add_argument("--camera-poses", required=True)
    parser.add_argument("--vocabulary", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--thresh2d", type=float, default=0.25)
    parser.add_argument("--thresh3d", type=float, default=0.5)
    parser.add_argument("--detector-hw", type=int, default=960)
    parser.add_argument("--force-cpu", action="store_true")
    parser.add_argument("--force-precision", choices=["float32", "bfloat16"], default=None)
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

    sys.path.insert(0, str(boxer_repo))
    try:
        import cv2
        import torch
        from boxernet.boxernet import BoxerNet
        from loaders.base_loader import BaseLoader
        from owl.owl_wrapper import OwlWrapper
        from utils.tw.obb import PAD_VAL, ObbTW
        from utils.tw.pose import PoseTW
        from utils.tw.tensor_utils import pad_string, string2tensor
    except Exception as exc:  # pragma: no cover - runtime dependency gate
        print(f"boxer_runtime_import_failed:{_exception_detail(exc)}", file=sys.stderr)
        return 2

    labels = _load_vocabulary(vocabulary)
    metadata = _read_render_metadata(rgb_dir, camera_poses)
    cameras_by_id = {camera["cameraPoseId"]: camera for camera in metadata.get("cameras", [])}
    rgb_paths = sorted(rgb_dir.glob("*.png"))
    if not rgb_paths:
        print("rgb_frames_missing", file=sys.stderr)
        return 2

    if torch.cuda.is_available() and not args.force_cpu:
        device = "cuda"
    else:
        device = "cpu"

    try:
        owl = OwlWrapper(
            device,
            text_prompts=labels,
            min_confidence=args.thresh2d,
            precision=args.force_precision,
        )
        boxernet = BoxerNet.load_from_checkpoint(str(checkpoint), device=device)
    except Exception as exc:
        print(f"boxer_model_load_failed:{_exception_detail(exc)}", file=sys.stderr)
        return 2

    resize_size = int(getattr(boxernet, "hw", 0) or args.detector_hw)
    raw_frames: list[dict[str, Any]] = []
    objects: list[dict[str, Any]] = []
    sem_name_to_id = {label: index for index, label in enumerate(labels)}
    sem_id_to_name = {index: label for label, index in sem_name_to_id.items()}

    for frame_index, rgb_path in enumerate(rgb_paths):
        pose_id = _stem(rgb_path)
        camera = cameras_by_id.get(pose_id)
        if camera is None:
            print(f"render_metadata_missing_for_pose:{pose_id}", file=sys.stderr)
            return 2
        depth_path = _depth_for(depth_dir, pose_id)
        image_bgr = cv2.imread(str(rgb_path), cv2.IMREAD_COLOR)
        if image_bgr is None:
            print(f"rgb_read_failed:{rgb_path}", file=sys.stderr)
            return 2
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        depth = _load_depth(depth_path)
        intrinsics = np.asarray(camera["intrinsics"], dtype=np.float32)
        image_rgb, depth, intrinsics = _resize_image_and_depth(image_rgb, depth, intrinsics, resize_size)
        height, width = image_rgb.shape[:2]
        cam_to_world = np.asarray(camera["camToWorld"], dtype=np.float32)
        rotation_wc = cam_to_world[:3, :3]
        translation_wc = cam_to_world[:3, 3]

        img_torch = BaseLoader.img_to_tensor(np.ascontiguousarray(image_rgb))
        datum = {
            "img0": img_torch,
            "cam0": BaseLoader.pinhole_from_K(
                width,
                height,
                float(intrinsics[0, 0]),
                float(intrinsics[1, 1]),
                float(intrinsics[0, 2]),
                float(intrinsics[1, 2]),
            ),
            "T_world_rig0": PoseTW.from_Rt(torch.from_numpy(rotation_wc), torch.from_numpy(translation_wc)),
            "sdp_w": BaseLoader.sdp_from_depth(
                depth,
                float(intrinsics[0, 0]),
                float(intrinsics[1, 1]),
                float(intrinsics[0, 2]),
                float(intrinsics[1, 2]),
                rotation_wc,
                translation_wc,
            ),
            "time_ns0": int((frame_index + 1) * 1_000_000_000),
            "rotated0": torch.tensor(False).reshape(1),
            "bb2d0": torch.zeros(0, 4),
            "obbs": ObbTW(PAD_VAL * torch.ones((0, 165))),
        }

        img_torch_255 = img_torch.clone() * 255.0
        try:
            bb2d, scores2d, label_ints, _ = owl.forward(
                img_torch_255,
                False,
                resize_to_HW=(args.detector_hw, args.detector_hw),
            )
        except Exception as exc:
            print(f"owl_detection_failed:{pose_id}:{_exception_detail(exc)}", file=sys.stderr)
            return 2
        frame_labels = [labels[int(label_int)] for label_int in label_ints]
        raw_frame = {
            "frameId": pose_id,
            "rgb": str(rgb_path),
            "depth": str(depth_path),
            "detections": [],
        }
        if len(bb2d) == 0:
            raw_frames.append(raw_frame)
            continue

        bb2d_xyxy = bb2d[:, [0, 2, 1, 3]].detach().cpu().numpy()
        for box_index, box in enumerate(bb2d_xyxy):
            raw_frame["detections"].append(
                {
                    "label": frame_labels[box_index],
                    "score": float(scores2d[box_index].detach().cpu().item()),
                    "bboxXYXY": _to_float_list(box),
                }
            )
        raw_frames.append(raw_frame)

        datum["bb2d"] = bb2d
        if args.force_precision == "bfloat16":
            precision_dtype = torch.bfloat16
        elif args.force_precision == "float32":
            precision_dtype = torch.float32
        elif device == "cuda" and torch.cuda.is_bf16_supported():
            precision_dtype = torch.bfloat16
        else:
            precision_dtype = torch.float32

        try:
            if device == "cpu":
                outputs = boxernet.forward(datum)
            else:
                with torch.autocast(device_type=device, dtype=precision_dtype):
                    outputs = boxernet.forward(datum)
        except Exception as exc:
            print(f"boxernet_forward_failed:{pose_id}:{_exception_detail(exc)}", file=sys.stderr)
            return 2

        obb_pr_w = outputs["obbs_pr_w"].cpu()[0]
        if len(obb_pr_w) != len(frame_labels):
            print(f"boxer_output_label_count_mismatch:{pose_id}", file=sys.stderr)
            return 2
        sem_ids = torch.zeros(len(frame_labels), dtype=torch.int32)
        for label_index, label in enumerate(frame_labels):
            if label not in sem_name_to_id:
                new_id = len(sem_name_to_id)
                sem_name_to_id[label] = new_id
                sem_id_to_name[new_id] = label
            sem_ids[label_index] = sem_name_to_id[label]
        obb_pr_w.set_sem_id(sem_ids)
        scores3d = obb_pr_w.prob.squeeze(-1).clone()
        keepers = scores3d >= args.thresh3d
        obb_pr_w = obb_pr_w[keepers].clone()
        scores3d = scores3d[keepers].clone()
        kept_labels = [frame_labels[i] for i in range(len(frame_labels)) if bool(keepers[i])]
        if len(obb_pr_w) == 0:
            continue
        mean_scores = (scores2d[keepers].cpu() + scores3d.cpu()) / 2.0
        obb_pr_w.set_prob(mean_scores)
        text_data = torch.stack([string2tensor(pad_string(label, max_len=128)) for label in kept_labels])
        obb_pr_w.set_text(text_data)

        centers = obb_pr_w.bb3_center_world.detach().cpu().numpy()
        dimensions = obb_pr_w.bb3_diagonal.detach().cpu().numpy()
        transforms = obb_pr_w.T_world_object._data.detach().cpu().numpy()
        bb3_object = obb_pr_w.bb3_object.detach().cpu().numpy()
        scores = obb_pr_w.prob.squeeze(-1).detach().cpu().numpy()
        for obj_index, label in enumerate(kept_labels):
            objects.append(
                {
                    "objectId": f"{pose_id}_{obj_index + 1:03d}",
                    "sourceFrameId": pose_id,
                    "label": label,
                    "score": float(scores[obj_index]),
                    "centerWorld": _to_float_list(centers[obj_index]),
                    "dimensionsMeters": _to_float_list(dimensions[obj_index]),
                    "boxObjectBounds": _to_float_list(bb3_object[obj_index]),
                    "objectToWorld12": _to_float_list(transforms[obj_index]),
                }
            )

    output_dir.mkdir(parents=True, exist_ok=True)
    raw_payload = {
        "provider": "facebookresearch-boxer",
        "frames": raw_frames,
        "vocabulary": labels,
        "threshold2d": args.thresh2d,
    }
    annotations_payload = {
        "provider": "facebookresearch-boxer",
        "objects": objects,
        "annotations": objects,
        "frameCount": len(raw_frames),
        "threshold3d": args.thresh3d,
    }
    scene_graph = {
        "provider": "facebookresearch-boxer",
        "objects": objects,
        "objectCount": len(objects),
        "frameCount": len(raw_frames),
    }
    (output_dir / "object_annotations_raw.json").write_text(
        json.dumps(raw_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "object_annotations_3d.json").write_text(
        json.dumps(annotations_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "final_scene_graph.json").write_text(
        json.dumps(scene_graph, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
