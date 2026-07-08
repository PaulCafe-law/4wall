"""Tests for the cv2.dnn YOLOX person-detection backend.

These use a fake ``cv2`` module (monkeypatched into ``sys.modules``) so they run
with neither opencv nor torch installed. The fake ``net.forward`` returns a
scripted raw-YOLOX output ndarray, letting us verify the decode/restore math
against hand-computed numbers.
"""

from __future__ import annotations

import importlib.util
import sys
import types

import numpy as np
import pytest

from presence_worker.config import DetectorConfig
from presence_worker.detector import Detection, build_detector

CV2_INSTALLED = importlib.util.find_spec("cv2") is not None

# Small square input so the total anchor count is tiny and hand-verifiable.
# anchors = (64/8)^2 + (64/16)^2 + (64/32)^2 = 64 + 16 + 4 = 84
INPUT_SIZE = 64
STRIDES = [8, 16, 32]


def _anchor_layout(input_size, strides):
    """Reproduce the detector's grid/stride layout to build scripted outputs."""
    grids = []
    exp = []
    for stride in strides:
        hsize = input_size // stride
        wsize = input_size // stride
        xv, yv = np.meshgrid(np.arange(hsize), np.arange(wsize))
        grid = np.stack((xv, yv), 2).reshape(-1, 2)
        grids.append(grid)
        exp.append(np.full((grid.shape[0], 1), stride, dtype=np.float32))
    return np.concatenate(grids, axis=0).astype(np.float32), np.concatenate(exp, axis=0).astype(np.float32)


GRIDS, EXP_STRIDES = _anchor_layout(INPUT_SIZE, STRIDES)
N_ANCHORS = GRIDS.shape[0]  # 84


class _FakeNet:
    scripted_output: np.ndarray | None = None

    def __init__(self) -> None:
        self.backend = None
        self.target = None
        self.blob = None

    def setPreferableBackend(self, backend):  # noqa: N802 - mirrors cv2 API
        self.backend = backend

    def setPreferableTarget(self, target):  # noqa: N802 - mirrors cv2 API
        self.target = target

    def setInput(self, blob):  # noqa: N802 - mirrors cv2 API
        self.blob = blob

    def forward(self, *_args, **_kwargs):  # noqa: N802 - mirrors cv2 API
        return _FakeNet.scripted_output


class _NmsSpy:
    calls = 0
    last_args = None

    @classmethod
    def reset(cls):
        cls.calls = 0
        cls.last_args = None

    @classmethod
    def nms(cls, boxes, scores, score_threshold, nms_threshold):
        cls.calls += 1
        cls.last_args = (boxes, scores, score_threshold, nms_threshold)
        # Keep every box; real IoU suppression isn't needed for these fixtures.
        return np.arange(len(boxes), dtype=np.int32).reshape(-1, 1)


def _make_fake_cv2(net):
    def cvtColor(image, _code):  # noqa: N802 - mirrors cv2 API
        return image[:, :, ::-1].copy()

    def resize(image, size, interpolation=None):  # noqa: N802 - mirrors cv2 API
        # Nearest-neighbour is fine; preprocessing correctness is not what these
        # tests assert (decode/restore math is).
        dst_w, dst_h = size
        src_h, src_w = image.shape[:2]
        ys = (np.arange(dst_h) * src_h / dst_h).astype(int).clip(0, src_h - 1)
        xs = (np.arange(dst_w) * src_w / dst_w).astype(int).clip(0, src_w - 1)
        return image[ys][:, xs]

    dnn = types.SimpleNamespace(
        readNetFromONNX=lambda _path: net,
        NMSBoxes=_NmsSpy.nms,
        DNN_BACKEND_CUDA=object(),
        DNN_TARGET_CUDA=object(),
        DNN_BACKEND_OPENCV=object(),
        DNN_TARGET_CPU=object(),
    )
    return types.SimpleNamespace(
        dnn=dnn,
        cvtColor=cvtColor,
        resize=resize,
        COLOR_BGR2RGB=object(),
        INTER_LINEAR=object(),
    )


def _install_fake_cv2(monkeypatch, scripted_output):
    _FakeNet.scripted_output = scripted_output
    _NmsSpy.reset()
    net = _FakeNet()
    monkeypatch.setitem(sys.modules, "cv2", _make_fake_cv2(net))
    return net


def _blank_output(n=N_ANCHORS, num_classes=80):
    """All-zero raw YOLOX output (obj=0 -> everything filtered)."""
    return np.zeros((1, n, 5 + num_classes), dtype=np.float32)


def _set_anchor(output, anchor_idx, *, raw_cxcy, raw_wh, obj, cls_id, cls_score, num_classes=80):
    row = np.zeros(5 + num_classes, dtype=np.float32)
    row[0], row[1] = raw_cxcy
    row[2], row[3] = raw_wh
    row[4] = obj
    row[5 + cls_id] = cls_score
    output[0, anchor_idx] = row


