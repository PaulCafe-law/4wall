from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
import secrets
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


SMOKE_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke test camera ingest upload with a synthetic frame.")
    parser.add_argument("--api-base-url", default=os.getenv("CAMERA_SMOKE_API_BASE_URL") or os.getenv("CAMERA_AGENT_API_BASE_URL"))
    parser.add_argument("--device-token", default=os.getenv("CAMERA_SMOKE_DEVICE_TOKEN") or os.getenv("CAMERA_AGENT_DEVICE_TOKEN"))
    parser.add_argument("--frame-id", default=None)
    parser.add_argument("--timeout-seconds", type=int, default=int(os.getenv("CAMERA_SMOKE_TIMEOUT_SECONDS", "30")))
    parser.add_argument(
        "--wait-for-analysis",
        action="store_true",
        default=os.getenv("CAMERA_SMOKE_WAIT_FOR_ANALYSIS", "").strip().lower() in {"1", "true", "yes", "on"},
        help="Poll the frame until the analysis worker processes it.",
    )
    parser.add_argument(
        "--analysis-timeout-seconds",
        type=int,
        default=int(os.getenv("CAMERA_SMOKE_ANALYSIS_TIMEOUT_SECONDS", "120")),
    )
    parser.add_argument(
        "--analysis-poll-seconds",
        type=float,
        default=float(os.getenv("CAMERA_SMOKE_ANALYSIS_POLL_SECONDS", "5")),
    )
    parser.add_argument(
        "--require-analysis-status",
        choices=["succeeded", "skipped"],
        default=os.getenv("CAMERA_SMOKE_REQUIRE_ANALYSIS_STATUS"),
        help="Require a final analysis status. By default, succeeded and skipped are accepted.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.api_base_url:
        print("missing_api_base_url", file=sys.stderr)
        return 2
    if not args.device_token:
        print("missing_device_token", file=sys.stderr)
        return 2

    client = CameraSmokeClient(args.api_base_url, args.device_token, args.timeout_seconds)
    captured_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    frame_id = args.frame_id or f"smoke-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{secrets.token_hex(4)}"
    checksum = hashlib.sha256(SMOKE_PNG_BYTES).hexdigest()

    try:
        intent = client.json_request(
            "POST",
            "/v1/camera-ingest/upload-intents",
            {
                "frameId": frame_id,
                "capturedAt": captured_at,
                "contentType": "image/png",
                "checksumSha256": checksum,
                "sizeBytes": len(SMOKE_PNG_BYTES),
                "width": 1,
                "height": 1,
            },
            auth=True,
        )
        client.upload(intent, SMOKE_PNG_BYTES)
        frame = client.json_request(
            "POST",
            f"/v1/camera-ingest/frames/{frame_id}/complete",
            {"checksumSha256": checksum, "sizeBytes": len(SMOKE_PNG_BYTES), "width": 1, "height": 1},
            auth=True,
        )
        heartbeat = client.json_request(
            "POST",
            "/v1/camera-ingest/heartbeat",
            {"localSpoolCount": 0, "lastCapturedAt": captured_at, "lastError": None},
            auth=True,
        )
        if args.wait_for_analysis:
            frame = client.wait_for_analysis(
                frame_id,
                timeout_seconds=args.analysis_timeout_seconds,
                poll_seconds=args.analysis_poll_seconds,
                required_status=args.require_analysis_status,
            )
    except (HTTPError, URLError, RuntimeError) as exc:
        print(json.dumps({"ok": False, "error": _safe_error(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1

    accepted_statuses = [args.require_analysis_status] if args.require_analysis_status else ["succeeded", "skipped"]
    print(
        json.dumps(
            {
                "ok": True,
                "frameId": frame["frameId"],
                "cameraId": frame["cameraId"],
                "uploadStatus": frame["uploadStatus"],
                "analysisStatus": frame["analysisStatus"],
                "analysisAcceptedStatuses": accepted_statuses if args.wait_for_analysis else [],
                "analysisError": frame.get("errorMessage"),
                "heartbeatReceivedAt": heartbeat["receivedAt"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


class CameraSmokeClient:
    def __init__(self, api_base_url: str, device_token: str, timeout_seconds: int) -> None:
        self.api_base_url = api_base_url.rstrip("/") + "/"
        self.device_token = device_token
        self.timeout_seconds = timeout_seconds

    def json_request(self, method: str, path: str, payload: dict[str, Any] | None, *, auth: bool) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if auth:
            headers["Authorization"] = f"Bearer {self.device_token}"
        data = None
        if payload is not None:
            data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request = Request(
            self.absolute_url(path),
            data=data,
            method=method,
            headers=headers,
        )
        with urlopen(request, timeout=self.timeout_seconds) as response:
            body = response.read()
            if response.status >= 400:
                raise RuntimeError(f"request_failed:{path}:{response.status}")
            return json.loads(body.decode("utf-8")) if body else {}

    def upload(self, intent: dict[str, Any], data: bytes) -> None:
        upload_url = str(intent.get("uploadUrl") or "")
        if not upload_url:
            return
        headers = dict(intent.get("uploadHeaders") or {})
        if intent.get("uploadRequiresAuth", True):
            headers["Authorization"] = f"Bearer {self.device_token}"
        url = self.absolute_url(upload_url) if upload_url.startswith("/") else upload_url
        request = Request(url, data=data, method=str(intent.get("uploadMethod") or "PUT"), headers=headers)
        with urlopen(request, timeout=self.timeout_seconds) as response:
            if response.status >= 400:
                raise RuntimeError(f"upload_failed:{response.status}")

    def absolute_url(self, path: str) -> str:
        return urljoin(self.api_base_url, path.lstrip("/"))

    def frame_status(self, frame_id: str) -> dict[str, Any]:
        return self.json_request("GET", f"/v1/camera-ingest/frames/{frame_id}", None, auth=True)

    def wait_for_analysis(
        self,
        frame_id: str,
        *,
        timeout_seconds: int,
        poll_seconds: float,
        required_status: str | None,
    ) -> dict[str, Any]:
        accepted_statuses = {required_status} if required_status else {"succeeded", "skipped"}
        deadline = time.monotonic() + timeout_seconds
        last_frame: dict[str, Any] | None = None
        while time.monotonic() <= deadline:
            last_frame = self.frame_status(frame_id)
            status = str(last_frame.get("analysisStatus") or "")
            if status in accepted_statuses:
                return last_frame
            if status == "failed":
                raise RuntimeError(f"analysis_failed:{last_frame.get('errorMessage') or 'unknown'}")
            if status not in {"pending", "queued"}:
                raise RuntimeError(f"unexpected_analysis_status:{status}")
            time.sleep(max(0.1, poll_seconds))
        status = (last_frame or {}).get("analysisStatus") or "unknown"
        raise RuntimeError(f"analysis_timeout:{status}")


def _safe_error(exc: BaseException) -> str:
    return str(exc).replace("\n", " ").replace("\r", " ")[:240]


if __name__ == "__main__":
    raise SystemExit(main())
