from __future__ import annotations

from dataclasses import replace

from fastapi.testclient import TestClient

from app.main import build_app
from tests.helpers import login_web, seed_organization, seed_user


PASSWORD = "Password123!"


def test_site_map_asset_manifest_requires_web_auth(test_settings) -> None:
    app = build_app(
        settings=replace(
            test_settings,
            site_map_rent_house_sog_key="site-map-assets/rent-house/v1/rent-house.v1.sog",
        ),
        artifact_storage=FakeManifestStorage(),
    )

    with TestClient(app) as client:
        response = client.get("/v1/site-map-assets/rent-house/manifest")

    assert response.status_code == 401
    assert response.json()["detail"] == "missing_bearer_token"


def test_site_map_asset_manifest_blocks_customer_admin(test_settings) -> None:
    app = build_app(
        settings=replace(
            test_settings,
            site_map_rent_house_sog_key="site-map-assets/rent-house/v1/rent-house.v1.sog",
        ),
        artifact_storage=FakeManifestStorage(),
    )

    with TestClient(app) as client:
        with app.state.session_factory() as session:
            organization = seed_organization(session, name="Rent House Customer")
            seed_user(
                session,
                email="customer@rent-house.test",
                password=PASSWORD,
                org_roles=[(organization.id, "customer_admin")],
            )
            session.commit()

        headers, _ = login_web(client, email="customer@rent-house.test", password=PASSWORD)
        response = client.get("/v1/site-map-assets/rent-house/manifest", headers=headers)

    assert response.status_code == 403
    assert response.json()["detail"] == "forbidden_role"


def test_site_map_asset_manifest_returns_internal_presigned_url(test_settings) -> None:
    storage = FakeManifestStorage(url="https://r2.example.test/rent-house.sog?X-Amz-Signature=abc")
    app = build_app(
        settings=replace(
            test_settings,
            site_map_rent_house_sog_key="site-map-assets/rent-house/v1/rent-house.v1.sog",
            site_map_asset_url_ttl_seconds=120,
        ),
        artifact_storage=storage,
    )

    with TestClient(app) as client:
        with app.state.session_factory() as session:
            seed_user(
                session,
                email="ops@rent-house.test",
                password=PASSWORD,
                global_roles=["ops"],
            )
            session.commit()

        headers, _ = login_web(client, email="ops@rent-house.test", password=PASSWORD)
        response = client.get("/v1/site-map-assets/rent-house/manifest", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["assetKey"] == "rent-house"
    assert body["label"] == "租屋處"
    assert body["assetType"] == "sog"
    assert body["assetUrl"] == "https://r2.example.test/rent-house.sog?X-Amz-Signature=abc"
    assert "secret" not in body["assetUrl"].lower()
    assert body["expiresAt"]
    assert storage.presigned_get_calls == [
        {
            "key": "site-map-assets/rent-house/v1/rent-house.v1.sog",
            "expires_in_seconds": 120,
        }
    ]


def test_site_map_asset_manifest_returns_404_when_unconfigured(test_settings) -> None:
    app = build_app(settings=replace(test_settings, site_map_rent_house_sog_key=None), artifact_storage=FakeManifestStorage())

    with TestClient(app) as client:
        with app.state.session_factory() as session:
            seed_user(
                session,
                email="ops-unconfigured@rent-house.test",
                password=PASSWORD,
                global_roles=["ops"],
            )
            session.commit()

        headers, _ = login_web(client, email="ops-unconfigured@rent-house.test", password=PASSWORD)
        response = client.get("/v1/site-map-assets/rent-house/manifest", headers=headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "site_map_asset_not_configured"


class FakeManifestStorage:
    def __init__(self, *, url: str | None = "https://r2.example.test/rent-house.sog?signature=test") -> None:
        self.url = url
        self.presigned_get_calls: list[dict] = []

    def write(self, *, key: str, data: bytes, content_type: str, cache_control: str):
        raise NotImplementedError

    def read(self, key: str) -> bytes | None:
        return None

    def delete(self, key: str) -> None:
        return None

    def create_presigned_put_url(
        self,
        *,
        key: str,
        content_type: str,
        cache_control: str,
        expires_in_seconds: int,
    ) -> str | None:
        return None

    def create_presigned_get_url(self, *, key: str, expires_in_seconds: int) -> str | None:
        self.presigned_get_calls.append({"key": key, "expires_in_seconds": expires_in_seconds})
        return self.url
