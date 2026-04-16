from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlmodel import select

from app.models import AuditEvent, Mission
from tests.helpers import login_web, seed_organization, seed_site, seed_user, valid_request_payload


PASSWORD = "Password123!"


def _prepare_live_mission(client, session_factory) -> tuple[str, str, dict[str, str], dict[str, str], dict[str, str]]:
    with session_factory() as session:
        organization = seed_organization(session, name="Acme Build")
        seed_user(
            session,
            email="admin@acme.test",
            password=PASSWORD,
            display_name="Acme Admin",
            org_roles=[(organization.id, "customer_admin")],
        )
        seed_user(
            session,
            email="viewer@acme.test",
            password=PASSWORD,
            display_name="Acme Viewer",
            org_roles=[(organization.id, "customer_viewer")],
        )
        seed_user(
            session,
            email="ops@platform.test",
            password=PASSWORD,
            display_name="Platform Ops",
            global_roles=["ops"],
        )
        site = seed_site(session, organization_id=organization.id, name="Tower A")
        session.commit()
        organization_id = organization.id
        site_id = site.id

    admin_headers, _ = login_web(client, email="admin@acme.test", password=PASSWORD)
    viewer_headers, _ = login_web(client, email="viewer@acme.test", password=PASSWORD)
    ops_headers, _ = login_web(client, email="ops@platform.test", password=PASSWORD)

    payload = valid_request_payload()
    payload["organizationId"] = organization_id
    payload["siteId"] = site_id
    mission_response = client.post("/v1/missions/plan", headers=admin_headers, json=payload)
    assert mission_response.status_code == 200, mission_response.text
    mission_id = mission_response.json()["missionId"]

    return organization_id, mission_id, admin_headers, viewer_headers, ops_headers


