from __future__ import annotations

import argparse
import hashlib
import json
import sys
from typing import Any

import httpx


DEFAULT_REQUEST = {
    "missionName": "tower-a-prod-beta",
    "origin": {"lat": 25.03391, "lng": 121.56452},
    "targetBuilding": {"buildingId": "tower-a", "label": "Tower A"},
    "routingMode": "road_network_following",
    "corridorPolicy": {
        "defaultHalfWidthM": 8.0,
        "maxHalfWidthM": 12.0,
        "branchConfirmRadiusM": 18.0,
    },
    "flightProfile": {
        "defaultAltitudeM": 35.0,
        "defaultSpeedMps": 4.0,
        "maxApproachSpeedMps": 1.0,
    },
    "inspectionIntent": {
        "viewpoints": [
            {
                "viewpointId": "vp-01",
                "label": "north-east-facade",
                "lat": 25.03441,
                "lng": 121.56501,
                "yawDeg": 225.0,
                "distanceToFacadeM": 12.0,
            }
        ]
    },
    "demoMode": False,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Login to planner-server, plan a mission, and verify artifact downloads."
    )
    parser.add_argument("--base-url", required=True, help="Planner server base URL")
    parser.add_argument(
        "--mode",
        choices=("operator", "web-beta", "web-admin", "web-viewer"),
        default="operator",
        help="Smoke path to run. Default keeps the operator plan-and-download flow.",
    )
    parser.add_argument("--username", help="Operator username")
    parser.add_argument("--password", help="Operator password")
    parser.add_argument("--web-email", help="Seeded web-beta smoke user email")
    parser.add_argument("--web-password", help="Seeded web-beta smoke user password")
    parser.add_argument("--app-origin", help="App origin header for web session smoke")
    parser.add_argument(
        "--request-json",
        help="Optional path to a JSON file to override the default mission plan request.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=20.0,
        help="HTTP timeout in seconds",
    )
    return parser.parse_args()