def _yolox_config():
    return DetectorConfig(
        backend="yolox",
        model_dir="/models/yolox.onnx",
        device="cpu",
        confidence_threshold=0.4,
        constructor_options={"input_size": INPUT_SIZE, "strides": STRIDES},
    )


def _build(config=None):
    return build_detector(config or _yolox_config())


# --- Tests --------------------------------------------------------------------


def test_decode_maps_cxcywh_to_xywh_in_original_pixels(monkeypatch):
    """A person anchor decodes and restores to a hand-computed (x, y, w, h).

    Uses a central grid cell and a small box so the decoded box lies fully inside
    the image (no edge clipping), making the raw decode math directly verifiable.
    """
    # Stride-8 grid cell (gx=4, gy=4) -> row index gy*8 + gx = 36 (row-major).
    anchor_idx = 36
    gx, gy = GRIDS[anchor_idx]
    stride = float(EXP_STRIDES[anchor_idx][0])
    assert (float(gx), float(gy), stride) == (4.0, 4.0, 8.0)

    # Choose raw values so decode gives round numbers:
    #   cx = (gx + raw_cx) * stride ; cy = (gy + raw_cy) * stride
    #   w  = exp(raw_w) * stride     ; h  = exp(raw_h) * stride
    raw_cx, raw_cy = 0.5, 0.5
    raw_w = np.log(4.0)  # w = 4 * 8 = 32 (letterbox px)
    raw_h = np.log(4.0)  # h = 4 * 8 = 32 (letterbox px)

    out = _blank_output()
    _set_anchor(out, anchor_idx, raw_cxcy=(raw_cx, raw_cy), raw_wh=(raw_w, raw_h),
                obj=0.9, cls_id=0, cls_score=1.0)
    _install_fake_cv2(monkeypatch, out)

    # Feed an image whose smaller side maps ratio = 1.0 so restore is identity:
    # ratio = min(INPUT_SIZE/H, INPUT_SIZE/W). Use H=W=INPUT_SIZE -> ratio = 1.0.
    image = np.zeros((INPUT_SIZE, INPUT_SIZE, 3), dtype=np.uint8)

    detections = _build().detect(image)
    assert len(detections) == 1
    det = detections[0]
    assert isinstance(det, Detection)
    assert det.label == "person"

    # Letterbox-space center/size (ratio 1.0 -> also original px):
    cx = (float(gx) + raw_cx) * stride  # (4.5)*8 = 36
    cy = (float(gy) + raw_cy) * stride  # 36
    w = 4.0 * stride  # 32
    h = 4.0 * stride  # 32
    exp_x = cx - w / 2.0  # 20
    exp_y = cy - h / 2.0  # 20
    x, y, bw, bh = det.bbox
    assert (x, y, bw, bh) == pytest.approx((20.0, 20.0, 32.0, 32.0), abs=1e-3)
    assert (exp_x, exp_y) == (20.0, 20.0)
    # score = obj * cls = 0.9 * 1.0
    assert det.confidence == pytest.approx(0.9, abs=1e-4)


def test_restore_divides_by_letterbox_ratio(monkeypatch):
    """With ratio != 1 the box is scaled back to original-image pixels by /ratio."""
    anchor_idx = 36  # stride-8 grid cell (4, 4)
    gx, gy = GRIDS[anchor_idx]
    stride = float(EXP_STRIDES[anchor_idx][0])
    raw_w = np.log(4.0)  # w = 32 letterbox px
    raw_h = np.log(4.0)  # h = 32 letterbox px
    out = _blank_output()
    _set_anchor(out, anchor_idx, raw_cxcy=(0.5, 0.5), raw_wh=(raw_w, raw_h),
                obj=1.0, cls_id=0, cls_score=1.0)
    _install_fake_cv2(monkeypatch, out)

    # H=W=128 -> ratio = 64/128 = 0.5, so original px = letterbox px / 0.5 = *2.
    image = np.zeros((128, 128, 3), dtype=np.uint8)
    ratio = INPUT_SIZE / 128.0
    assert ratio == 0.5

    detections = _build().detect(image)
    assert len(detections) == 1
    x, y, bw, bh = detections[0].bbox

    cx = (float(gx) + 0.5) * stride  # 36
    cy = (float(gy) + 0.5) * stride  # 36
    w = 4.0 * stride  # 32
    h = 4.0 * stride  # 32
    # Letterbox box (20, 20, 32, 32); /0.5 -> (40, 40, 64, 64), fully in-bounds.
    exp_x = (cx - w / 2.0) / ratio
    exp_y = (cy - h / 2.0) / ratio
    assert (x, y, bw, bh) == pytest.approx((exp_x, exp_y, w / ratio, h / ratio), abs=1e-2)
    assert (exp_x, exp_y, w / ratio, h / ratio) == (40.0, 40.0, 64.0, 64.0)


