from __future__ import annotations

from presence_worker.detector import Detection
from presence_worker.geometry import foot_point, project_point, valid_detection


def test_detection_filters_confidence_height_label_and_polygon() -> None:
    assert valid_detection(
        Detection(bbox=(10, 20, 30, 80), confidence=0.9),
        image_width=200,
        image_height=200,
        min_confidence=0.5,
        min_bbox_height_px=40,
        valid_region_polygon=[(0, 0), (200, 0), (200, 200), (0, 200)],
    )
    assert not valid_detection(
        Detection(bbox=(10, 20, 30, 30), confidence=0.9),
        image_width=200,
        image_height=200,
        min_confidence=0.5,
        min_bbox_height_px=40,
        valid_region_polygon=[],
    )
    assert not valid_detection(
        Detection(bbox=(10, 20, 30, 80), confidence=0.49),
        image_width=200,
        image_height=200,
        min_confidence=0.5,
        min_bbox_height_px=40,
        valid_region_polygon=[],
    )
    assert not valid_detection(
        Detection(bbox=(10, 20, 30, 80), confidence=0.9, label="machine"),
        image_width=200,
        image_height=200,
        min_confidence=0.5,
        min_bbox_height_px=40,
        valid_region_polygon=[],
    )
    assert not valid_detection(
        Detection(bbox=(150, 150, 30, 80), confidence=0.9),
        image_width=200,
        image_height=200,
        min_confidence=0.5,
        min_bbox_height_px=40,
        valid_region_polygon=[],
    )
    assert not valid_detection(
        Detection(bbox=(120, 20, 30, 80), confidence=0.9),
        image_width=200,
        image_height=200,
        min_confidence=0.5,
        min_bbox_height_px=40,
        valid_region_polygon=[(0, 0), (100, 0), (100, 200), (0, 200)],
    )


def test_foot_point_and_homography_projection() -> None:
    detection = Detection(bbox=(10, 20, 30, 80), confidence=0.9)
    assert foot_point(detection) == (25.0, 100)
    assert project_point([[0.1, 0, -1], [0, 0.2, -2], [0, 0, 1]], foot_point(detection)) == {
        "x": 1.5,
        "z": 18.0,
    }
    assert project_point(None, foot_point(detection)) is None
    assert project_point([[1, 0, 0], [0, 1, 0], [0, 0, 0]], foot_point(detection)) is None
