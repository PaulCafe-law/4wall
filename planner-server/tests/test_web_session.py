from dataclasses import replace

from fastapi import Response
from fastapi.testclient import TestClient

from app.main import build_app

from app.routers.web import _clear_refresh_cookie, _set_refresh_cookie
from app.security import WEB_REFRESH_COOKIE_NAME
from tests.helpers import login_web, seed_organization, seed_user


PASSWORD = "Password123!"


def test_refresh_cookie_is_cross_site_none_in_prod() -> None:
    # web 與 API 為不同 onrender.com 子網域(跨站),cookie 必須 SameSite=None+Secure
    # 才會在跨站 fetch 時送出。少了這個,靜默續期永遠失敗、使用者每 15 分鐘被登出。
    response = Response()
    _set_refresh_cookie(response, "token-value", secure=True)
    header = response.headers["set-cookie"].lower()
    assert "samesite=none" in header
    assert "secure" in header
    assert "httponly" in header


def test_refresh_cookie_falls_back_to_lax_in_dev() -> None:
    # 本機開發走 http,瀏覽器會拒收 SameSite=None(需 Secure),故退回 lax 且不帶 Secure。
    response = Response()
    _set_refresh_cookie(response, "token-value", secure=False)
    header = response.headers["set-cookie"].lower()
    assert "samesite=lax" in header
    assert "secure" not in header


def test_clear_refresh_cookie_matches_cross_site_attributes() -> None:
    # 刪除時屬性需與寫入一致,瀏覽器才會覆蓋掉 SameSite=None 的 cookie。
    response = Response()
    _clear_refresh_cookie(response, secure=True)
    header = response.headers["set-cookie"].lower()
    assert "samesite=none" in header
    assert "secure" in header


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

    allowed_login = client.post(
        "/v1/web/session/login",
        headers={"Origin": "https://app.beta.example"},
        json={"email": "origin@org.test", "password": PASSWORD},
    )
    assert allowed_login.status_code == 200

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


def test_web_session_preflight_allows_configured_origin(test_settings) -> None:
    app = build_app(settings=replace(test_settings, app_origin="https://four-wall-web-staging.onrender.com"))

    with TestClient(app) as client:
        response = client.options(
            "/v1/web/session/login",
            headers={
                "Origin": "https://four-wall-web-staging.onrender.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://four-wall-web-staging.onrender.com"
    assert response.headers["access-control-allow-credentials"] == "true"
