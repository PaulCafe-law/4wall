from datetime import datetime, timedelta, timezone

from sqlmodel import select

from app.models import Invite, OrganizationMembership, UserAccount
from app.security import hash_invite_token
from tests.helpers import login_web, seed_organization, seed_user


PASSWORD = "Password123!"


def test_platform_admin_can_issue_and_accept_customer_invite(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Invite Org")
        organization_id = organization.id
        seed_user(
            session,
            email="platform@internal.test",
            password=PASSWORD,
            global_roles=["platform_admin"],
        )
        session.commit()

    admin_headers, _ = login_web(client, email="platform@internal.test", password=PASSWORD)
    invite_response = client.post(
        f"/v1/organizations/{organization_id}/invites",
        headers=admin_headers,
        json={"email": "viewer@invite.test", "role": "customer_viewer"},
    )

    assert invite_response.status_code == 200
    invite_payload = invite_response.json()

    accept_response = client.post(
        "/v1/invites/accept",
        json={
            "inviteToken": invite_payload["inviteToken"],
            "password": PASSWORD,
            "displayName": "Viewer User",
        },
    )

    assert accept_response.status_code == 200
    accepted_membership = accept_response.json()["user"]["memberships"][0]
    assert accepted_membership["organizationId"] == organization_id
    assert accepted_membership["role"] == "customer_viewer"

    with session_factory() as session:
        invite = session.get(Invite, invite_payload["invite"]["inviteId"])
        user = session.exec(select(UserAccount).where(UserAccount.email == "viewer@invite.test")).first()
        membership = session.exec(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.organization_id == organization_id,
            )
        ).first()
        assert invite is not None and invite.accepted_at is not None
        assert membership is not None and membership.role == "customer_viewer"


def test_revoked_and_expired_invites_cannot_be_accepted(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Blocked Invites")
        organization_id = organization.id
        revoked_token = "revoked-token"
        expired_token = "expired-token"
        session.add(
            Invite(
                organization_id=organization_id,
                email="revoked@invite.test",
                role="customer_viewer",
                token_hash=hash_invite_token(revoked_token),
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
                revoked_at=datetime.now(timezone.utc),
            )
        )
        session.add(
            Invite(
                organization_id=organization_id,
                email="expired@invite.test",
                role="customer_viewer",
                token_hash=hash_invite_token(expired_token),
                expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            )
        )
        session.commit()

    revoked_response = client.post(
        "/v1/invites/accept",
        json={"inviteToken": "revoked-token", "password": PASSWORD, "displayName": "Nope"},
    )
    expired_response = client.post(
        "/v1/invites/accept",
        json={"inviteToken": "expired-token", "password": PASSWORD, "displayName": "Nope"},
    )

    assert revoked_response.status_code == 409
    assert revoked_response.json()["detail"] == "invite_revoked"
    assert expired_response.status_code == 409
    assert expired_response.json()["detail"] == "invite_expired"


def test_accept_invite_reactivates_existing_membership(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Reactivation Org")
        organization_id = organization.id
        user = seed_user(
            session,
            email="reactivate@invite.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_viewer")],
        )
        membership = session.exec(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.organization_id == organization_id,
            )
        ).first()
        assert membership is not None
        membership.is_active = False
        session.add(membership)
        session.add(
            Invite(
                organization_id=organization_id,
                email="reactivate@invite.test",
                role="customer_admin",
                token_hash=hash_invite_token("reactivate-token"),
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            )
        )
        session.commit()

    accept_response = client.post(
        "/v1/invites/accept",
        json={
            "inviteToken": "reactivate-token",
            "password": PASSWORD,
            "displayName": "Reactivated User",
        },
    )

    assert accept_response.status_code == 200
    accepted_membership = accept_response.json()["user"]["memberships"][0]
    assert accepted_membership["organizationId"] == organization_id
    assert accepted_membership["role"] == "customer_admin"
    assert accepted_membership["isActive"] is True


