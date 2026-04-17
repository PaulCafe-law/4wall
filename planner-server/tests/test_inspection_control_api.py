from tests.helpers import login_web, seed_organization, seed_user, valid_request_payload


PASSWORD = "Password123!"


def test_customer_admin_can_create_control_plane_records_and_dispatch_mission(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Control Plane Org")
        org_id = org.id
        seed_user(
            session,
            email="admin@control-plane.test",
            password=PASSWORD,
            org_roles=[(org_id, "customer_admin")],
        )
        session.commit()

    headers, _ = login_web(client, email="admin@control-plane.test", password=PASSWORD)
    site_response = client.post(
        "/v1/sites",
        headers=headers,
        json={
            "organizationId": org_id,
            "name": "Tower A",
            "address": "Taipei",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "notes": "Facade demo site",
        },
    )
    assert site_response.status_code == 200, site_response.text
    site_id = site_response.json()["siteId"]

    route_response = client.post(
        "/v1/inspection/routes",
        headers=headers,
        json={
            "organizationId": org_id,
            "siteId": site_id,
            "name": "Tower A facade loop",
            "description": "Demo envelope",
            "planningParameters": {"routeMode": "site-envelope-demo"},
            "waypoints": [
                {
                    "kind": "transit",
                    "lat": 25.0337,
                    "lng": 121.5643,
                    "altitudeM": 40,
                    "label": "ingress",
                },
                {
                    "kind": "inspection_viewpoint",
                    "lat": 25.03391,
                    "lng": 121.56452,
                    "altitudeM": 32,
                    "label": "facade",
                    "dwellSeconds": 18,
                },
            ],
        },
    )
    assert route_response.status_code == 200, route_response.text
    route_id = route_response.json()["routeId"]

    template_response = client.post(
        "/v1/inspection/templates",
        headers=headers,
        json={
            "organizationId": org_id,
            "siteId": site_id,
            "routeId": route_id,
            "name": "Facade standard",
            "description": "Operator reviewed",
            "inspectionProfile": {"profile": "facade-standard"},
            "alertRules": [{"kind": "mission_failure"}],
        },
    )
    assert template_response.status_code == 200, template_response.text
    template_id = template_response.json()["templateId"]

    schedule_response = client.post(
        "/v1/inspection/schedules",
        headers=headers,
        json={
            "organizationId": org_id,
            "siteId": site_id,
            "routeId": route_id,
            "templateId": template_id,
            "plannedAt": "2026-04-18T09:00:00Z",
            "status": "scheduled",
            "alertRules": [{"kind": "report_generation_failure"}],
        },
    )
    assert schedule_response.status_code == 200, schedule_response.text
    schedule_id = schedule_response.json()["scheduleId"]
    assert schedule_response.json()["nextRunAt"] == "2026-04-18T09:00:00Z"
    assert schedule_response.json()["lastOutcome"] == "scheduled_for_execution"

    paused_schedule = client.patch(
        f"/v1/inspection/schedules/{schedule_id}",
        headers=headers,
        json={
            "status": "paused",
            "pauseReason": "Weather hold before launch window.",
        },
    )
    assert paused_schedule.status_code == 200, paused_schedule.text
    assert paused_schedule.json()["status"] == "paused"
    assert paused_schedule.json()["pauseReason"] == "Weather hold before launch window."
    assert paused_schedule.json()["nextRunAt"] is None

    resumed_schedule = client.patch(
        f"/v1/inspection/schedules/{schedule_id}",
        headers=headers,
        json={"status": "scheduled"},
    )
    assert resumed_schedule.status_code == 200, resumed_schedule.text
    assert resumed_schedule.json()["status"] == "scheduled"
    assert resumed_schedule.json()["pauseReason"] is None
    assert resumed_schedule.json()["nextRunAt"] == "2026-04-18T09:00:00Z"

    payload = valid_request_payload()
    payload["organizationId"] = org_id
    payload["siteId"] = site_id
    plan_response = client.post("/v1/missions/plan", headers=headers, json=payload)
    assert plan_response.status_code == 200, plan_response.text
    mission_id = plan_response.json()["missionId"]

    dispatch_response = client.post(
        f"/v1/missions/{mission_id}/dispatch",
        headers=headers,
        json={
            "routeId": route_id,
            "templateId": template_id,
            "scheduleId": schedule_id,
            "assignee": "observer-01",
            "executionTarget": "field-team",
            "status": "assigned",
            "note": "Ready for demo dispatch",
        },
    )
    assert dispatch_response.status_code == 200, dispatch_response.text
    assert dispatch_response.json()["status"] == "assigned"
    assert dispatch_response.json()["acceptedAt"] is None
    assert dispatch_response.json()["closedAt"] is None

    dispatch_id = dispatch_response.json()["dispatchId"]
    dispatch_list = client.get(
        f"/v1/inspection/dispatch?siteId={site_id}",
        headers=headers,
    )
    assert dispatch_list.status_code == 200, dispatch_list.text
    assert len(dispatch_list.json()) == 1
    assert dispatch_list.json()[0]["dispatchId"] == dispatch_id

    accepted_dispatch = client.patch(
        f"/v1/inspection/dispatch/{dispatch_id}",
        headers=headers,
        json={"status": "accepted", "note": "Field team accepted handoff."},
    )
    assert accepted_dispatch.status_code == 200, accepted_dispatch.text
    assert accepted_dispatch.json()["status"] == "accepted"
    assert accepted_dispatch.json()["acceptedAt"] is not None
    assert accepted_dispatch.json()["closedAt"] is None

    completed_dispatch = client.patch(
        f"/v1/inspection/dispatch/{dispatch_id}",
        headers=headers,
        json={"status": "completed", "note": "Field execution finished."},
    )
    assert completed_dispatch.status_code == 200, completed_dispatch.text
    assert completed_dispatch.json()["status"] == "completed"
    assert completed_dispatch.json()["acceptedAt"] is not None
    assert completed_dispatch.json()["closedAt"] is not None

    mission_detail = client.get(f"/v1/missions/{mission_id}", headers=headers)

    assert mission_detail.status_code == 200, mission_detail.text
    body = mission_detail.json()
    assert body["status"] == "completed"
    assert body["route"]["routeId"] == route_id
    assert body["template"]["templateId"] == template_id
    assert body["schedule"]["scheduleId"] == schedule_id
    assert body["schedule"]["lastDispatchedAt"] is not None
    assert body["dispatch"]["assignee"] == "observer-01"
    assert body["dispatch"]["executionTarget"] == "field-team"
    assert body["dispatch"]["acceptedAt"] is not None
    assert body["dispatch"]["closedAt"] is not None


def test_customer_viewer_can_read_but_not_write_control_plane_records(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Control Plane Viewer Org")
        org_id = org.id
        seed_user(
            session,
            email="admin@control-plane-viewer.test",
            password=PASSWORD,
            org_roles=[(org_id, "customer_admin")],
        )
        seed_user(
            session,
            email="viewer@control-plane-viewer.test",
            password=PASSWORD,
            org_roles=[(org_id, "customer_viewer")],
        )
        session.commit()

    admin_headers, _ = login_web(client, email="admin@control-plane-viewer.test", password=PASSWORD)
    site_response = client.post(
        "/v1/sites",
        headers=admin_headers,
        json={
            "organizationId": org_id,
            "name": "Viewer Site",
            "address": "Taipei",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "notes": "",
        },
    )
    assert site_response.status_code == 200
    site_id = site_response.json()["siteId"]

    route_response = client.post(
        "/v1/inspection/routes",
        headers=admin_headers,
        json={
            "organizationId": org_id,
            "siteId": site_id,
            "name": "Viewer Route",
            "description": "Read-only route",
            "planningParameters": {"routeMode": "site-envelope-demo"},
            "waypoints": [
                {
                    "kind": "inspection_viewpoint",
                    "lat": 25.03391,
                    "lng": 121.56452,
                    "altitudeM": 30,
                    "label": "facade",
                    "dwellSeconds": 12,
                }
            ],
        },
    )
    assert route_response.status_code == 200

    viewer_headers, _ = login_web(client, email="viewer@control-plane-viewer.test", password=PASSWORD)
    list_response = client.get(f"/v1/inspection/routes?siteId={site_id}", headers=viewer_headers)
    create_response = client.post(
        "/v1/inspection/routes",
        headers=viewer_headers,
        json={
            "organizationId": org_id,
            "siteId": site_id,
            "name": "Blocked Route",
            "description": "Should not work",
            "planningParameters": {"routeMode": "site-envelope-demo"},
            "waypoints": [
                {
                    "kind": "inspection_viewpoint",
                    "lat": 25.03391,
                    "lng": 121.56452,
                    "altitudeM": 30,
                    "label": "facade",
                    "dwellSeconds": 12,
                }
            ],
        },
    )

    assert list_response.status_code == 200, list_response.text
    assert len(list_response.json()) == 1
    assert create_response.status_code == 403


def test_site_detail_returns_site_map_context_and_active_route_template_summaries(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Site Detail Org")
        org_id = org.id
        seed_user(
            session,
            email="admin@site-detail.test",
            password=PASSWORD,
            org_roles=[(org_id, "customer_admin")],
        )
        session.commit()

    headers, _ = login_web(client, email="admin@site-detail.test", password=PASSWORD)
    site_response = client.post(
        "/v1/sites",
        headers=headers,
        json={
            "organizationId": org_id,
            "name": "Tower A",
            "externalRef": "tower-a",
            "address": "Taipei",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "notes": "Facade demo site",
        },
    )
    assert site_response.status_code == 200, site_response.text
    site = site_response.json()
    site_id = site["siteId"]
    assert site["siteMap"]["baseMapType"] == "satellite"
    assert len(site["siteMap"]["zones"]) == 1
    assert len(site["siteMap"]["launchPoints"]) == 1
    assert len(site["siteMap"]["viewpoints"]) == 1

    route_response = client.post(
        "/v1/inspection/routes",
        headers=headers,
        json={
            "organizationId": org_id,
            "siteId": site_id,
            "name": "Tower A facade loop",
            "description": "Demo envelope",
            "planningParameters": {"routeMode": "site-envelope-demo", "routeVersion": 2},
            "waypoints": [
                {
                    "kind": "transit",
                    "lat": 25.0337,
                    "lng": 121.5643,
                    "altitudeM": 40,
                    "label": "ingress",
                },
                {
                    "kind": "inspection_viewpoint",
                    "lat": 25.03391,
                    "lng": 121.56452,
                    "altitudeM": 32,
                    "label": "facade",
                    "dwellSeconds": 18,
                },
            ],
        },
    )
    assert route_response.status_code == 200, route_response.text
    route_id = route_response.json()["routeId"]

    template_response = client.post(
        "/v1/inspection/templates",
        headers=headers,
        json={
            "organizationId": org_id,
            "siteId": site_id,
            "routeId": route_id,
            "name": "Facade standard",
            "description": "Operator reviewed",
            "inspectionProfile": {
                "profile": "facade-standard",
                "evidencePolicy": "capture_key_frames",
                "reportMode": "html_report",
                "reviewMode": "operator_review",
            },
            "alertRules": [{"kind": "mission_failure"}],
        },
    )
    assert template_response.status_code == 200, template_response.text

    detail_response = client.get(f"/v1/sites/{site_id}", headers=headers)
    assert detail_response.status_code == 200, detail_response.text
    detail = detail_response.json()

    assert detail["activeRouteCount"] == 1
    assert detail["activeTemplateCount"] == 1
    assert detail["activeRoutes"][0]["routeId"] == route_id
    assert detail["activeRoutes"][0]["version"] == 2
    assert detail["activeRoutes"][0]["estimatedDurationSec"] > 0
    assert detail["activeTemplates"][0]["name"] == "Facade standard"
    assert detail["activeTemplates"][0]["reportMode"] == "html_report"

    patch_response = client.patch(
        f"/v1/sites/{site_id}",
        headers=headers,
        json={
            "name": "Tower A Updated",
            "location": {"lat": 25.034, "lng": 121.565},
            "siteMap": {
                "baseMapType": "hybrid",
                "center": {"lat": 25.034, "lng": 121.565},
                "zoom": 19,
                "version": 3,
                "zones": detail["siteMap"]["zones"],
                "launchPoints": detail["siteMap"]["launchPoints"],
                "viewpoints": detail["siteMap"]["viewpoints"],
            },
        },
    )
    assert patch_response.status_code == 200, patch_response.text
    patched = patch_response.json()
    assert patched["name"] == "Tower A Updated"
    assert patched["siteMap"]["baseMapType"] == "hybrid"
    assert patched["siteMap"]["version"] == 3
