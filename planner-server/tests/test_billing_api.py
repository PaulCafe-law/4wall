from datetime import datetime, timedelta, timezone

from tests.helpers import login_web, seed_organization, seed_user


PASSWORD = "Password123!"


def test_invoice_visibility_is_org_scoped_and_customer_admin_cannot_modify(client, session_factory) -> None:
    with session_factory() as session:
        org_a = seed_organization(session, name="Billing Org A")
        org_b = seed_organization(session, name="Billing Org B")
        org_a_id = org_a.id
        org_b_id = org_b.id
        seed_user(
            session,
            email="platform@billing.test",
            password=PASSWORD,
            global_roles=["platform_admin"],
        )
        seed_user(
            session,
            email="admin@billing-a.test",
            password=PASSWORD,
            org_roles=[(org_a_id, "customer_admin")],
        )
        seed_user(
            session,
            email="admin@billing-b.test",
            password=PASSWORD,
            org_roles=[(org_b_id, "customer_admin")],
        )
        session.commit()

    platform_headers, _ = login_web(client, email="platform@billing.test", password=PASSWORD)
    create_response = client.post(
        "/v1/billing/invoices",
        headers=platform_headers,
        json={
            "organizationId": org_a_id,
            "invoiceNumber": "INV-001",
            "currency": "TWD",
            "subtotal": 1000,
            "tax": 50,
            "total": 1050,
            "dueDate": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
            "paymentInstructions": "bank transfer",
            "attachmentRefs": [],
            "notes": "manual invoice",
        },
    )
    assert create_response.status_code == 200
    invoice_id = create_response.json()["invoiceId"]

    org_a_headers, _ = login_web(client, email="admin@billing-a.test", password=PASSWORD)
    org_a_list = client.get("/v1/billing/invoices", headers=org_a_headers)
    assert org_a_list.status_code == 200
    assert [invoice["invoiceId"] for invoice in org_a_list.json()] == [invoice_id]

    blocked_update = client.patch(
        f"/v1/billing/invoices/{invoice_id}",
        headers=org_a_headers,
        json={"status": "paid"},
    )
    assert blocked_update.status_code == 403

    org_b_headers, _ = login_web(client, email="admin@billing-b.test", password=PASSWORD)
    org_b_list = client.get("/v1/billing/invoices", headers=org_b_headers)

    assert org_b_list.status_code == 200
    assert org_b_list.json() == []
