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
    raise DetectorUnavailable(f"unsupported detector backend: {config.backend}")


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
