from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import build_app
from app.providers import RouteProvider, RouteProviderError
from tests.test_dto import valid_request_payload


class FailingRouteProvider(RouteProvider):
    def plan_route(self, request):  # type: ignore[override]
        raise RouteProviderError("no route")


def test_plan_endpoint_returns_bundle_and_artifacts() -> None:
    client = TestClient(build_app())

    response = client.post("/v1/missions/plan", json=valid_request_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["missionId"].startswith("msn_")
    assert body["missionBundle"]["routeMode"] == "road_network_following"
    assert body["artifacts"]["missionKmzUrl"].endswith("/artifacts/mission.kmz")


def test_artifact_endpoints_return_kmz_and_meta() -> None:
    client = TestClient(build_app())
    mission = client.post("/v1/missions/plan", json=valid_request_payload()).json()
    mission_id = mission["missionId"]

    kmz_response = client.get(f"/v1/missions/{mission_id}/artifacts/mission.kmz")
    meta_response = client.get(f"/v1/missions/{mission_id}/artifacts/mission_meta.json")

    assert kmz_response.status_code == 200
    assert kmz_response.headers["content-type"] == "application/vnd.google-earth.kmz"
    assert meta_response.status_code == 200
    assert meta_response.json()["missionId"] == mission_id


def test_event_and_telemetry_ingestion_accept_batches() -> None:
    client = TestClient(build_app())

    events_response = client.post(
        "/v1/flights/flight-001/events",
        json={
            "events": [
                {
                    "eventId": "evt-001",
                    "missionId": "msn-001",
                    "type": "VERIFICATION_POINT_REACHED",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"verificationPointId": "vp-001"},
                }
            ]
        },
    )
    telemetry_response = client.post(
        "/v1/flights/flight-001/telemetry:batch",
        json={
            "samples": [
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "lat": 25.0341,
                    "lng": 121.5647,
                    "altitudeM": 34.6,
                    "groundSpeedMps": 3.8,
                    "batteryPct": 78,
                    "flightState": "TRANSIT",
                    "corridorDeviationM": 1.2,
                }
            ]
        },
    )

    assert events_response.status_code == 202
    assert events_response.json() == {"accepted": 1, "rejected": 0}
    assert telemetry_response.status_code == 202
    assert telemetry_response.json() == {"accepted": 1}


def test_plan_endpoint_maps_route_provider_errors_to_route_unavailable() -> None:
    client = TestClient(build_app(route_provider=FailingRouteProvider()))

    response = client.post("/v1/missions/plan", json=valid_request_payload())

    assert response.status_code == 404
    assert response.json()["detail"] == "route_unavailable"
