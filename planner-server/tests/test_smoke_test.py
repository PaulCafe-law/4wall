from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import SimpleNamespace

import httpx


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "smoke_test.py"


def load_smoke_module():
    spec = spec_from_file_location("planner_smoke_test", SCRIPT_PATH)
    module = module_from_spec(spec)
    assert spec is not None
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class FakeResponse:
    def __init__(
        self,
        *,
        status_code: int = 200,
        json_body=None,
        content: bytes = b"",
        headers: dict[str, str] | None = None,
        cookies: dict[str, str] | None = None,
    ) -> None:
        self.status_code = status_code
        self._json_body = json_body
        self.content = content
        self.headers = headers or {}
        self.cookies = cookies or {}

    def json(self):
        return self._json_body

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("GET", "https://example.invalid")
            response = httpx.Response(self.status_code, request=request, json=self._json_body)
            raise httpx.HTTPStatusError("request failed", request=request, response=response)


class FakeClient:
    def __init__(self, routes: dict[tuple[str, str], list[FakeResponse]]) -> None:
        self.routes = routes
        self.cookies: dict[str, str] = {}

    def get(self, url: str, **kwargs) -> FakeResponse:
        return self._dispatch("GET", url)

    def post(self, url: str, **kwargs) -> FakeResponse:
        return self._dispatch("POST", url)

    def patch(self, url: str, **kwargs) -> FakeResponse:
        return self._dispatch("PATCH", url)

    def _dispatch(self, method: str, url: str) -> FakeResponse:
        key = (method, url)
        if key not in self.routes or not self.routes[key]:
            raise AssertionError(f"unexpected request: {method} {url}")
        response = self.routes[key].pop(0)
        self.cookies.update(response.cookies)
        return response


def test_canonical_mode_maps_web_beta_to_web_admin() -> None:
    smoke = load_smoke_module()

    assert smoke._canonical_mode("web-beta") == "web-admin"
    assert smoke._canonical_mode("web-admin") == "web-admin"
    assert smoke._canonical_mode("web-viewer") == "web-viewer"


def test_run_web_admin_smoke_supports_top_level_artifact_list() -> None:
    smoke = load_smoke_module()
    kmz_bytes = b"kmz-payload"
    meta_bytes = b'{"missionId":"msn-001"}'
    base_url = "https://planner.example"
    client = FakeClient(
        {
            ("POST", f"{base_url}/v1/web/session/login"): [
                FakeResponse(
                    json_body={"accessToken": "login-token"},
                    cookies={"fw_refresh": "refresh-1"},
                )
            ],
            ("GET", f"{base_url}/v1/web/session/me"): [
                FakeResponse(
                    json_body={
                        "email": "admin@example.com",
                        "globalRoles": [],
                        "memberships": [
                            {
                                "membershipId": "membership-1",
                                "organizationId": "org-1",
                                "role": "customer_admin",
                                "isActive": True,
                            }
                        ],
                    }
                )
            ],
            ("POST", f"{base_url}/v1/web/session/refresh"): [
                FakeResponse(
                    json_body={"accessToken": "refresh-token"},
                    cookies={"fw_refresh": "refresh-2"},
                )
            ],
            ("GET", f"{base_url}/v1/missions"): [FakeResponse(json_body=[{"missionId": "msn-001"}])],
            ("GET", f"{base_url}/v1/missions/msn-001"): [
                FakeResponse(
                    json_body={
                        "artifacts": [
                            {
                                "artifactName": "mission.kmz",
                                "downloadUrl": "/v1/missions/msn-001/artifacts/mission.kmz",
                                "checksumSha256": smoke.sha256_hex(kmz_bytes),
                            },
                            {
                                "artifactName": "mission_meta.json",
                                "downloadUrl": "/v1/missions/msn-001/artifacts/mission_meta.json",
                                "checksumSha256": smoke.sha256_hex(meta_bytes),
                            },
                        ]
                    }
                )
            ],
            ("GET", f"{base_url}/v1/missions/msn-001/artifacts/mission.kmz"): [
                FakeResponse(
                    content=kmz_bytes,
                    headers={"X-Artifact-Checksum": smoke.sha256_hex(kmz_bytes)},
                )
            ],
            ("GET", f"{base_url}/v1/missions/msn-001/artifacts/mission_meta.json"): [
                FakeResponse(
                    content=meta_bytes,
                    headers={"X-Artifact-Checksum": smoke.sha256_hex(meta_bytes)},
                )
            ],
        }
    )

    result = smoke.run_web_admin_smoke(
        client=client,
        base_url=base_url,
        args=SimpleNamespace(
            web_email="admin@example.com",
            web_password="Password123!",
            app_origin="https://app.example.com",
        ),
    )

    assert result == {
        "status": "ok",
        "mode": "web-admin",
        "user": "admin@example.com",
        "missionId": "msn-001",
        "downloadsVerified": ["mission.kmz", "mission_meta.json"],
    }


def test_run_web_viewer_smoke_verifies_read_only_role() -> None:
    smoke = load_smoke_module()
    base_url = "https://planner.example"
    client = FakeClient(
        {
            ("POST", f"{base_url}/v1/web/session/login"): [
                FakeResponse(
                    json_body={"accessToken": "login-token"},
                    cookies={"fw_refresh": "refresh-1"},
                )
            ],
            ("GET", f"{base_url}/v1/web/session/me"): [
                FakeResponse(
                    json_body={
                        "email": "viewer@example.com",
                        "globalRoles": [],
                        "memberships": [
                            {
                                "membershipId": "membership-1",
                                "organizationId": "org-1",
                                "role": "customer_viewer",
                                "isActive": True,
                            }
                        ],
                    }
                )
            ],
            ("POST", f"{base_url}/v1/web/session/refresh"): [
                FakeResponse(
                    json_body={"accessToken": "refresh-token"},
                    cookies={"fw_refresh": "refresh-2"},
                )
            ],
            ("GET", f"{base_url}/v1/sites"): [FakeResponse(json_body=[{"siteId": "site-1"}])],
            ("GET", f"{base_url}/v1/missions"): [FakeResponse(json_body=[{"missionId": "msn-001"}])],
            ("GET", f"{base_url}/v1/billing/invoices"): [FakeResponse(json_body=[{"invoiceId": "inv-1"}])],
            ("GET", f"{base_url}/v1/organizations/org-1"): [
                FakeResponse(json_body={"organizationId": "org-1", "name": "Viewer Org"})
            ],
            ("PATCH", f"{base_url}/v1/organizations/org-1"): [
                FakeResponse(status_code=403, json_body={"detail": "forbidden_role"})
            ],
        }
    )

    result = smoke.run_web_viewer_smoke(
        client=client,
        base_url=base_url,
        args=SimpleNamespace(
            web_email="viewer@example.com",
            web_password="Password123!",
            app_origin="https://app.example.com",
        ),
    )

    assert result == {
        "status": "ok",
        "mode": "web-viewer",
        "user": "viewer@example.com",
        "organizationId": "org-1",
        "visibleSiteCount": 1,
        "visibleMissionCount": 1,
        "visibleInvoiceCount": 1,
        "readOnlyMutationCheck": "forbidden_role",
    }
