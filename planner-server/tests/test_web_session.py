from app.security import WEB_REFRESH_COOKIE_NAME
from tests.helpers import login_web, seed_organization, seed_user


PASSWORD = "Password123!"


def test_web_login_sets_refresh_cookie_and_returns_memberships(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Acme Air")
        organization_id = organization.id
        seed_user(
            session,
            email="admin@acme.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        session.commit()

    headers, body = login_web(client, email="admin@acme.test", password=PASSWORD)

    assert client.cookies.get(WEB_REFRESH_COOKIE_NAME)
    assert body["user"]["globalRoles"] == []
    assert body["user"]["memberships"][0]["organizationId"] == organization_id
    assert body["user"]["memberships"][0]["role"] == "customer_admin"

    me_response = client.get("/v1/web/session/me", headers=headers)

    assert me_response.status_code == 200
    assert me_response.json()["email"] == "admin@acme.test"


def test_web_refresh_rotates_cookie_and_revokes_previous_token(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Refresh Org")
        organization_id = organization.id
        seed_user(
            session,
            email="refresh@org.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        session.commit()

    login_response = client.post("/v1/web/session/login", json={"email": "refresh@org.test", "password": PASSWORD})
    assert login_response.status_code == 200
    first_refresh_token = client.cookies.get(WEB_REFRESH_COOKIE_NAME)
    assert first_refresh_token

    refresh_response = client.post("/v1/web/session/refresh")

    assert refresh_response.status_code == 200
    rotated_refresh_token = client.cookies.get(WEB_REFRESH_COOKIE_NAME)
    assert rotated_refresh_token
    assert rotated_refresh_token != first_refresh_token

    client.cookies.clear()
    client.cookies.set(WEB_REFRESH_COOKIE_NAME, first_refresh_token)
    stale_refresh_response = client.post("/v1/web/session/refresh")

    assert stale_refresh_response.status_code == 401
    assert stale_refresh_response.json()["detail"] == "web_refresh_token_revoked"


def test_web_login_rate_limit_blocks_repeated_failed_attempts(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Rate Limit Org")
        organization_id = organization.id
        seed_user(
            session,
            email="rate-limit@org.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        session.commit()

    for _ in range(5):
        response = client.post(
            "/v1/web/session/login",
            json={"email": "rate-limit@org.test", "password": "wrong-password"},
        )
        assert response.status_code == 401

    blocked_response = client.post(
        "/v1/web/session/login",
        json={"email": "rate-limit@org.test", "password": "wrong-password"},
    )

    assert blocked_response.status_code == 429
    assert blocked_response.json()["detail"] == "rate_limit_exceeded"
