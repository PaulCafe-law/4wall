from datetime import datetime, timezone

from tests.helpers import login_web, seed_organization, seed_user, valid_request_payload


PASSWORD = "Password123!"


def test_mission_list_only_returns_current_org_records(client, session_factory) -> None:
    with session_factory() as session:
        org_a = seed_organization(session, name="Mission Org A")
        org_b = seed_organization(session, name="Mission Org B")
        org_a_id = org_a.id
        org_b_id = org_b.id
        seed_user(
            session,
            email="admin@missions-a.test",
            password=PASSWORD,
            org_roles=[(org_a_id, "customer_admin")],
        )
        seed_user(
            session,
            email="admin@missions-b.test",
            password=PASSWORD,
            org_roles=[(org_b_id, "customer_admin")],
        )
        session.commit()

    headers_a, _ = login_web(client, email="admin@missions-a.test", password=PASSWORD)
    site_a = client.post(
        "/v1/sites",
        headers=headers_a,
        json={
            "organizationId": org_a_id,
            "name": "Mission A",
            "address": "Taipei",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "notes": "",
        },
    )
    assert site_a.status_code == 200
    payload_a = valid_request_payload()
    payload_a["organizationId"] = org_a_id
    payload_a["siteId"] = site_a.json()["siteId"]
    assert client.post("/v1/missions/plan", headers=headers_a, json=payload_a).status_code == 200

    headers_b, _ = login_web(client, email="admin@missions-b.test", password=PASSWORD)
    site_b = client.post(
        "/v1/sites",
        headers=headers_b,
        json={
            "organizationId": org_b_id,
            "name": "Mission B",
            "address": "Kaohsiung",
            "location": {"lat": 22.6273, "lng": 120.3014},
            "notes": "",
        },
    )
    assert site_b.status_code == 200
    payload_b = valid_request_payload()
    payload_b["organizationId"] = org_b_id
    payload_b["siteId"] = site_b.json()["siteId"]
    assert client.post("/v1/missions/plan", headers=headers_b, json=payload_b).status_code == 200

    list_response = client.get("/v1/missions", headers=headers_a)

    assert list_response.status_code == 200
    missions = list_response.json()
    assert len(missions) == 1
    assert missions[0]["organizationId"] == org_a_id
    assert missions[0]["operatingProfile"] == "outdoor_gps_patrol"
    assert missions[0]["waypointCount"] == 2
    assert missions[0]["implicitReturnToLaunch"] is True
    assert missions[0]["launchPoint"]["label"] == "tower-a-launch"


def test_mission_detail_includes_patrol_route_summary(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Mission Detail Org")
        organization_id = organization.id
        seed_user(
            session,
            email="admin@mission-detail.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        session.commit()

    headers, _ = login_web(client, email="admin@mission-detail.test", password=PASSWORD)
    site_response = client.post(
        "/v1/sites",
        headers=headers,
        json={
            "organizationId": organization_id,
            "name": "Mission Detail Site",
            "address": "Taichung",
            "location": {"lat": 24.1477, "lng": 120.6736},
            "notes": "",
        },
    )
    assert site_response.status_code == 200

    payload = valid_request_payload()
    payload["organizationId"] = organization_id
    payload["siteId"] = site_response.json()["siteId"]
    plan_response = client.post("/v1/missions/plan", headers=headers, json=payload)
    assert plan_response.status_code == 200, plan_response.text

    mission_id = plan_response.json()["missionId"]
    detail_response = client.get(f"/v1/missions/{mission_id}", headers=headers)

    assert detail_response.status_code == 200, detail_response.text
    detail = detail_response.json()
    assert detail["routeMode"] == "road_network_following"
    assert detail["operatingProfile"] == "outdoor_gps_patrol"
    assert detail["waypointCount"] == 2
    assert detail["implicitReturnToLaunch"] is True
    assert detail["launchPoint"]["label"] == "tower-a-launch"


def test_mission_detail_includes_execution_summary_from_latest_flight_event(
    client,
    session_factory,
    auth_headers,
) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Mission Execution Org")
        organization_id = organization.id
        seed_user(
            session,
            email="admin@mission-execution.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        session.commit()

    headers, _ = login_web(client, email="admin@mission-execution.test", password=PASSWORD)
    site_response = client.post(
        "/v1/sites",
        headers=headers,
        json={
            "organizationId": organization_id,
            "name": "Mission Execution Site",
            "address": "Tainan",
            "location": {"lat": 23.0, "lng": 120.2},
            "notes": "",
        },
    )
    assert site_response.status_code == 200

    payload = valid_request_payload()
    payload["organizationId"] = organization_id
    payload["siteId"] = site_response.json()["siteId"]
    plan_response = client.post("/v1/missions/plan", headers=headers, json=payload)
    assert plan_response.status_code == 200, plan_response.text

    mission_id = plan_response.json()["missionId"]
    now = datetime.now(timezone.utc)
    events_response = client.post(
        "/v1/flights/flight-mission-detail-001/events",
        headers=auth_headers,
        json={
            "missionId": mission_id,
            "events": [
                {
                    "eventId": "evt-execution-001",
                    "type": "MISSION_STAGE_CHANGED",
                    "timestamp": now.isoformat(),
                    "payload": {
                        "stage": "TRANSIT",
                        "executionState": "transit",
                        "uploadState": "uploaded",
                        "waypointProgress": "1 / 2",
                        "plannedOperatingProfile": "outdoor_gps_patrol",
                        "executedOperatingProfile": "indoor_no_gps",
                        "executionMode": "manual_pilot",
                        "cameraStreamState": "streaming",
                        "recordingState": "recording",
                        "landingPhase": "confirmation_required",
                        "fallbackReason": "",
                        "statusNote": "Mission started",
                        "missionUploaded": "true",
                    },
                }
            ],
        },
    )
    assert events_response.status_code == 202, events_response.text

    detail_response = client.get(f"/v1/missions/{mission_id}", headers=headers)
    assert detail_response.status_code == 200, detail_response.text
    detail = detail_response.json()
    assert detail["executionSummary"]["flightId"] == "flight-mission-detail-001"
    assert detail["executionSummary"]["uploadState"] == "uploaded"
    assert detail["executionSummary"]["executionState"] == "transit"
    assert detail["executionSummary"]["waypointProgress"] == "1 / 2"
    assert detail["executionSummary"]["plannedOperatingProfile"] == "outdoor_gps_patrol"
    assert detail["executionSummary"]["executedOperatingProfile"] == "indoor_no_gps"
    assert detail["executionSummary"]["executionMode"] == "manual_pilot"
    assert detail["executionSummary"]["cameraStreamState"] == "streaming"
    assert detail["executionSummary"]["recordingState"] == "recording"
    assert detail["executionSummary"]["landingPhase"] == "confirmation_required"
    assert detail["executionSummary"]["statusNote"] == "Mission started"
