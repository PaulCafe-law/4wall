from app.models import Mission
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
    assert missions[0]["deliveryStatus"] == "published"
    assert missions[0]["publishedAt"] is not None
    assert missions[0]["failureReason"] is None


def test_mission_detail_includes_delivery_metadata_and_artifacts(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Delivery Org")
        org_id = org.id
        seed_user(
            session,
            email="admin@delivery.test",
            password=PASSWORD,
            org_roles=[(org_id, "customer_admin")],
        )
        session.commit()

    headers, _ = login_web(client, email="admin@delivery.test", password=PASSWORD)
    site_response = client.post(
        "/v1/sites",
        headers=headers,
        json={
            "organizationId": org_id,
            "name": "Delivery Site",
            "address": "Taipei",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "notes": "",
        },
    )
    assert site_response.status_code == 200

    payload = valid_request_payload()
    payload["organizationId"] = org_id
    payload["siteId"] = site_response.json()["siteId"]
    plan_response = client.post("/v1/missions/plan", headers=headers, json=payload)

    assert plan_response.status_code == 200
    mission_id = plan_response.json()["missionId"]

    detail_response = client.get(f"/v1/missions/{mission_id}", headers=headers)

    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["delivery"]["state"] == "published"
    assert detail["delivery"]["publishedAt"] is not None
    assert detail["delivery"]["failureReason"] is None
    assert [artifact["artifactName"] for artifact in detail["artifacts"]] == ["mission.kmz", "mission_meta.json"]
    assert all(artifact["publishedAt"] for artifact in detail["artifacts"])


def test_mission_detail_returns_failure_reason_for_failed_mission(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Failure Org")
        user = seed_user(
            session,
            email="admin@failure.test",
            password=PASSWORD,
            org_roles=[(org.id, "customer_admin")],
        )
        mission = Mission(
            id="msn_failed_delivery",
            organization_id=org.id,
            site_id=None,
            requested_by_user_id=user.id,
            mission_name="Failure Mission",
            status="failed",
            routing_mode="road_network_following",
            bundle_version="bundle-failed",
            demo_mode=False,
            request_json={"missionName": "Failure Mission"},
            response_json={"failureReason": "Route provider timed out for this site."},
        )
        session.add(mission)
        session.commit()

    headers, _ = login_web(client, email="admin@failure.test", password=PASSWORD)
    detail_response = client.get("/v1/missions/msn_failed_delivery", headers=headers)

    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["delivery"] == {
        "state": "failed",
        "publishedAt": None,
        "failureReason": "Route provider timed out for this site.",
    }
    assert detail["artifacts"] == []


def test_mission_list_surfaces_failure_reason_for_failed_delivery(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Failure Summary Org")
        user = seed_user(
            session,
            email="admin@failure-summary.test",
            password=PASSWORD,
            org_roles=[(org.id, "customer_admin")],
        )
        mission = Mission(
            id="msn_failed_summary",
            organization_id=org.id,
            site_id=None,
            requested_by_user_id=user.id,
            mission_name="Summary Failure Mission",
            status="failed",
            routing_mode="road_network_following",
            bundle_version="bundle-failed",
            demo_mode=False,
            request_json={"missionName": "Summary Failure Mission"},
            response_json={"failureReason": "Planner could not publish artifacts."},
        )
        session.add(mission)
        session.commit()

    headers, _ = login_web(client, email="admin@failure-summary.test", password=PASSWORD)
    list_response = client.get("/v1/missions", headers=headers)

    assert list_response.status_code == 200
    missions = list_response.json()
    assert len(missions) == 1
    assert missions[0]["deliveryStatus"] == "failed"
    assert missions[0]["publishedAt"] is None
    assert missions[0]["failureReason"] == "Planner could not publish artifacts."
