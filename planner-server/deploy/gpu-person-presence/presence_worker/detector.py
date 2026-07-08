from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np

from .config import DetectorConfig


@dataclass(frozen=True)
class Detection:
    bbox: tuple[float, float, float, float]
    confidence: float
    label: str = "person"


class PersonDetector(Protocol):
    def detect(self, image: np.ndarray) -> list[Detection]:
        ...


class FakeDetector:
    def __init__(self, detections: list[Detection] | None = None) -> None:
        self._detections = detections or []

    def detect(self, image: np.ndarray) -> list[Detection]:
        return list(self._detections)


class DetectorUnavailable(RuntimeError):
    pass


class PaddleDetectionPersonDetector:
    """Thin adapter around PaddleDetection deploy inference.

    Production nckusoc setup should install PaddleDetection and put its `deploy/python`
    modules on PYTHONPATH. Tests use FakeDetector and never import PaddleDetection.
    """

    def __init__(self, config: DetectorConfig) -> None:
        if not config.model_dir:
            raise DetectorUnavailable("detector.model_dir is required for PaddleDetection")
        try:
            from deploy.python.infer import Detector as PaddleDetector  # type: ignore
        except Exception as exc:  # pragma: no cover - host-specific optional dependency
            raise DetectorUnavailable(
                "PaddleDetection deploy modules are unavailable. Install PaddleDetection and set PYTHONPATH "
                "to include its deploy/python directory, or run with --fake-detection for dry-run."
            ) from exc

        self.config = config
        self._detector = PaddleDetector(
            model_dir=config.model_dir,
            device=config.device,
            run_mode=config.run_mode,
            **config.constructor_options,
        )

    def detect(self, image: np.ndarray) -> list[Detection]:  # pragma: no cover - requires PaddleDetection runtime
        raw = self._detector.predict_image([image], visual=False)
        return _parse_paddledet_output(raw)


def build_detector(config: DetectorConfig, *, fake: bool = False) -> PersonDetector:
    if fake or config.backend == "fake":
        return FakeDetector()
    if config.backend == "paddledet":
        return PaddleDetectionPersonDetector(config)
    if config.backend == "yolox":
        return OpenCvYoloxDetector(config)
    if config.backend == "hog":
        return OpenCvHogPersonDetector(config)
    raise DetectorUnavailable(f"unsupported detector backend: {config.backend}")


class OpenCvHogPersonDetector:
    """OpenCV built-in HOG pedestrian detector.

    Zero model download and no paddle/torch dependency — runs on CPU from
    opencv-python alone. Lower recall than a CNN detector on occluded/angled
    bodies, so this is the lightweight v1 backend; swap to ``paddledet`` (or an
    ONNX backend) when higher accuracy is needed.
    """

    def __init__(self, config: DetectorConfig) -> None:
        try:
            import cv2  # noqa: PLC0415
        except Exception as exc:  # pragma: no cover - opencv is a declared dep
            raise DetectorUnavailable("opencv-python is required for the hog backend") from exc

        self._hog = cv2.HOGDescriptor()
        self._hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        opts = config.constructor_options or {}
        self._win_stride = tuple(opts.get("win_stride", (8, 8)))
        self._padding = tuple(opts.get("padding", (8, 8)))
        self._scale = float(opts.get("scale", 1.05))
        self._hit_threshold = float(opts.get("hit_threshold", 0.0))

    def detect(self, image: np.ndarray) -> list[Detection]:
        rects, weights = self._hog.detectMultiScale(
            image,
            winStride=self._win_stride,
            padding=self._padding,
            scale=self._scale,
            hitThreshold=self._hit_threshold,
        )
        detections: list[Detection] = []
        for (x, y, w, h), weight in zip(list(rects), list(weights)):
            # HOG SVM score is unbounded; squash to a 0-1 confidence.
            confidence = float(min(1.0, max(0.0, 0.5 + float(weight) * 0.4)))
            detections.append(
                Detection(
                    bbox=(float(x), float(y), float(w), float(h)),
                    confidence=confidence,
                    label="person",
                )
            )
        return detections


