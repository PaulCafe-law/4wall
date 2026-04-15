from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.models import BillingInvoice, Invite, Mission
from tests.helpers import login_web, seed_organization, seed_user, valid_request_payload


PASSWORD = "Password123!"


def test_customer_overview_aggregates_missions_invoices_and_pending_invites(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Overview Org")
        seed_user(
            session,
            email="admin@overview.test",
            password=PASSWORD,
            org_roles=[(org.id, "customer_admin")],
        )
        session.add(
            BillingInvoice(
                organization_id=org.id,
                invoice_number=f"INV-{uuid4().hex[:6]}",
                currency="TWD",
                subtotal=10000,
                tax=500,
                total=10500,
                due_date=datetime.now(timezone.utc) - timedelta(days=2),
                status="overdue",
                payment_note="Waiting for remittance advice",
            )
        )
        session.add(
            Invite(
                organization_id=org.id,
                email="viewer@overview.test",
                role="customer_viewer",
                token_hash=f"invite-{uuid4().hex}",
                expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            )
        )
        session.commit()
        org_id = org.id

    headers, _ = login_web(client, email="admin@overview.test", password=PASSWORD)
    site_response = client.post(
        "/v1/sites",
        headers=headers,
        json={
            "organizationId": org_id,
            "name": "Overview Site",
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

    with session_factory() as session:
        mission = Mission(
            id="msn_overview_failed",
            organization_id=org_id,
            site_id=site_response.json()["siteId"],
            requested_by_user_id=None,
            mission_name="Overview Failure Mission",
            status="failed",
            routing_mode="road_network_following",
            bundle_version="bundle-failed",
            demo_mode=False,
            request_json={"missionName": "Overview Failure Mission"},
            response_json={"failureReason": "Artifacts were not published."},
        )
        session.add(mission)
        session.commit()

    response = client.get("/v1/web/overview", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["siteCount"] == 1
    assert body["missionCount"] == 2
    assert body["failedMissionCount"] == 1
    assert body["publishedMissionCount"] == 1
    assert body["overdueInvoiceCount"] == 1
    assert body["pendingInviteCount"] == 1
    assert body["supportSummary"] is None
    assert body["recentDeliveries"][0]["deliveryStatus"] == "published"
    assert body["recentInvoices"][0]["status"] == "overdue"
    assert body["pendingInvites"][0]["organizationName"] == "Overview Org"


def test_internal_overview_includes_support_summary(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Ops Overview Org")
        user = seed_user(
            session,
            email="admin@ops-overview.test",
            password=PASSWORD,
            org_roles=[(org.id, "customer_admin")],
        )
        seed_user(
            session,
            email="ops@ops-overview.test",
            password=PASSWORD,
            global_roles=["ops"],
        )
        session.add(
            Mission(
                id="msn_internal_failed",
                organization_id=org.id,
                site_id=None,
                requested_by_user_id=user.id,
                mission_name="Internal Failure Mission",
                status="failed",
                routing_mode="road_network_following",
                bundle_version="bundle-failed",
                demo_mode=False,
                request_json={"missionName": "Internal Failure Mission"},
                response_json={"failureReason": "Planner timed out."},
            )
        )
        session.add(
            BillingInvoice(
                organization_id=org.id,
                invoice_number=f"INV-{uuid4().hex[:6]}",
                currency="TWD",
                subtotal=8000,
                tax=400,
                total=8400,
                due_date=datetime.now(timezone.utc) - timedelta(days=1),
                status="overdue",
            )
        )
        session.commit()

    headers, _ = login_web(client, email="ops@ops-overview.test", password=PASSWORD)
    response = client.get("/v1/web/overview", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["supportSummary"] == {
        "openCount": 2,
        "criticalCount": 1,
        "warningCount": 1,
    }
