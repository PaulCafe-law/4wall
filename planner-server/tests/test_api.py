from datetime import datetime, timezone

from tests.helpers import valid_request_payload


def test_healthcheck_reports_database_ready(client) -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "dependencies": {
            "database": {
                "status": "ok",
            }
        },
    }


def test_healthcheck_returns_503_when_database_is_unavailable(client, app, monkeypatch) -> None:
    class BrokenEngine:
        def connect(self):
            raise RuntimeError("db unavailable")

    monkeypatch.setattr(app.state, "engine", BrokenEngine())

    response = client.get("/healthz")

    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "dependencies": {
            "database": {
                "status": "error",
                "error": "RuntimeError",
            }
        },
    }


def test_plan_endpoint_requires_auth(client) -> None:
    response = client.post("/v1/missions/plan", json=valid_request_payload())

    assert response.status_code == 401
    assert response.json()["detail"] == "missing_bearer_token"


def test_plan_and_artifact_endpoints_require_auth_and_return_checksums(client, auth_headers) -> None:
    mission_response = client.post("/v1/missions/plan", json=valid_request_payload(), headers=auth_headers)

    assert mission_response.status_code == 200
    mission = mission_response.json()
    mission_id = mission["missionId"]
    assert mission["artifacts"]["missionKmz"]["checksumSha256"]
    assert mission["artifacts"]["missionMeta"]["checksumSha256"]

    kmz_response = client.get(f"/v1/missions/{mission_id}/artifacts/mission.kmz", headers=auth_headers)
    meta_response = client.get(f"/v1/missions/{mission_id}/artifacts/mission_meta.json", headers=auth_headers)

    assert kmz_response.status_code == 200
    assert kmz_response.headers["x-artifact-checksum"] == mission["artifacts"]["missionKmz"]["checksumSha256"]
    assert meta_response.status_code == 200
    assert meta_response.headers["x-artifact-checksum"] == mission["artifacts"]["missionMeta"]["checksumSha256"]
    assert meta_response.json()["missionId"] == mission_id


def test_event_and_telemetry_ingestion_persist_batches(client, auth_headers) -> None:
    mission_id = client.post("/v1/missions/plan", json=valid_request_payload(), headers=auth_headers).json()["missionId"]

    events_response = client.post(
        "/v1/flights/flight-001/events",
        headers=auth_headers,
        json={
            "missionId": mission_id,
            "events": [
                {
                    "eventId": "evt-001",
                    "type": "VERIFICATION_POINT_REACHED",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"verificationPointId": "vp-001"},
                }
            ],
        },
    )
    telemetry_response = client.post(
        "/v1/flights/flight-001/telemetry:batch",
        headers=auth_headers,
        json={
            "missionId": mission_id,
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
            ],
        },
    )

    assert events_response.status_code == 202
    assert events_response.json() == {"accepted": 1, "rejected": 0}
    assert telemetry_response.status_code == 202
    assert telemetry_response.json() == {"accepted": 1}
