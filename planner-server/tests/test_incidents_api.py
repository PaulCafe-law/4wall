from datetime import datetime, timezone

from app.models import IncidentRecord
from tests.helpers import login_web, seed_organization, seed_user


PASSWORD = "Password123!"


def test_customer_admin_can_close_incident_loop_and_summary_counts(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Incident Org")
        org_id = org.id
        seed_user(
            session,
            email="admin@incident.test",
            password=PASSWORD,
            display_name="Incident Admin",
            org_roles=[(org_id, "customer_admin")],
        )
        session.commit()

    headers, _ = login_web(client, email="admin@incident.test", password=PASSWORD)
    create_response = client.post(
        "/v1/incidents",
        headers=headers,
        json={
            "organizationId": org_id,
            "title": "A 區空壓機壓力表疑似異常",
            "description": "壓力表數值超出日常巡檢區間。",
            "severity": "high",
            "source": "ai_detection",
            "location": {
                "siteName": "工廠 A",
                "areaName": "A 區",
                "equipmentName": "空壓機",
            },
            "evidence": [{"type": "text", "text": "AI frame score 0.91"}],
        },
    )
    assert create_response.status_code == 200, create_response.text
    incident = create_response.json()
    incident_id = incident["incidentId"]
    assert incident["status"] == "pending_review"
    assert incident["lineNotifications"][0]["status"] == "disabled"

    confirmed = client.patch(
        f"/v1/incidents/{incident_id}/status",
        headers=headers,
        json={"status": "confirmed"},
    )
    assert confirmed.status_code == 200, confirmed.text
    assigned = client.patch(
        f"/v1/incidents/{incident_id}/assignee",
        headers=headers,
        json={"assigneeName": "fieldpilot"},
    )
    assert assigned.status_code == 200, assigned.text
    comment = client.post(
        f"/v1/incidents/{incident_id}/comments",
        headers=headers,
        json={"content": "現場已收到，先隔離設備周邊。"},
    )
    assert comment.status_code == 200, comment.text
    in_progress = client.patch(
        f"/v1/incidents/{incident_id}/status",
        headers=headers,
        json={"status": "in_progress"},
    )
    assert in_progress.status_code == 200, in_progress.text
    resolved = client.patch(
        f"/v1/incidents/{incident_id}/status",
        headers=headers,
        json={"status": "resolved"},
    )
    assert resolved.status_code == 200, resolved.text
    body = resolved.json()
    assert body["status"] == "resolved"
    assert body["assigneeName"] == "fieldpilot"
    assert body["resolvedAt"] is not None
    assert len(body["comments"]) == 1
    assert [item["action"] for item in body["history"]][-1] == "incident.status_changed"

    summary_date = body["createdAt"][:10]
    summary = client.get(f"/v1/incidents/summary?date={summary_date}", headers=headers)
    assert summary.status_code == 200, summary.text
    summary_body = summary.json()
    assert summary_body["newIncidentCount"] == 1
    assert summary_body["statusCounts"]["resolved"] == 1
    assert summary_body["severityCounts"]["high"] == 1
    assert summary_body["resolvedIncidents"][0]["incidentId"] == incident_id


def test_incidents_are_sorted_by_severity_then_newest(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Sort Org")
        org_id = org.id
        seed_user(session, email="sort@incident.test", password=PASSWORD, org_roles=[(org_id, "customer_admin")])
        session.add(
            IncidentRecord(
                organization_id=org_id,
                title="Low old",
                severity="low",
                source="manual",
                created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            )
        )
        session.add(
            IncidentRecord(
                organization_id=org_id,
                title="Critical old",
                severity="critical",
                source="manual",
                created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
                updated_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            )
        )
        session.add(
            IncidentRecord(
                organization_id=org_id,
                title="High newest",
                severity="high",
                source="manual",
                created_at=datetime(2026, 1, 3, tzinfo=timezone.utc),
                updated_at=datetime(2026, 1, 3, tzinfo=timezone.utc),
            )
        )
        session.commit()

    headers, _ = login_web(client, email="sort@incident.test", password=PASSWORD)
    response = client.get("/v1/incidents", headers=headers)
    assert response.status_code == 200, response.text
    assert [item["title"] for item in response.json()] == ["Critical old", "High newest", "Low old"]


def test_customer_viewer_cannot_mutate_incident(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Viewer Incident Org")
        org_id = org.id
        seed_user(session, email="admin2@incident.test", password=PASSWORD, org_roles=[(org_id, "customer_admin")])
        seed_user(session, email="viewer@incident.test", password=PASSWORD, org_roles=[(org_id, "customer_viewer")])
        session.commit()

    admin_headers, _ = login_web(client, email="admin2@incident.test", password=PASSWORD)
    create_response = client.post(
        "/v1/incidents",
        headers=admin_headers,
        json={
            "organizationId": org_id,
            "title": "工地 2F 東側材料堆放阻塞通道",
            "severity": "critical",
            "source": "manual",
            "location": {"siteName": "工地 B", "areaName": "2F 東側"},
        },
    )
    incident_id = create_response.json()["incidentId"]

    viewer_headers, _ = login_web(client, email="viewer@incident.test", password=PASSWORD)
    read_response = client.get(f"/v1/incidents/{incident_id}", headers=viewer_headers)
    blocked_response = client.patch(
        f"/v1/incidents/{incident_id}/status",
        headers=viewer_headers,
        json={"status": "confirmed"},
    )

    assert read_response.status_code == 200
    assert blocked_response.status_code == 403


def test_invalid_status_transition_is_rejected(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Transition Org")
        org_id = org.id
        seed_user(session, email="transition@incident.test", password=PASSWORD, org_roles=[(org_id, "customer_admin")])
        session.commit()

    headers, _ = login_web(client, email="transition@incident.test", password=PASSWORD)
    create_response = client.post(
        "/v1/incidents",
        headers=headers,
        json={
            "organizationId": org_id,
            "title": "外牆局部疑似裂縫",
            "severity": "medium",
            "source": "drone",
            "location": {"siteName": "大樓 C", "areaName": "外牆"},
        },
    )
    incident_id = create_response.json()["incidentId"]
    blocked = client.patch(
        f"/v1/incidents/{incident_id}/status",
        headers=headers,
        json={"status": "resolved"},
    )
    assert blocked.status_code == 422
    assert blocked.json()["detail"] == "invalid_incident_status_transition"
