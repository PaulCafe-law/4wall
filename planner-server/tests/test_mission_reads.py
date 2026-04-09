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
