from tests.helpers import login_web, seed_organization, seed_user


PASSWORD = "Password123!"


def test_customer_viewer_cannot_create_or_update_site(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Site Org")
        organization_id = organization.id
        seed_user(
            session,
            email="admin@site.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        seed_user(
            session,
            email="viewer@site.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_viewer")],
        )
        session.commit()

    admin_headers, _ = login_web(client, email="admin@site.test", password=PASSWORD)
    create_response = client.post(
        "/v1/sites",
        headers=admin_headers,
        json={
            "organizationId": organization_id,
            "name": "HQ",
            "address": "Taipei",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "notes": "initial",
        },
    )
    assert create_response.status_code == 200
    site_id = create_response.json()["siteId"]

    viewer_headers, _ = login_web(client, email="viewer@site.test", password=PASSWORD)
    blocked_create = client.post(
        "/v1/sites",
        headers=viewer_headers,
        json={
            "organizationId": organization_id,
            "name": "Blocked",
            "address": "Taipei",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "notes": "",
        },
    )
    blocked_patch = client.patch(
        f"/v1/sites/{site_id}",
        headers=viewer_headers,
        json={"notes": "viewer cannot edit"},
    )

    assert blocked_create.status_code == 403
    assert blocked_patch.status_code == 403
