from __future__ import annotations

import argparse
import hashlib
import json
import sys

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
    parser.add_argument("--username", required=True, help="Operator username")
    parser.add_argument("--password", required=True, help="Operator password")
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

        mission_id = plan_body.get("missionId")
        artifacts = plan_body.get("artifacts", {})
        kmz_descriptor = artifacts.get("missionKmz")
        meta_descriptor = artifacts.get("missionMeta")

        ensure(bool(mission_id), "missionId missing from plan response")
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

        print(
            json.dumps(
                {
                    "status": "ok",
                    "missionId": mission_id,
                    "operator": me_body["username"],
                    "downloadsVerified": ["mission.kmz", "mission_meta.json"],
                },
                indent=2,
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
