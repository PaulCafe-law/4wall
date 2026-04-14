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
    assert org_a_body["members"][0]["email"] == "admin@orga.test"
    assert org_a_body["members"][0]["displayName"] == "admin"
    assert org_a_body["pendingInvites"] == []
    assert client.get(f"/v1/organizations/{org_b_id}", headers=org_a_headers).status_code == 403

    org_b_headers, _ = login_web(client, email="viewer@orgb.test", password=PASSWORD)
    org_b_response = client.get(f"/v1/organizations/{org_b_id}", headers=org_b_headers)
    assert org_b_response.status_code == 200
    org_b_body = org_b_response.json()
    assert org_b_body["organizationId"] == org_b_id
    assert len(org_b_body["members"]) == 1
    assert org_b_body["members"][0]["email"] == "viewer@orgb.test"
    assert client.get(f"/v1/organizations/{org_a_id}", headers=org_b_headers).status_code == 403


def test_customer_admin_can_update_own_organization_and_manage_members(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="North Tower Builders")
        organization_id = organization.id
        seed_user(
            session,
            email="admin@north.test",
            password=PASSWORD,
            display_name="North Admin",
            org_roles=[(organization_id, "customer_admin")],
        )
        viewer = seed_user(
            session,
            email="viewer@north.test",
            password=PASSWORD,
            display_name="North Viewer",
            org_roles=[(organization_id, "customer_viewer")],
        )
        viewer_membership_id = next(
            membership for membership in viewer_memberships(session, viewer.id) if membership.organization_id == organization_id
        ).id
        session.commit()

    admin_headers, _ = login_web(client, email="admin@north.test", password=PASSWORD)

    rename_response = client.patch(
        f"/v1/organizations/{organization_id}",
        headers=admin_headers,
        json={"name": "North Tower Group"},
    )
    assert rename_response.status_code == 200
    assert rename_response.json()["name"] == "North Tower Group"

    role_response = client.patch(
        f"/v1/organizations/{organization_id}/members/{viewer_membership_id}",
        headers=admin_headers,
        json={"role": "customer_admin"},
    )
    assert role_response.status_code == 200
    assert role_response.json()["email"] == "viewer@north.test"
    assert role_response.json()["displayName"] == "North Viewer"
    assert role_response.json()["role"] == "customer_admin"
    assert role_response.json()["isActive"] is True

    deactivate_response = client.patch(
        f"/v1/organizations/{organization_id}/members/{viewer_membership_id}",
        headers=admin_headers,
        json={"role": "customer_admin", "isActive": False},
    )
    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["isActive"] is False

    reactivate_response = client.patch(
        f"/v1/organizations/{organization_id}/members/{viewer_membership_id}",
        headers=admin_headers,
        json={"role": "customer_viewer", "isActive": True},
    )
    assert reactivate_response.status_code == 200
    assert reactivate_response.json()["role"] == "customer_viewer"
    assert reactivate_response.json()["isActive"] is True

    detail_response = client.get(f"/v1/organizations/{organization_id}", headers=admin_headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["name"] == "North Tower Group"


def test_customer_viewer_cannot_update_org_or_members(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Read Only Org")
        organization_id = organization.id
        seed_user(
            session,
            email="admin@readonly.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        viewer = seed_user(
            session,
            email="viewer@readonly.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_viewer")],
        )
        viewer_membership_id = next(
            membership for membership in viewer_memberships(session, viewer.id) if membership.organization_id == organization_id
        ).id
        session.commit()

    viewer_headers, _ = login_web(client, email="viewer@readonly.test", password=PASSWORD)

    rename_response = client.patch(
        f"/v1/organizations/{organization_id}",
        headers=viewer_headers,
        json={"name": "Blocked Rename"},
    )
    assert rename_response.status_code == 403
    assert rename_response.json()["detail"] == "forbidden_role"

    update_member_response = client.patch(
        f"/v1/organizations/{organization_id}/members/{viewer_membership_id}",
        headers=viewer_headers,
        json={"role": "customer_admin"},
    )
    assert update_member_response.status_code == 403
    assert update_member_response.json()["detail"] == "forbidden_role"


def test_membership_update_preserves_last_customer_admin(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Single Admin Org")
        organization_id = organization.id
        admin = seed_user(
            session,
            email="admin@single.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        admin_membership_id = next(
            membership for membership in viewer_memberships(session, admin.id) if membership.organization_id == organization_id
        ).id
        session.commit()

    admin_headers, _ = login_web(client, email="admin@single.test", password=PASSWORD)

    demote_response = client.patch(
        f"/v1/organizations/{organization_id}/members/{admin_membership_id}",
        headers=admin_headers,
        json={"role": "customer_viewer"},
    )
    assert demote_response.status_code == 409
    assert demote_response.json()["detail"] == "organization_requires_customer_admin"

    deactivate_response = client.patch(
        f"/v1/organizations/{organization_id}/members/{admin_membership_id}",
        headers=admin_headers,
        json={"role": "customer_admin", "isActive": False},
    )
    assert deactivate_response.status_code == 409
    assert deactivate_response.json()["detail"] == "organization_requires_customer_admin"


def viewer_memberships(session, user_id: str):
    from sqlmodel import select

    from app.models import OrganizationMembership

    return list(session.exec(select(OrganizationMembership).where(OrganizationMembership.user_id == user_id)).all())
