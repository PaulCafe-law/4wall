from tests.helpers import login_web, seed_organization, seed_user, valid_request_payload


PASSWORD = "Password123!"


def test_internal_user_can_reprocess_analysis_and_read_generated_report(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Reporting Org")
        org_id = org.id
        seed_user(
            session,
            email="admin@reporting.test",
            password=PASSWORD,
            org_roles=[(org_id, "customer_admin")],
        )
        seed_user(
            session,
            email="ops@reporting.test",
            password=PASSWORD,
            global_roles=["ops"],
        )
        session.commit()

    admin_headers, _ = login_web(client, email="admin@reporting.test", password=PASSWORD)
    site_response = client.post(
        "/v1/sites",
        headers=admin_headers,
        json={
            "organizationId": org_id,
            "name": "Reporting Site",
            "address": "Taipei",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "notes": "",
        },
    )
    assert site_response.status_code == 200, site_response.text

    payload = valid_request_payload()
    payload["organizationId"] = org_id
    payload["siteId"] = site_response.json()["siteId"]
    plan_response = client.post("/v1/missions/plan", headers=admin_headers, json=payload)
    assert plan_response.status_code == 200, plan_response.text
    mission_id = plan_response.json()["missionId"]

    ops_headers, _ = login_web(client, email="ops@reporting.test", password=PASSWORD)
    reprocess_response = client.post(
        f"/v1/missions/{mission_id}/analysis/reprocess",
        headers=ops_headers,
        json={"mode": "normal"},
    )

    assert reprocess_response.status_code == 202, reprocess_response.text
    report = reprocess_response.json()
    assert report["status"] == "ready"
    assert report["eventCount"] == 2
    assert report["downloadArtifact"]["artifactName"] == "inspection_report.html"

    events_response = client.get(f"/v1/missions/{mission_id}/events", headers=admin_headers)
    assert events_response.status_code == 200, events_response.text
    events = events_response.json()
    assert len(events) == 2
    assert events[0]["evidenceArtifacts"]

    report_response = client.get(f"/v1/missions/{mission_id}/report", headers=admin_headers)
    assert report_response.status_code == 200, report_response.text
    assert report_response.json()["status"] == "ready"

    overview_response = client.get("/v1/web/overview", headers=admin_headers)
    assert overview_response.status_code == 200, overview_response.text
    overview = overview_response.json()
    assert overview["latestReportSummary"]["status"] == "ready"
    assert overview["latestEventSummary"]["missionId"] == mission_id

    artifact_response = client.get(
        f"/v1/missions/{mission_id}/artifacts/inspection_report.html",
        headers=admin_headers,
    )
    assert artifact_response.status_code == 200, artifact_response.text
    assert "inspection report" in artifact_response.text


def test_customer_admin_cannot_reprocess_analysis(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Reporting Admin Org")
        org_id = org.id
        seed_user(
            session,
            email="admin@reporting-admin.test",
            password=PASSWORD,
            org_roles=[(org_id, "customer_admin")],
        )
        session.commit()

    admin_headers, _ = login_web(client, email="admin@reporting-admin.test", password=PASSWORD)
    site_response = client.post(
        "/v1/sites",
        headers=admin_headers,
        json={
            "organizationId": org_id,
            "name": "Reporting Admin Site",
            "address": "Taipei",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "notes": "",
        },
    )
    assert site_response.status_code == 200, site_response.text

    payload = valid_request_payload()
    payload["organizationId"] = org_id
    payload["siteId"] = site_response.json()["siteId"]
    plan_response = client.post("/v1/missions/plan", headers=admin_headers, json=payload)
    assert plan_response.status_code == 200, plan_response.text
    mission_id = plan_response.json()["missionId"]

    response = client.post(
        f"/v1/missions/{mission_id}/analysis/reprocess",
        headers=admin_headers,
        json={"mode": "normal"},
    )
    assert response.status_code == 403


def test_analysis_failure_mode_sets_failed_report_without_events(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Reporting Failure Org")
        org_id = org.id
        seed_user(
            session,
            email="admin@reporting-failure.test",
            password=PASSWORD,
            org_roles=[(org_id, "customer_admin")],
        )
        seed_user(
            session,
            email="ops@reporting-failure.test",
            password=PASSWORD,
            global_roles=["ops"],
        )
        session.commit()

    admin_headers, _ = login_web(client, email="admin@reporting-failure.test", password=PASSWORD)
    site_response = client.post(
        "/v1/sites",
        headers=admin_headers,
        json={
            "organizationId": org_id,
            "name": "Reporting Failure Site",
            "address": "Taipei",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "notes": "",
        },
    )
    assert site_response.status_code == 200, site_response.text

    payload = valid_request_payload()
    payload["organizationId"] = org_id
    payload["siteId"] = site_response.json()["siteId"]
    plan_response = client.post("/v1/missions/plan", headers=admin_headers, json=payload)
    assert plan_response.status_code == 200, plan_response.text
    mission_id = plan_response.json()["missionId"]

    ops_headers, _ = login_web(client, email="ops@reporting-failure.test", password=PASSWORD)
    reprocess_response = client.post(
        f"/v1/missions/{mission_id}/analysis/reprocess",
        headers=ops_headers,
        json={"mode": "analysis_failed"},
    )

    assert reprocess_response.status_code == 202, reprocess_response.text
    report = reprocess_response.json()
    assert report["status"] == "failed"
    assert report["eventCount"] == 0
    assert report["downloadArtifact"] is None

    events_response = client.get(f"/v1/missions/{mission_id}/events", headers=admin_headers)
    assert events_response.status_code == 200, events_response.text
    assert events_response.json() == []
