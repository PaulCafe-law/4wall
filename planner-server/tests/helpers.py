from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import Organization, OrganizationMembership, Site, UserAccount
from app.security import hash_password


def valid_request_payload() -> dict:
    return {
        "missionName": "building-a-demo",
        "launchPoint": {
            "launchPointId": "launch-01",
            "location": {"lat": 25.03391, "lng": 121.56452},
            "label": "tower-a-launch",
        },
        "orderedWaypoints": [
            {
                "waypointId": "wp-01",
                "location": {"lat": 25.03412, "lng": 121.56472},
                "sequence": 1,
                "holdSeconds": 0,
            },
            {
                "waypointId": "wp-02",
                "location": {"lat": 25.03441, "lng": 121.56501},
                "sequence": 2,
                "holdSeconds": 0,
            },
        ],
        "routingMode": "road_network_following",
        "flightProfile": {
            "defaultAltitudeM": 35.0,
            "defaultSpeedMps": 4.0,
            "maxApproachSpeedMps": 1.0,
        },
        "operatingProfile": "outdoor_gps_patrol",
        "implicitReturnToLaunch": True,
        "demoMode": False,
    }


def seed_organization(session: Session, *, name: str, slug: str | None = None) -> Organization:
    organization = Organization(name=name, slug=slug or f"{name.lower().replace(' ', '-')}-{uuid4().hex[:6]}")
    session.add(organization)
    session.flush()
    return organization


def seed_user(
    session: Session,
    *,
    email: str,
    password: str,
    display_name: str | None = None,
    global_roles: list[str] | None = None,
    org_roles: list[tuple[str, str]] | None = None,
) -> UserAccount:
    user = UserAccount(
        email=email.lower(),
        display_name=display_name or email.split("@")[0],
        password_hash=hash_password(password),
    )
    session.add(user)
    session.flush()
    for role in global_roles or []:
        session.add(OrganizationMembership(user_id=user.id, organization_id=None, role=role))
    for organization_id, role in org_roles or []:
        session.add(OrganizationMembership(user_id=user.id, organization_id=organization_id, role=role))
    session.flush()
    return user


def seed_site(
    session: Session,
    *,
    organization_id: str,
    name: str,
    created_by_user_id: str | None = None,
) -> Site:
    site = Site(
        organization_id=organization_id,
        name=name,
        address=f"{name} address",
        lat=25.03391,
        lng=121.56452,
        created_by_user_id=created_by_user_id,
        updated_by_user_id=created_by_user_id,
    )
    session.add(site)
    session.flush()
    return site


def login_web(client: TestClient, *, email: str, password: str) -> tuple[dict[str, str], dict]:
    client.cookies.clear()
    response = client.post("/v1/web/session/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    body = response.json()
    return {"Authorization": f"Bearer {body['accessToken']}"}, body
