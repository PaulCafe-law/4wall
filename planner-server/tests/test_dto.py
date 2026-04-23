from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.dto import FlightEventsRequestDto, MissionPlanRequestDto, TelemetryBatchRequestDto
from tests.helpers import valid_request_payload


def test_mission_plan_request_validates_happy_path() -> None:
    request = MissionPlanRequestDto(**valid_request_payload())

    assert request.routingMode == "road_network_following"
    assert request.launchPoint.launchPointId == "launch-01"
    assert request.orderedWaypoints[0].waypointId == "wp-01"
    assert request.operatingProfile == "outdoor_gps_patrol"


def test_mission_plan_request_rejects_empty_waypoints() -> None:
    payload = valid_request_payload()
    payload["orderedWaypoints"] = []

    with pytest.raises(ValidationError):
        MissionPlanRequestDto(**payload)


def test_mission_plan_request_requires_contiguous_sequences() -> None:
    payload = valid_request_payload()
    payload["orderedWaypoints"][1]["sequence"] = 3

    with pytest.raises(ValidationError):
        MissionPlanRequestDto(**payload)


def test_flight_events_request_accepts_json_payload() -> None:
    request = FlightEventsRequestDto(
        missionId="msn-001",
        events=[
            {
                "eventId": "evt-001",
                "type": "VERIFICATION_POINT_REACHED",
                "timestamp": datetime.now(timezone.utc),
                "payload": {"verificationPointId": "vp-branch-001"},
            }
        ],
    )

    assert request.events[0].payload["verificationPointId"] == "vp-branch-001"


def test_telemetry_batch_requires_samples() -> None:
    with pytest.raises(ValidationError):
        TelemetryBatchRequestDto(missionId="msn-001", samples=[])
