from tests.helpers import login_web, seed_organization, seed_user


PASSWORD = "Password123!"


def test_ops_cross_org_write_creates_support_audit_event(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Audit Org")
        organization_id = organization.id
        seed_user(
            session,
            email="ops@internal.test",
            password=PASSWORD,
            global_roles=["ops"],
        )
        session.commit()

    ops_headers, _ = login_web(client, email="ops@internal.test", password=PASSWORD)
    create_site_response = client.post(
        "/v1/sites",
        headers=ops_headers,
        json={
            "organizationId": organization_id,
            "name": "Ops Support Site",
            "address": "Taipei",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "notes": "support access",
        },
    )

    assert create_site_response.status_code == 200

    audit_response = client.get("/v1/audit-log", headers=ops_headers, params={"organizationId": organization_id})

    assert audit_response.status_code == 200
    events = audit_response.json()
    assert any(
        event["action"] == "site.create_access" and event["metadata"].get("supportAccess") is True
        for event in events
    )
    assert any(event["action"] == "site.created" for event in events)