def test_only_person_class_kept(monkeypatch):
    """Non-person classes (e.g. class 2 = car) are dropped even at high score."""
    out = _blank_output()
    # anchor A: person (class 0), strong
    _set_anchor(out, 5, raw_cxcy=(0.5, 0.5), raw_wh=(np.log(3.0), np.log(6.0)),
                obj=0.95, cls_id=0, cls_score=0.9)
    # anchor B: car (class 2), also strong -> must be filtered out
    _set_anchor(out, 6, raw_cxcy=(0.5, 0.5), raw_wh=(np.log(3.0), np.log(6.0)),
                obj=0.99, cls_id=2, cls_score=0.99)
    _install_fake_cv2(monkeypatch, out)

    image = np.zeros((INPUT_SIZE, INPUT_SIZE, 3), dtype=np.uint8)
    detections = _build().detect(image)
    assert len(detections) == 1
    assert detections[0].label == "person"


def test_score_is_obj_times_cls_and_threshold_applied(monkeypatch):
    """score = obj * cls_person; anchors below confidence_threshold are dropped."""
    out = _blank_output()
    # person above threshold: 0.8 * 0.7 = 0.56 >= 0.4
    _set_anchor(out, 3, raw_cxcy=(0.5, 0.5), raw_wh=(np.log(3.0), np.log(6.0)),
                obj=0.8, cls_id=0, cls_score=0.7)
    # person below threshold: 0.5 * 0.5 = 0.25 < 0.4
    _set_anchor(out, 4, raw_cxcy=(0.5, 0.5), raw_wh=(np.log(3.0), np.log(6.0)),
                obj=0.5, cls_id=0, cls_score=0.5)
    _install_fake_cv2(monkeypatch, out)

    image = np.zeros((INPUT_SIZE, INPUT_SIZE, 3), dtype=np.uint8)
    detections = _build().detect(image)
    assert len(detections) == 1
    assert detections[0].confidence == pytest.approx(0.56, abs=1e-4)


def test_nms_is_invoked_with_xywh_and_thresholds(monkeypatch):
    """cv2.dnn.NMSBoxes is called with (boxes, scores, score_thr, nms_thr)."""
    out = _blank_output()
    _set_anchor(out, 7, raw_cxcy=(0.5, 0.5), raw_wh=(np.log(3.0), np.log(6.0)),
                obj=0.9, cls_id=0, cls_score=0.9)
    _install_fake_cv2(monkeypatch, out)

    cfg = _yolox_config()
    cfg.constructor_options["nms_threshold"] = 0.55
    image = np.zeros((INPUT_SIZE, INPUT_SIZE, 3), dtype=np.uint8)

    detections = _build(cfg).detect(image)
    assert len(detections) == 1
    assert _NmsSpy.calls == 1
    boxes, scores, score_thr, nms_thr = _NmsSpy.last_args
    assert score_thr == pytest.approx(0.4)
    assert nms_thr == pytest.approx(0.55)
    # boxes handed to NMS are xywh in original-image pixels.
    assert len(boxes) == 1 and len(boxes[0]) == 4
    assert scores[0] == pytest.approx(0.81, abs=1e-4)  # 0.9 * 0.9


def test_empty_when_all_below_threshold(monkeypatch):
    """Honest empty result when nothing clears the score threshold."""
    out = _blank_output()  # all obj = 0
    _install_fake_cv2(monkeypatch, out)
    image = np.zeros((INPUT_SIZE, INPUT_SIZE, 3), dtype=np.uint8)
    assert _build().detect(image) == []


def test_gpu_device_sets_cuda_backend(monkeypatch):
    """device='gpu' asks cv2.dnn for the CUDA backend/target."""
    net = _install_fake_cv2(monkeypatch, _blank_output())
    cfg = DetectorConfig(
        backend="yolox",
        model_dir="/models/yolox.onnx",
        device="gpu",
        confidence_threshold=0.4,
        constructor_options={"input_size": INPUT_SIZE, "strides": STRIDES},
    )
    _build(cfg)
    import cv2  # the fake

    assert net.backend is cv2.dnn.DNN_BACKEND_CUDA
    assert net.target is cv2.dnn.DNN_TARGET_CUDA


def test_missing_model_path_raises(monkeypatch):
    from presence_worker.detector import DetectorUnavailable

    _install_fake_cv2(monkeypatch, _blank_output())
    cfg = DetectorConfig(backend="yolox", model_dir="", device="cpu")
    with pytest.raises(DetectorUnavailable):
        _build(cfg)


@pytest.mark.skipif(not CV2_INSTALLED, reason="cv2 not installed")
def test_real_cv2_import_path_is_reachable():
    """Sanity: with real cv2 present, a bad path surfaces DetectorUnavailable
    (readNetFromONNX fails) rather than an import error."""
    from presence_worker.detector import DetectorUnavailable

    cfg = DetectorConfig(backend="yolox", model_dir="/nonexistent/model.onnx", device="cpu")
    with pytest.raises(DetectorUnavailable):
        _build(cfg)
