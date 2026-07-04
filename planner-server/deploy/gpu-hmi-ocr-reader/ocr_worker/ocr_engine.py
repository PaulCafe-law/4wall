from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

import numpy as np

from .config import OcrConfig


@dataclass(frozen=True)
class OcrTextLine:
    text: str
    confidence: float
    box: list[list[float]] | None = None


class OcrEngine(Protocol):
    def recognize(self, image: np.ndarray) -> list[OcrTextLine]:
        ...


class PaddleOcrEngine:
    def __init__(self, config: OcrConfig) -> None:
        if config.engine != "paddle":
            raise ValueError(f"unsupported OCR engine: {config.engine}")
        self.config = config
        self._ocr = self._create_ocr(config)

    def recognize(self, image: np.ndarray) -> list[OcrTextLine]:
        if hasattr(self._ocr, "predict"):
            result = self._ocr.predict(image)
        else:
            result = self._ocr.ocr(image, cls=True)
        return parse_paddle_result(result)

    @staticmethod
    def _create_ocr(config: OcrConfig) -> Any:
        try:
            from paddleocr import PaddleOCR
        except ImportError as exc:
            raise RuntimeError("paddleocr is not installed in this environment") from exc

        common = {
            "lang": config.lang,
            **config.constructor_options,
        }
        if config.ocr_version:
            common["ocr_version"] = config.ocr_version

        attempts = []
        if config.device:
            attempts.append({**common, "device": config.device})
        attempts.append({**common, "use_gpu": config.device.startswith("gpu")})
        attempts.append(common)
        if config.ocr_version:
            without_version = {key: value for key, value in common.items() if key != "ocr_version"}
            if config.device:
                attempts.append({**without_version, "device": config.device})
            attempts.append({**without_version, "use_gpu": config.device.startswith("gpu")})
            attempts.append(without_version)

        last_error: Exception | None = None
        for kwargs in attempts:
            try:
                return PaddleOCR(**kwargs)
            except TypeError as exc:
                last_error = exc
        if last_error:
            raise last_error
        return PaddleOCR(**common)


def parse_paddle_result(result: Any) -> list[OcrTextLine]:
    lines: list[OcrTextLine] = []
    _collect_lines(result, lines)
    return lines


def _collect_lines(node: Any, output: list[OcrTextLine]) -> None:
    if node is None:
        return

    if hasattr(node, "json"):
        try:
            json_value = node.json() if callable(node.json) else node.json
            _collect_lines(json_value, output)
            return
        except Exception:
            pass

    if isinstance(node, dict):
        texts = node.get("rec_texts") or node.get("texts")
        scores = node.get("rec_scores") or node.get("scores")
        boxes = node.get("dt_polys") or node.get("boxes")
        if isinstance(texts, list):
            for index, text in enumerate(texts):
                confidence = _score_at(scores, index)
                box = _box_at(boxes, index)
                output.append(OcrTextLine(text=str(text), confidence=confidence, box=box))
            return
        for value in node.values():
            _collect_lines(value, output)
        return

    if isinstance(node, (list, tuple)):
        if _looks_like_old_line(node):
            text = str(node[1][0])
            confidence = float(node[1][1])
            output.append(OcrTextLine(text=text, confidence=confidence, box=_normalize_box(node[0])))
            return
        for item in node:
            _collect_lines(item, output)


def _looks_like_old_line(node: Any) -> bool:
    return (
        isinstance(node, (list, tuple))
        and len(node) >= 2
        and isinstance(node[1], (list, tuple))
        and len(node[1]) >= 2
        and isinstance(node[1][0], str)
        and isinstance(node[1][1], (int, float))
    )


def _score_at(scores: Any, index: int) -> float:
    if isinstance(scores, (list, tuple)) and index < len(scores):
        try:
            return float(scores[index])
        except (TypeError, ValueError):
            return 0.0
    return 0.0


def _box_at(boxes: Any, index: int) -> list[list[float]] | None:
    if isinstance(boxes, (list, tuple)) and index < len(boxes):
        return _normalize_box(boxes[index])
    return None


def _normalize_box(box: Any) -> list[list[float]] | None:
    if box is None:
        return None
    normalized: list[list[float]] = []
    try:
        for point in box:
            normalized.append([float(point[0]), float(point[1])])
    except (TypeError, ValueError, IndexError):
        return None
    return normalized
