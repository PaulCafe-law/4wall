from datetime import datetime, timezone

from tests.helpers import login_web, seed_organization, seed_user, valid_request_payload


PASSWORD = "Password123!"


def test_org_scope_blocks_cross_tenant_mission_artifact_and_flight_reads(client, session_factory, auth_headers) -> None:
    with session_factory() as session:
        org_a = seed_organization(session, name="Org A")
        org_b = seed_organization(session, name="Org B")
        org_a_id = org_a.id
        org_b_id = org_b.id
        seed_user(
            session,
            email="admin@orga.test",
            password=PASSWORD,
            org_roles=[(org_a_id, "customer_admin")],
        )
        seed_user(
            session,
            email="admin@orgb.test",
            password=PASSWORD,
            org_roles=[(org_b_id, "customer_admin")],
        )
        session.commit()

    org_a_headers, _ = login_web(client, email="admin@orga.test", password=PASSWORD)
    site_response = client.post(
        "/v1/sites",
        headers=org_a_headers,
        json={
            "organizationId": org_a_id,
            "name": "Org A Site",
            "externalRef": "ORG-A-001",
            "address": "Taipei",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "notes": "primary",
        },
    )
    assert site_response.status_code == 200
    site_id = site_response.json()["siteId"]

    payload = valid_request_payload()
    payload["organizationId"] = org_a_id
    payload["siteId"] = site_id
    mission_response = client.post("/v1/missions/plan", headers=org_a_headers, json=payload)
    assert mission_response.status_code == 200
    mission_id = mission_response.json()["missionId"]

    events_response = client.post(
        "/v1/flights/flight-org-a/events",
        headers=auth_headers,
        json={
            "missionId": mission_id,
            "events": [
                {
                    "eventId": "evt-scope-001",
                    "type": "VERIFICATION_POINT_REACHED",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"verificationPointId": "vp-001"},
                }
            ],
        },
    )
    telemetry_response = client.post(
        "/v1/flights/flight-org-a/telemetry:batch",
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
    assert telemetry_response.status_code == 202

    org_b_headers, _ = login_web(client, email="admin@orgb.test", password=PASSWORD)

    assert client.get(f"/v1/missions/{mission_id}", headers=org_b_headers).status_code == 403
    assert client.get(f"/v1/missions/{mission_id}/artifacts/mission.kmz", headers=org_b_headers).status_code == 403
    assert client.get(f"/v1/flights/flight-org-a/events", headers=org_b_headers).status_code == 403
    assert client.get(f"/v1/flights/flight-org-a/telemetry", headers=org_b_headers).status_code == 403


def test_org_scope_allows_customer_team_reads_for_own_org_only(client, session_factory) -> None:
    with session_factory() as session:
        org_a = seed_organization(session, name="Org A")
        org_b = seed_organization(session, name="Org B")
        org_a_id = org_a.id
        org_b_id = org_b.id
        seed_user(
            session,
            email="admin@orga.test",
            password=PASSWORD,
            org_roles=[(org_a_id, "customer_admin")],
        )
        seed_user(
            session,
            email="viewer@orgb.test",
            password=PASSWORD,
            org_roles=[(org_b_id, "customer_viewer")],
        )
        session.commit()

    org_a_headers, _ = login_web(client, email="admin@orga.test", password=PASSWORD)
    org_a_response = client.get(f"/v1/organizations/{org_a_id}", headers=org_a_headers)
    assert org_a_response.status_code == 200
    org_a_body = org_a_response.json()
    assert org_a_body["organizationId"] == org_a_id
    assert len(org_a_body["members"]) == 1
    assert org_a_body["pendingInvites"] == []
    assert client.get(f"/v1/organizations/{org_b_id}", headers=org_a_headers).status_code == 403

    org_b_headers, _ = login_web(client, email="viewer@orgb.test", password=PASSWORD)
    org_b_response = client.get(f"/v1/organizations/{org_b_id}", headers=org_b_headers)
    assert org_b_response.status_code == 200
    org_b_body = org_b_response.json()
    assert org_b_body["organizationId"] == org_b_id
    assert len(org_b_body["members"]) == 1
    assert client.get(f"/v1/organizations/{org_a_id}", headers=org_b_headers).status_code == 403