def test_accept_invite_rate_limit_blocks_repeated_invalid_attempts(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Invite Rate Limit Org")
        session.add(
            Invite(
                organization_id=organization.id,
                email="viewer@invite-limit.test",
                role="customer_viewer",
                token_hash=hash_invite_token("valid-invite-token"),
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            )
        )
        session.commit()

    for _ in range(5):
        response = client.post(
            "/v1/invites/accept",
            json={"inviteToken": "missing-token", "password": PASSWORD, "displayName": "Nope"},
        )
        assert response.status_code == 404

    blocked_response = client.post(
        "/v1/invites/accept",
        json={"inviteToken": "missing-token", "password": PASSWORD, "displayName": "Nope"},
    )

    assert blocked_response.status_code == 429
    assert blocked_response.json()["detail"] == "rate_limit_exceeded"


def test_customer_admin_can_revoke_pending_invite_for_own_org(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Customer Invite Org")
        organization_id = organization.id
        seed_user(
            session,
            email="admin@customer-invite.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        session.commit()

    admin_headers, _ = login_web(client, email="admin@customer-invite.test", password=PASSWORD)
    invite_response = client.post(
        f"/v1/organizations/{organization_id}/invites",
        headers=admin_headers,
        json={"email": "viewer@customer-invite.test", "role": "customer_viewer"},
    )

    assert invite_response.status_code == 200
    invite_id = invite_response.json()["invite"]["inviteId"]

    revoke_response = client.post(f"/v1/invites/{invite_id}/revoke", headers=admin_headers)

    assert revoke_response.status_code == 200
    assert revoke_response.json()["revokedAt"] is not None

    detail_response = client.get(f"/v1/organizations/{organization_id}", headers=admin_headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["pendingInvites"] == []


def test_customer_viewer_cannot_revoke_pending_invite(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Viewer Invite Org")
        organization_id = organization.id
        seed_user(
            session,
            email="admin@viewer-invite.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        seed_user(
            session,
            email="viewer@viewer-invite.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_viewer")],
        )
        session.commit()

    admin_headers, _ = login_web(client, email="admin@viewer-invite.test", password=PASSWORD)
    invite_response = client.post(
        f"/v1/organizations/{organization_id}/invites",
        headers=admin_headers,
        json={"email": "pending@viewer-invite.test", "role": "customer_viewer"},
    )

    assert invite_response.status_code == 200
    invite_id = invite_response.json()["invite"]["inviteId"]

    viewer_headers, _ = login_web(client, email="viewer@viewer-invite.test", password=PASSWORD)
    revoke_response = client.post(f"/v1/invites/{invite_id}/revoke", headers=viewer_headers)

    assert revoke_response.status_code == 403
    assert revoke_response.json()["detail"] == "forbidden_role"


def test_customer_admin_can_resend_pending_invite_for_own_org(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Customer Invite Resend Org")
        organization_id = organization.id
        seed_user(
            session,
            email="admin@customer-resend.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        session.commit()

    admin_headers, _ = login_web(client, email="admin@customer-resend.test", password=PASSWORD)
    invite_response = client.post(
        f"/v1/organizations/{organization_id}/invites",
        headers=admin_headers,
        json={"email": "viewer@customer-resend.test", "role": "customer_viewer"},
    )

    assert invite_response.status_code == 200
    first_invite_id = invite_response.json()["invite"]["inviteId"]

    resend_response = client.post(f"/v1/invites/{first_invite_id}/resend", headers=admin_headers)

    assert resend_response.status_code == 200
    resent_payload = resend_response.json()
    assert resent_payload["invite"]["inviteId"] != first_invite_id
    assert resent_payload["invite"]["email"] == "viewer@customer-resend.test"
    assert resent_payload["inviteToken"]

    detail_response = client.get(f"/v1/organizations/{organization_id}", headers=admin_headers)
    assert detail_response.status_code == 200
    pending_invites = detail_response.json()["pendingInvites"]
    assert len(pending_invites) == 1
    assert pending_invites[0]["inviteId"] == resent_payload["invite"]["inviteId"]


def test_customer_viewer_cannot_resend_pending_invite(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Viewer Invite Resend Org")
        organization_id = organization.id
        seed_user(
            session,
            email="admin@viewer-resend.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_admin")],
        )
        seed_user(
            session,
            email="viewer@viewer-resend.test",
            password=PASSWORD,
            org_roles=[(organization_id, "customer_viewer")],
        )
        session.commit()

    admin_headers, _ = login_web(client, email="admin@viewer-resend.test", password=PASSWORD)
    invite_response = client.post(
        f"/v1/organizations/{organization_id}/invites",
        headers=admin_headers,
        json={"email": "pending@viewer-resend.test", "role": "customer_viewer"},
    )

    assert invite_response.status_code == 200
    invite_id = invite_response.json()["invite"]["inviteId"]

    viewer_headers, _ = login_web(client, email="viewer@viewer-resend.test", password=PASSWORD)
    resend_response = client.post(f"/v1/invites/{invite_id}/resend", headers=viewer_headers)

    assert resend_response.status_code == 403
    assert resend_response.json()["detail"] == "forbidden_role"