class OpenCvYoloxDetector:
    """YOLOX person detector running on cv2.dnn (ONNX) — no torch/paddle needed.

    Loads an OpenCV Zoo YOLOX ONNX model via ``cv2.dnn.readNetFromONNX`` and runs
    the official YOLOX preprocessing/decoding on CPU (or CUDA when available). Much
    higher precision than the HOG backend, which false-fires on machinery/clutter.

    Model path resolution (README documents both):
      * ``config.constructor_options.model_path`` if set, else
      * ``config.model_dir`` used directly as the ONNX file path.

    Preprocessing follows the OpenCV Zoo YOLOX reference exactly: convert BGR->RGB,
    letterbox to 640x640 with a single aspect-preserving ratio and 114 padding at
    the bottom/right (top-left anchored), NCHW float32 blob, and **no** /255 and
    **no** mean/std normalization (YOLOX ingests raw 0-255 pixel values).

    Decoding assumes the raw OpenCV Zoo model whose output is ``(1, N, 85)`` =
    ``[cx, cy, w, h, obj, 80 class scores]`` and applies grid+stride decoding for
    strides 8/16/32. If you export a model that already bakes the decode in (grids
    baked, boxes already in letterbox pixels), set
    ``constructor_options.decoded: true`` to skip re-decoding.
    """

    _INPUT_SIZE = 640
    _PAD_VALUE = 114.0
    _PERSON_CLASS_ID = 0

    def __init__(self, config: DetectorConfig) -> None:
        try:
            import cv2  # noqa: PLC0415
        except Exception as exc:  # pragma: no cover - opencv is a declared dep
            raise DetectorUnavailable(
                "opencv-python(-headless) with cv2.dnn is required for the yolox backend"
            ) from exc

        opts = dict(config.constructor_options or {})
        model_path = str(opts.get("model_path") or config.model_dir or "").strip()
        if not model_path:
            raise DetectorUnavailable(
                "yolox backend needs an ONNX path: set detector.model_dir (full path to the .onnx) "
                "or detector.constructor_options.model_path"
            )

        try:
            self._net = cv2.dnn.readNetFromONNX(model_path)
        except Exception as exc:
            raise DetectorUnavailable(f"failed to load YOLOX ONNX model at {model_path!r}: {exc}") from exc

        self.config = config
        self._cv2 = cv2
        self._score_threshold = float(config.confidence_threshold)
        self._nms_threshold = float(opts.get("nms_threshold", 0.45))
        self._strides = [int(s) for s in (opts.get("strides") or (8, 16, 32))]
        self._input_size = int(opts.get("input_size", self._INPUT_SIZE))
        self._decoded = bool(opts.get("decoded", False))
        self._grids, self._expanded_strides = _yolox_anchors(self._input_size, self._strides)

        if config.device == "gpu":
            try:
                self._net.setPreferableBackend(cv2.dnn.DNN_BACKEND_CUDA)
                self._net.setPreferableTarget(cv2.dnn.DNN_TARGET_CUDA)
            except Exception:  # pragma: no cover - depends on CUDA-enabled opencv build
                self._net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
                self._net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)

    def detect(self, image: np.ndarray) -> list[Detection]:
        cv2 = self._cv2
        blob, ratio = self._preprocess(image)
        self._net.setInput(blob)
        outputs = self._net.forward()
        preds = np.asarray(outputs, dtype=np.float32)
        # Accept (1, N, 85) or (N, 85).
        if preds.ndim == 3:
            preds = preds[0]
        if preds.ndim != 2 or preds.shape[0] == 0:
            return []

        boxes_xywh, scores, class_ids = self._decode(preds)
        if boxes_xywh.shape[0] == 0:
            return []

        # Keep person class only, above the score threshold.
        keep_mask = (class_ids == self._PERSON_CLASS_ID) & (scores >= self._score_threshold)
        if not np.any(keep_mask):
            return []
        boxes_xywh = boxes_xywh[keep_mask]
        scores = scores[keep_mask]

        # Restore to original-image pixels (top-left anchored letterbox -> divide by ratio).
        boxes_orig = boxes_xywh / ratio

        image_h, image_w = image.shape[:2]
        nms_boxes = [[float(b[0]), float(b[1]), float(b[2]), float(b[3])] for b in boxes_orig]
        nms_scores = [float(s) for s in scores]
        indices = cv2.dnn.NMSBoxes(
            nms_boxes, nms_scores, self._score_threshold, self._nms_threshold
        )
        keep_idx = _flatten_nms_indices(indices)

        detections: list[Detection] = []
        for i in keep_idx:
            x, y, w, h = boxes_orig[i]
            # Clip to image so downstream foot_point / valid_detection bounds hold.
            x0 = float(min(max(x, 0.0), image_w))
            y0 = float(min(max(y, 0.0), image_h))
            x1 = float(min(max(x + w, 0.0), image_w))
            y1 = float(min(max(y + h, 0.0), image_h))
            width = x1 - x0
            height = y1 - y0
            if width <= 0 or height <= 0:
                continue
            detections.append(
                Detection(
                    bbox=(x0, y0, width, height),
                    confidence=float(scores[i]),
                    label="person",
                )
            )
        return detections

    def _preprocess(self, image: np.ndarray) -> tuple[np.ndarray, float]:
        size = self._input_size
        rgb = self._cv2.cvtColor(image, self._cv2.COLOR_BGR2RGB)
        src_h, src_w = rgb.shape[:2]
        ratio = min(size / src_h, size / src_w)
        resized_w = int(src_w * ratio)
        resized_h = int(src_h * ratio)
        resized = self._cv2.resize(
            rgb, (resized_w, resized_h), interpolation=self._cv2.INTER_LINEAR
        ).astype(np.float32)
        padded = np.ones((size, size, 3), dtype=np.float32) * self._PAD_VALUE
        padded[:resized_h, :resized_w] = resized
        # HWC -> NCHW, no /255, no mean/std normalization (YOLOX ingests raw 0-255).
        blob = np.transpose(padded, (2, 0, 1))[np.newaxis, :, :, :]
        return np.ascontiguousarray(blob, dtype=np.float32), ratio

    def _decode(self, preds: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        dets = preds.astype(np.float32, copy=True)
        if not self._decoded:
            grids = self._grids
            strides = self._expanded_strides
            if grids.shape[0] != dets.shape[0]:
                # Regenerate for the actual anchor count if the model differs.
                grids, strides = _yolox_anchors_for_count(dets.shape[0], self._strides)
            dets[:, :2] = (dets[:, :2] + grids) * strides
            dets[:, 2:4] = np.exp(dets[:, 2:4]) * strides

        cx = dets[:, 0]
        cy = dets[:, 1]
        w = dets[:, 2]
        h = dets[:, 3]
        boxes_xywh = np.stack([cx - w / 2.0, cy - h / 2.0, w, h], axis=1)

        obj = dets[:, 4:5]
        cls = dets[:, 5:]
        cls_scores = obj * cls
        class_ids = np.argmax(cls_scores, axis=1)
        scores = np.max(cls_scores, axis=1)
        return boxes_xywh, scores, class_ids


def _yolox_anchors(input_size: int, strides: list[int]) -> tuple[np.ndarray, np.ndarray]:
    """Grid centers and per-anchor strides, matching the OpenCV Zoo YOLOX layout."""
    grids: list[np.ndarray] = []
    expanded: list[np.ndarray] = []
    for stride in strides:
        hsize = input_size // stride
        wsize = input_size // stride
        xv, yv = np.meshgrid(np.arange(hsize), np.arange(wsize))
        grid = np.stack((xv, yv), 2).reshape(-1, 2)
        grids.append(grid)
        expanded.append(np.full((grid.shape[0], 1), stride, dtype=np.float32))
    grid_all = np.concatenate(grids, axis=0).astype(np.float32)
    stride_all = np.concatenate(expanded, axis=0).astype(np.float32)
    return grid_all, stride_all


def _yolox_anchors_for_count(count: int, strides: list[int]) -> tuple[np.ndarray, np.ndarray]:
    """Infer the square input size from the total anchor count, then build anchors.

    Total anchors = sum((size/stride)^2). Solve for size assuming the standard set.
    """
    unit = sum((1.0 / s) ** 2 for s in strides)
    size = int(round((count / unit) ** 0.5)) if unit > 0 else 0
    if size <= 0:
        # Fall back to zero grids so decode is a no-op rather than crashing.
        zeros = np.zeros((count, 2), dtype=np.float32)
        ones = np.ones((count, 1), dtype=np.float32)
        return zeros, ones
    return _yolox_anchors(size, strides)


def _flatten_nms_indices(indices) -> list[int]:
    """cv2.dnn.NMSBoxes returns ((), np.ndarray Nx1, or list) across versions."""
    if indices is None:
        return []
    arr = np.asarray(indices)
    if arr.size == 0:
        return []
    return [int(i) for i in arr.reshape(-1)]


def _parse_paddledet_output(raw) -> list[Detection]:
    boxes = None
    if isinstance(raw, dict):
        boxes = raw.get("boxes")
    elif isinstance(raw, list) and raw:
        first = raw[0]
        boxes = first.get("boxes") if isinstance(first, dict) else first
    if boxes is None:
        return []

    detections: list[Detection] = []
    for item in np.asarray(boxes).tolist():
        if len(item) < 6:
            continue
        class_id, score, x_min, y_min, x_max, y_max = item[:6]
        label = "person" if int(class_id) == 0 else str(int(class_id))
        detections.append(
            Detection(
                bbox=(float(x_min), float(y_min), float(x_max) - float(x_min), float(y_max) - float(y_min)),
                confidence=float(score),
                label=label,
            )
        )
    return detections
