from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.dto import FlightEventsRequestDto, MissionPlanRequestDto, TelemetryBatchRequestDto
from tests.helpers import valid_request_payload


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