def load_request_payload(path: str | None) -> dict:
    if path is None:
        return DEFAULT_REQUEST
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def sha256_hex(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def ensure(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def main() -> int:
    args = parse_args()
    payload = load_request_payload(args.request_json)
    base_url = args.base_url.rstrip("/")

    with httpx.Client(timeout=args.timeout_seconds) as client:
        mode = _canonical_mode(args.mode)
        if mode == "web-admin":
            result = run_web_admin_smoke(client=client, base_url=base_url, args=args)
        elif mode == "web-viewer":
            result = run_web_viewer_smoke(client=client, base_url=base_url, args=args)
        else:
            result = run_operator_smoke(client=client, base_url=base_url, payload=payload, args=args)
        print(json.dumps(result, indent=2))
    return 0


def run_operator_smoke(client: httpx.Client, base_url: str, payload: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    ensure(bool(args.username), "--username is required for operator smoke")
    ensure(bool(args.password), "--password is required for operator smoke")
    login_response = client.post(
        f"{base_url}/v1/auth/login",
        json={"username": args.username, "password": args.password},
    )
    login_response.raise_for_status()
    login_body = login_response.json()
    access_token = login_body["accessToken"]
    headers = {"Authorization": f"Bearer {access_token}"}

    me_response = client.get(f"{base_url}/v1/auth/me", headers=headers)
    me_response.raise_for_status()
    me_body = me_response.json()
    ensure(me_body["username"] == args.username, "authenticated username mismatch")

    plan_response = client.post(
        f"{base_url}/v1/missions/plan",
        headers=headers,
        json=payload,
    )
    plan_response.raise_for_status()
    plan_body = plan_response.json()
    _verify_artifact_downloads(client=client, base_url=base_url, headers=headers, artifacts=plan_body.get("artifacts", {}))
    return {
        "status": "ok",
        "mode": "operator",
        "missionId": plan_body["missionId"],
        "operator": me_body["username"],
        "downloadsVerified": ["mission.kmz", "mission_meta.json"],
    }


def run_web_admin_smoke(client: httpx.Client, base_url: str, args: argparse.Namespace) -> dict[str, Any]:
    me_body, authed_headers = _login_and_refresh_web_session(client=client, base_url=base_url, args=args)
    active_memberships = [
        membership
        for membership in me_body.get("memberships", [])
        if membership.get("organizationId") and membership.get("isActive", True)
    ]
    ensure(bool(active_memberships), "admin smoke user has no active organization memberships")
    ensure(
        any(membership.get("role") == "customer_admin" for membership in active_memberships),
        "admin smoke user must include an active customer_admin membership",
    )

    missions_response = client.get(f"{base_url}/v1/missions", headers=authed_headers)
    missions_response.raise_for_status()
    missions = missions_response.json()
    ensure(bool(missions), "no missions visible to admin smoke user")
    mission_id = missions[0]["missionId"]

    detail_response = client.get(f"{base_url}/v1/missions/{mission_id}", headers=authed_headers)
    detail_response.raise_for_status()
    detail_body = detail_response.json()
    _verify_artifact_downloads(
        client=client,
        base_url=base_url,
        headers=authed_headers,
        artifacts=detail_body.get("artifacts") or detail_body.get("response", {}).get("artifacts", {}),
    )
    return {
        "status": "ok",
        "mode": "web-admin",
        "user": me_body["email"],
        "missionId": mission_id,
        "downloadsVerified": ["mission.kmz", "mission_meta.json"],
    }


def run_web_viewer_smoke(client: httpx.Client, base_url: str, args: argparse.Namespace) -> dict[str, Any]:
    me_body, authed_headers = _login_and_refresh_web_session(client=client, base_url=base_url, args=args)
    active_memberships = [
        membership
        for membership in me_body.get("memberships", [])
        if membership.get("organizationId") and membership.get("isActive", True)
    ]
    ensure(bool(active_memberships), "viewer smoke user has no active organization memberships")
    ensure(not me_body.get("globalRoles"), "viewer smoke user must not have internal global roles")
    ensure(
        all(membership.get("role") == "customer_viewer" for membership in active_memberships),
        "viewer smoke user must only have customer_viewer memberships",
    )

    organization_id = active_memberships[0]["organizationId"]
    sites_response = client.get(f"{base_url}/v1/sites", headers=authed_headers)
    sites_response.raise_for_status()
    missions_response = client.get(f"{base_url}/v1/missions", headers=authed_headers)
    missions_response.raise_for_status()
    invoices_response = client.get(f"{base_url}/v1/billing/invoices", headers=authed_headers)
    invoices_response.raise_for_status()

    organization_response = client.get(f"{base_url}/v1/organizations/{organization_id}", headers=authed_headers)
    organization_response.raise_for_status()
    organization_body = organization_response.json()

    forbidden_update_response = client.patch(
        f"{base_url}/v1/organizations/{organization_id}",
        headers=authed_headers,
        json={"name": organization_body["name"]},
    )
    ensure(forbidden_update_response.status_code == 403, "viewer organization update did not fail closed")
    ensure(
        forbidden_update_response.json().get("detail") == "forbidden_role",
        "viewer organization update returned unexpected error detail",
    )

    return {
        "status": "ok",
        "mode": "web-viewer",
        "user": me_body["email"],
        "organizationId": organization_id,
        "visibleSiteCount": len(sites_response.json()),
        "visibleMissionCount": len(missions_response.json()),
        "visibleInvoiceCount": len(invoices_response.json()),
        "readOnlyMutationCheck": "forbidden_role",
    }


def _login_and_refresh_web_session(
    *,
    client: httpx.Client,
    base_url: str,
    args: argparse.Namespace,
) -> tuple[dict[str, Any], dict[str, str]]:
    ensure(bool(args.web_email), "--web-email is required for web smoke")
    ensure(bool(args.web_password), "--web-password is required for web smoke")
    browser_headers = _browser_headers(args.app_origin)
    login_response = client.post(
        f"{base_url}/v1/web/session/login",
        headers=browser_headers,
        json={"email": args.web_email, "password": args.web_password},
    )
    login_response.raise_for_status()
    login_body = login_response.json()
    refresh_cookie = client.cookies.get("fw_refresh")
    ensure(bool(refresh_cookie), "web refresh cookie missing after login")

    me_response = client.get(
        f"{base_url}/v1/web/session/me",
        headers={"Authorization": f"Bearer {login_body['accessToken']}"},
    )
    me_response.raise_for_status()

    refresh_response = client.post(
        f"{base_url}/v1/web/session/refresh",
        headers=browser_headers,
    )
    refresh_response.raise_for_status()
    refreshed_body = refresh_response.json()
    rotated_refresh_cookie = client.cookies.get("fw_refresh")
    ensure(bool(rotated_refresh_cookie), "web refresh cookie missing after refresh")
    ensure(rotated_refresh_cookie != refresh_cookie, "web refresh cookie did not rotate")

    return me_response.json(), {"Authorization": f"Bearer {refreshed_body['accessToken']}"}


def _verify_artifact_downloads(
    *,
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    artifacts: dict[str, Any],
) -> None:
    kmz_descriptor, meta_descriptor = _get_artifact_descriptors(artifacts)
    ensure(isinstance(kmz_descriptor, dict), "mission.kmz descriptor missing")
    ensure(isinstance(meta_descriptor, dict), "mission_meta.json descriptor missing")

    for artifact_name, descriptor in (
        ("mission.kmz", kmz_descriptor),
        ("mission_meta.json", meta_descriptor),
    ):
        download_url = descriptor["downloadUrl"]
        if not download_url.startswith("http"):
            download_url = f"{base_url}{download_url}"
        artifact_response = client.get(download_url, headers=headers)
        artifact_response.raise_for_status()
        artifact_bytes = artifact_response.content
        header_checksum = artifact_response.headers.get("X-Artifact-Checksum")
        descriptor_checksum = descriptor["checksumSha256"]
        ensure(len(artifact_bytes) > 0, f"{artifact_name} payload empty")
        ensure(
            sha256_hex(artifact_bytes) == descriptor_checksum,
            f"{artifact_name} checksum mismatch against descriptor",
        )
        ensure(
            header_checksum == descriptor_checksum,
            f"{artifact_name} checksum header mismatch",
        )


def _get_artifact_descriptors(artifacts: Any) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if isinstance(artifacts, dict):
        return artifacts.get("missionKmz"), artifacts.get("missionMeta")
    if isinstance(artifacts, list):
        by_name = {
            artifact.get("artifactName"): artifact
            for artifact in artifacts
            if isinstance(artifact, dict)
        }
        return by_name.get("mission.kmz"), by_name.get("mission_meta.json")
    return None, None


def _canonical_mode(mode: str) -> str:
    if mode == "web-beta":
        return "web-admin"
    return mode


def _browser_headers(app_origin: str | None) -> dict[str, str]:
    if not app_origin:
        return {}
    normalized_origin = app_origin.rstrip("/")
    return {
        "Origin": normalized_origin,
        "Referer": f"{normalized_origin}/login",
    }


if __name__ == "__main__":
    raise SystemExit(main())
