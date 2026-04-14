from dataclasses import replace

from fastapi.testclient import TestClient
from sqlmodel import select

from app.main import build_app
from app.models import Organization, OrganizationMembership, UserAccount
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


def test_web_session_endpoints_reject_wrong_origin(client, app, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Origin Org")
        organization_id = organization.id
        seed_user(
            session,
            email="origin@org.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        session.commit()

    app.state.settings = replace(app.state.settings, app_origin="https://app.beta.example")

    blocked_login = client.post(
        "/v1/web/session/login",
        headers={"Origin": "https://evil.example"},
        json={"email": "origin@org.test", "password": PASSWORD},
    )
    assert blocked_login.status_code == 403
    assert blocked_login.json()["detail"] == "origin_not_allowed"

    blocked_signup = client.post(
        "/v1/web/session/signup",
        headers={"Origin": "https://evil.example"},
        json={
            "email": "signup-origin@org.test",
            "password": PASSWORD,
            "displayName": "Signup Origin",
            "organizationName": "Signup Origin Org",
            "organizationSlug": "signup-origin-org",
        },
    )
    assert blocked_signup.status_code == 403
    assert blocked_signup.json()["detail"] == "origin_not_allowed"

    allowed_login = client.post(
        "/v1/web/session/login",
        headers={"Origin": "https://app.beta.example"},
        json={"email": "origin@org.test", "password": PASSWORD},
    )
    assert allowed_login.status_code == 200

    allowed_signup = client.post(
        "/v1/web/session/signup",
        headers={"Origin": "https://app.beta.example"},
        json={
            "email": "signup-allowed@org.test",
            "password": PASSWORD,
            "displayName": "Signup Allowed",
            "organizationName": "Signup Allowed Org",
            "organizationSlug": "signup-allowed-org",
        },
    )
    assert allowed_signup.status_code == 200

    blocked_refresh = client.post(
        "/v1/web/session/refresh",
        headers={"Origin": "https://evil.example"},
    )
    assert blocked_refresh.status_code == 403
    assert blocked_refresh.json()["detail"] == "origin_not_allowed"

    blocked_logout = client.post(
        "/v1/web/session/logout",
        headers={"Origin": "https://evil.example"},
    )
    assert blocked_logout.status_code == 403
    assert blocked_logout.json()["detail"] == "origin_not_allowed"


def test_web_signup_creates_user_org_membership_and_session(client, session_factory) -> None:
    response = client.post(
        "/v1/web/session/signup",
        json={
            "email": "founder@builder.test",
            "password": PASSWORD,
            "displayName": "Builder Founder",
            "organizationName": "Builder Co",
            "organizationSlug": "builder-co",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert client.cookies.get(WEB_REFRESH_COOKIE_NAME)
    assert body["user"]["email"] == "founder@builder.test"
    assert body["user"]["memberships"][0]["role"] == "customer_admin"

    with session_factory() as session:
        user = session.exec(select(UserAccount).where(UserAccount.email == "founder@builder.test")).first()
        assert user is not None
        organization = session.exec(select(Organization).where(Organization.slug == "builder-co")).first()
        assert organization is not None
        membership = session.exec(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.organization_id == organization.id,
            )
        ).first()
        assert membership is not None
        assert membership.role == "customer_admin"


def test_web_signup_rejects_duplicate_email_and_slug(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Existing Org", slug="existing-org")
        seed_user(
            session,
            email="existing@builder.test",
            password=PASSWORD,
            org_roles=[(organization.id, "customer_admin")],
        )
        session.commit()

    duplicate_email = client.post(
        "/v1/web/session/signup",
        json={
            "email": "existing@builder.test",
            "password": PASSWORD,
            "displayName": "Existing User",
            "organizationName": "Another Org",
            "organizationSlug": "another-org",
        },
    )
    duplicate_slug = client.post(
        "/v1/web/session/signup",
        json={
            "email": "new@builder.test",
            "password": PASSWORD,
            "displayName": "New User",
            "organizationName": "Existing Org Again",
            "organizationSlug": "existing-org",
        },
    )

    assert duplicate_email.status_code == 409
    assert duplicate_email.json()["detail"] == "user_email_exists"
    assert duplicate_slug.status_code == 409
    assert duplicate_slug.json()["detail"] == "organization_slug_exists"


def test_web_signup_rate_limit_blocks_repeated_duplicate_attempts(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Existing Org", slug="rate-limit-org")
        seed_user(
            session,
            email="existing-rate-limit@builder.test",
            password=PASSWORD,
            org_roles=[(organization.id, "customer_admin")],
        )
        session.commit()

    for _ in range(5):
        response = client.post(
            "/v1/web/session/signup",
            json={
                "email": "existing-rate-limit@builder.test",
                "password": PASSWORD,
                "displayName": "Existing User",
                "organizationName": "Rate Limit Org",
                "organizationSlug": "rate-limit-org",
            },
        )
        assert response.status_code == 409

    blocked_response = client.post(
        "/v1/web/session/signup",
        json={
            "email": "existing-rate-limit@builder.test",
            "password": PASSWORD,
            "displayName": "Existing User",
            "organizationName": "Rate Limit Org",
            "organizationSlug": "rate-limit-org",
        },
    )

    assert blocked_response.status_code == 429
    assert blocked_response.json()["detail"] == "rate_limit_exceeded"


def test_web_login_preflight_allows_local_browser_origin_in_test(test_settings) -> None:
    app = build_app(settings=test_settings)
    with TestClient(app) as client:
        response = client.options(
            "/v1/web/session/login",
            headers={
                "Origin": "http://127.0.0.1:4173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:4173"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_web_login_preflight_allows_only_configured_origin_in_production(test_settings) -> None:
    production_settings = replace(
        test_settings,
        environment="production",
        app_origin="https://four-wall-web.onrender.com",
        bootstrap_operator_enabled=False,
    )
    app = build_app(settings=production_settings)
    with TestClient(app) as client:
        allowed = client.options(
            "/v1/web/session/login",
            headers={
                "Origin": "https://four-wall-web.onrender.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        blocked = client.options(
            "/v1/web/session/login",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://four-wall-web.onrender.com"
    assert allowed.headers["access-control-allow-credentials"] == "true"
    assert blocked.status_code == 400
    assert blocked.headers.get("access-control-allow-origin") is None
