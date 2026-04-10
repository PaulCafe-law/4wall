def test_login_returns_access_and_refresh_tokens(client) -> None:
    response = client.post(
        "/v1/auth/login",
        json={"username": "pilot", "password": "pilot-dev-only"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tokenType"] == "bearer"
    assert body["accessToken"]
    assert body["refreshToken"]


def test_refresh_rotates_refresh_token(client) -> None:
    login_response = client.post(
        "/v1/auth/login",
        json={"username": "pilot", "password": "pilot-dev-only"},
    )
    refresh_token = login_response.json()["refreshToken"]

    refresh_response = client.post("/v1/auth/refresh", json={"refreshToken": refresh_token})

    assert refresh_response.status_code == 200
    assert refresh_response.json()["refreshToken"] != refresh_token
