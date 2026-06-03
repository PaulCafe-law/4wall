from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.dto import FlightEventsRequestDto, MissionPlanRequestDto, TelemetryBatchRequestDto
from app.incident_dto import IncidentLocationDto
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


def test_incident_location_accepts_site_map_anchor_fields() -> None:
    location = IncidentLocationDto(
        siteId="site-001",
        siteName="建研所工地",
        areaName="A 區",
        floor="2F",
        equipmentName="空壓機",
        anchorId="anchor-compressor-a",
        floorplanX=0.42,
        floorplanY=0.58,
        worldX=-12.5,
        worldY=3.0,
        worldZ=8.25,
        ifcGuid="ifc-guid-001",
        revitElementId="revit-12345",
        modelObjectId="model-compressor-a",
    )

    payload = location.model_dump()

    assert payload["anchorId"] == "anchor-compressor-a"
    assert payload["floorplanX"] == 0.42
    assert payload["revitElementId"] == "revit-12345"
    assert payload["modelObjectId"] == "model-compressor-a"
