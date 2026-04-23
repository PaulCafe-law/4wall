from tests.helpers import login_web, seed_organization, seed_user


PASSWORD = "Password123!"


def test_platform_admin_can_create_operator_for_android_login(client, session_factory) -> None:
    with session_factory() as session:
        seed_user(
            session,
            email="platform@example.test",
            password=PASSWORD,
            global_roles=["platform_admin"],
        )
        session.commit()

    headers, _ = login_web(client, email="platform@example.test", password=PASSWORD)

    response = client.post(
        "/v1/internal/operators",
        headers=headers,
        json={
            "username": "fieldpilot",
            "displayName": "Field Pilot",
            "password": "ChangeMe123!",
            "isActive": True,
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["username"] == "fieldpilot"
    assert body["displayName"] == "Field Pilot"
    assert body["isActive"] is True

    login_response = client.post(
        "/v1/auth/login",
        json={"username": "fieldpilot", "password": "ChangeMe123!"},
    )

    assert login_response.status_code == 200, login_response.text
    assert login_response.json()["operator"]["username"] == "fieldpilot"


def test_customer_admin_cannot_create_operator(client, session_factory) -> None:
    with session_factory() as session:
        organization = seed_organization(session, name="Customer Org")
        seed_user(
            session,
            email="customer@example.test",
            password=PASSWORD,
            org_roles=[(organization.id, "customer_admin")],
        )
        session.commit()

    headers, _ = login_web(client, email="customer@example.test", password=PASSWORD)

    response = client.post(
        "/v1/internal/operators",
        headers=headers,
        json={
            "username": "fieldpilot",
            "displayName": "Field Pilot",
            "password": "ChangeMe123!",
            "isActive": True,
        },
    )

    assert response.status_code == 403


def test_operator_password_only_changes_with_update_flag(client, session_factory) -> None:
    with session_factory() as session:
        seed_user(
            session,
            email="platform@example.test",
            password=PASSWORD,
            global_roles=["platform_admin"],
        )
        session.commit()

    headers, _ = login_web(client, email="platform@example.test", password=PASSWORD)
    create_response = client.post(
        "/v1/internal/operators",
        headers=headers,
        json={
            "username": "fieldpilot",
            "displayName": "Field Pilot",
            "password": "ChangeMe123!",
            "isActive": True,
        },
    )
    assert create_response.status_code == 200, create_response.text

    update_response = client.post(
        "/v1/internal/operators",
        headers=headers,
        json={
            "username": "fieldpilot",
            "displayName": "Field Pilot Updated",
            "password": "DifferentPassword456!",
            "updatePassword": False,
            "isActive": True,
        },
    )
    assert update_response.status_code == 200, update_response.text

    old_login = client.post(
        "/v1/auth/login",
        json={"username": "fieldpilot", "password": "ChangeMe123!"},
    )
    new_login_before_rotation = client.post(
        "/v1/auth/login",
        json={"username": "fieldpilot", "password": "DifferentPassword456!"},
    )
    assert old_login.status_code == 200, old_login.text
    assert new_login_before_rotation.status_code == 401

    rotate_response = client.post(
        "/v1/internal/operators",
        headers=headers,
        json={
            "username": "fieldpilot",
            "displayName": "Field Pilot Updated",
            "password": "DifferentPassword456!",
            "updatePassword": True,
            "isActive": True,
        },
    )
    assert rotate_response.status_code == 200, rotate_response.text

    new_login_after_rotation = client.post(
        "/v1/auth/login",
        json={"username": "fieldpilot", "password": "DifferentPassword456!"},
    )
    assert new_login_after_rotation.status_code == 200, new_login_after_rotation.text