def test_live_ops_detail_is_internal_only_and_returns_freshness_video_and_lease(
    client,
    session_factory,
    auth_headers,
) -> None:
    organization_id, mission_id, admin_headers, _, ops_headers = _prepare_live_mission(client, session_factory)
    now = datetime.now(timezone.utc)

    events_response = client.post(
        "/v1/flights/flight-live-001/events",
        headers=auth_headers,
        json={
            "missionId": mission_id,
            "events": [
                {
                    "eventId": "evt-lease-001",
                    "type": "CONTROL_LEASE_UPDATED",
                    "timestamp": now.isoformat(),
                    "payload": {
                        "holder": "hq",
                        "mode": "remote_control_requested",
                        "remoteControlEnabled": "false",
                        "observerReady": "true",
                        "heartbeatHealthy": "true",
                        "expiresAt": (now + timedelta(minutes=5)).isoformat(),
                    },
                },
                {
                    "eventId": "evt-video-001",
                    "type": "VIDEO_STREAM_STATE",
                    "timestamp": now.isoformat(),
                    "payload": {
                        "available": "true",
                        "streaming": "true",
                        "viewerUrl": "https://viewer.example.test/live/flight-live-001",
                        "codec": "h264",
                        "latencyMs": "850",
                        "lastFrameAt": now.isoformat(),
                    },
                },
            ],
        },
    )
    telemetry_response = client.post(
        "/v1/flights/flight-live-001/telemetry:batch",
        headers=auth_headers,
        json={
            "missionId": mission_id,
            "samples": [
                {
                    "timestamp": now.isoformat(),
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

    list_response = client.get("/v1/live-ops/flights", headers=ops_headers)
    assert list_response.status_code == 200, list_response.text
    listed = list_response.json()
    assert listed[0]["flightId"] == "flight-live-001"
    assert listed[0]["telemetryFreshness"] == "fresh"
    assert listed[0]["video"]["status"] == "live"

    response = client.get("/v1/live-ops/flights/flight-live-001", headers=ops_headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["organizationId"] == organization_id
    assert body["missionId"] == mission_id
    assert body["latestTelemetry"]["batteryPct"] == 78
    assert body["telemetryFreshness"] == "fresh"
    assert body["telemetryAgeSeconds"] is not None
    assert body["telemetryAgeSeconds"] < 30
    assert body["video"]["available"] is True
    assert body["video"]["streaming"] is True
    assert body["video"]["viewerUrl"] == "https://viewer.example.test/live/flight-live-001"
    assert body["video"]["status"] == "live"
    assert body["video"]["ageSeconds"] is not None
    assert body["controlLease"]["mode"] == "remote_control_requested"
    assert body["controlLease"]["observerReady"] is True
    assert body["recentEvents"][0]["eventType"] in {"VIDEO_STREAM_STATE", "CONTROL_LEASE_UPDATED"}

    customer_response = client.get("/v1/live-ops/flights/flight-live-001", headers=admin_headers)
    assert customer_response.status_code == 403
    assert customer_response.json()["detail"] == "forbidden_role"


def test_control_intent_request_is_recorded_and_viewer_cannot_request(
    client,
    session_factory,
    auth_headers,
) -> None:
    _, mission_id, admin_headers, viewer_headers, ops_headers = _prepare_live_mission(client, session_factory)
    flight_id = "flight-live-002"
    now = datetime.now(timezone.utc)

    events_response = client.post(
        f"/v1/flights/{flight_id}/events",
        headers=auth_headers,
        json={
            "missionId": mission_id,
            "events": [
                {
                    "eventId": "evt-remote-ready",
                    "type": "CONTROL_LEASE_UPDATED",
                    "timestamp": now.isoformat(),
                    "payload": {
                        "holder": "site_control_station",
                        "mode": "monitor_only",
                        "remoteControlEnabled": "false",
                        "observerReady": "true",
                        "heartbeatHealthy": "true",
                    },
                }
            ],
        },
    )
    assert events_response.status_code == 202

    response = client.post(
        f"/v1/live-ops/flights/{flight_id}/control-intents",
        headers=ops_headers,
        json={"action": "request_remote_control", "reason": "HQ operator takeover drill"},
    )
    assert response.status_code == 202, response.text
    assert response.json()["status"] == "requested"
    assert response.json()["action"] == "request_remote_control"

    list_response = client.get(
        f"/v1/live-ops/flights/{flight_id}/control-intents",
        headers=ops_headers,
    )
    assert list_response.status_code == 200
    assert list_response.json()[0]["action"] == "request_remote_control"

    customer_admin_response = client.post(
        f"/v1/live-ops/flights/{flight_id}/control-intents",
        headers=admin_headers,
        json={"action": "hold", "reason": "customer admin should not mutate live ops"},
    )
    assert customer_admin_response.status_code == 403
    assert customer_admin_response.json()["detail"] == "forbidden_role"

    viewer_response = client.post(
        f"/v1/live-ops/flights/{flight_id}/control-intents",
        headers=viewer_headers,
        json={"action": "hold", "reason": "viewer should not mutate"},
    )
    assert viewer_response.status_code == 403
    assert viewer_response.json()["detail"] == "forbidden_role"

    with session_factory() as session:
        audit_events = session.exec(
            select(AuditEvent)
            .where(AuditEvent.target_type == "flight", AuditEvent.target_id == flight_id)
            .order_by(AuditEvent.created_at.desc())
        ).all()
    assert any(event.action == "flight.control_intent_requested" for event in audit_events)


def test_support_queue_is_internal_only_and_surfaces_triage_context(
    client,
    session_factory,
    auth_headers,
) -> None:
    _, mission_id, admin_headers, _, ops_headers = _prepare_live_mission(client, session_factory)
    flight_id = "flight-live-003"
    now = datetime.now(timezone.utc)
    stale_sample_time = now - timedelta(minutes=3)

    with session_factory() as session:
        mission = session.get(Mission, mission_id)
        assert mission is not None
        mission.status = "failed"
        session.add(mission)
        session.commit()

    events_response = client.post(
        f"/v1/flights/{flight_id}/events",
        headers=auth_headers,
        json={
            "missionId": mission_id,
            "events": [
                {
                    "eventId": "evt-bridge-alert",
                    "type": "BRIDGE_ALERT",
                    "timestamp": now.isoformat(),
                    "payload": {
                        "severity": "critical",
                        "code": "uplink_degraded",
                        "summary": "Android bridge reported unstable uplink quality.",
                    },
                }
            ],
        },
    )
    telemetry_response = client.post(
        f"/v1/flights/{flight_id}/telemetry:batch",
        headers=auth_headers,
        json={
            "missionId": mission_id,
            "samples": [
                {
                    "timestamp": stale_sample_time.isoformat(),
                    "lat": 25.0341,
                    "lng": 121.5647,
                    "altitudeM": 34.6,
                    "groundSpeedMps": 2.1,
                    "batteryPct": 20,
                    "flightState": "HOLD",
                    "corridorDeviationM": 0.4,
                }
            ],
        },
    )
    assert events_response.status_code == 202
    assert telemetry_response.status_code == 202

    internal_response = client.get("/v1/support/queue", headers=ops_headers)
    assert internal_response.status_code == 200, internal_response.text
    items = internal_response.json()

    by_id = {item["itemId"]: item for item in items}
    bridge_item = next(item for item in items if item["category"] == "bridge_alert")

    failed_item = by_id[f"mission-failed-{mission_id}"]
    assert failed_item["category"] == "mission_failed"
    assert failed_item["organizationName"] == "Acme Build"
    assert failed_item["missionName"] == "building-a-demo"
    assert failed_item["siteName"] == "Tower A"
    assert failed_item["lastObservedAt"] is not None
    assert failed_item["workflow"]["state"] == "open"
    assert "mission request" in failed_item["recommendedNextStep"]

    battery_item = by_id[f"battery-{flight_id}"]
    assert battery_item["category"] == "battery_low"
    assert battery_item["severity"] == "warning"
    assert battery_item["flightId"] == flight_id
    assert battery_item["lastObservedAt"] is not None

    stale_item = by_id[f"telemetry-stale-{flight_id}"]
    assert stale_item["category"] == "telemetry_stale"
    assert stale_item["severity"] == "critical"
    assert stale_item["flightId"] == flight_id
    assert stale_item["lastObservedAt"] is not None
    assert "monitor-only" in stale_item["summary"]

    assert bridge_item["category"] == "bridge_alert"
    assert bridge_item["organizationName"] == "Acme Build"
    assert bridge_item["flightId"] == flight_id
    assert bridge_item["lastObservedAt"] is not None
    assert "lease" in bridge_item["recommendedNextStep"]

    customer_response = client.get("/v1/support/queue", headers=admin_headers)
    assert customer_response.status_code == 403
    assert customer_response.json()["detail"] == "forbidden_role"


def test_support_queue_actions_update_workflow_and_hide_resolved_items(
    client,
    session_factory,
    auth_headers,
) -> None:
    _, mission_id, admin_headers, _, ops_headers = _prepare_live_mission(client, session_factory)
    flight_id = "flight-live-004"
    now = datetime.now(timezone.utc)

    with session_factory() as session:
        mission = session.get(Mission, mission_id)
        assert mission is not None
        mission.status = "failed"
        session.add(mission)
        session.commit()

    events_response = client.post(
        f"/v1/flights/{flight_id}/events",
        headers=auth_headers,
        json={
            "missionId": mission_id,
            "events": [
                {
                    "eventId": "evt-bridge-alert-resolve",
                    "type": "BRIDGE_ALERT",
                    "timestamp": now.isoformat(),
                    "payload": {
                        "severity": "warning",
                        "code": "viewer_unavailable",
                        "summary": "Viewer stream was temporarily unavailable.",
                    },
                }
            ],
        },
    )
    assert events_response.status_code == 202

    support_response = client.get("/v1/support/queue", headers=ops_headers)
    assert support_response.status_code == 200, support_response.text
    bridge_item = next(item for item in support_response.json() if item["category"] == "bridge_alert")
    item_id = bridge_item["itemId"]

    claim_response = client.post(
        f"/v1/support/queue/{item_id}/actions",
        headers=ops_headers,
        json={"action": "claim"},
    )
    assert claim_response.status_code == 202, claim_response.text
    assert claim_response.json()["state"] == "claimed"

    after_claim = client.get("/v1/support/queue", headers=ops_headers)
    claimed_item = next(item for item in after_claim.json() if item["itemId"] == item_id)
    assert claimed_item["workflow"]["state"] == "claimed"
    assert claimed_item["workflow"]["assignedToDisplayName"] == "Platform Ops"

    acknowledge_response = client.post(
        f"/v1/support/queue/{item_id}/actions",
        headers=ops_headers,
        json={"action": "acknowledge"},
    )
    assert acknowledge_response.status_code == 202
    assert acknowledge_response.json()["state"] == "acknowledged"

    resolve_response = client.post(
        f"/v1/support/queue/{item_id}/actions",
        headers=ops_headers,
        json={"action": "resolve"},
    )
    assert resolve_response.status_code == 202
    assert resolve_response.json()["state"] == "resolved"

    after_resolve = client.get("/v1/support/queue", headers=ops_headers)
    assert all(item["itemId"] != item_id for item in after_resolve.json())

    customer_response = client.post(
        f"/v1/support/queue/{item_id}/actions",
        headers=admin_headers,
        json={"action": "claim"},
    )
    assert customer_response.status_code == 403
    assert customer_response.json()["detail"] == "forbidden_role"
