from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.dto import (
    FlightEventsRequestDto,
    InspectionIntentDto,
    InspectionViewpointRequestDto,
    MissionPlanRequestDto,
)


def valid_request_payload() -> dict:
    return {
        "missionName": "building-a-demo",
        "origin": {"lat": 25.03391, "lng": 121.56452},
        "targetBuilding": {"buildingId": "tower-a", "label": "Tower A"},
        "routingMode": "road_network_following",
        "corridorPolicy": {
            "defaultHalfWidthM": 8.0,
            "maxHalfWidthM": 12.0,
            "branchConfirmRadiusM": 18.0,
        },
        "flightProfile": {
            "defaultAltitudeM": 35.0,
            "defaultSpeedMps": 4.0,
            "maxApproachSpeedMps": 1.0,
        },
        "inspectionIntent": {
            "viewpoints": [
                {
                    "viewpointId": "vp-01",
                    "label": "north-east-facade",
                    "lat": 25.03441,
                    "lng": 121.56501,
                    "yawDeg": 225.0,
                    "distanceToFacadeM": 12.0,
                }
            ]
        },
        "demoMode": True,
    }


def test_mission_plan_request_validates_happy_path() -> None:
    request = MissionPlanRequestDto(**valid_request_payload())

    assert request.routingMode == "road_network_following"
    assert request.inspectionIntent.viewpoints[0].viewpointId == "vp-01"


def test_mission_plan_request_rejects_empty_viewpoints() -> None:
    payload = valid_request_payload()
    payload["inspectionIntent"] = {"viewpoints": []}

    with pytest.raises(ValidationError):
        MissionPlanRequestDto(**payload)


def test_corridor_policy_rejects_smaller_max_width() -> None:
    payload = valid_request_payload()
    payload["corridorPolicy"]["maxHalfWidthM"] = 4.0

    with pytest.raises(ValidationError):
        MissionPlanRequestDto(**payload)


def test_flight_events_request_accepts_json_payload() -> None:
    request = FlightEventsRequestDto(
        events=[
            {
                "eventId": "evt-001",
                "missionId": "msn-001",
                "type": "VERIFICATION_POINT_REACHED",
                "timestamp": datetime.now(timezone.utc),
                "payload": {"verificationPointId": "vp-branch-001"},
            }
        ]
    )

    assert request.events[0].payload["verificationPointId"] == "vp-branch-001"
