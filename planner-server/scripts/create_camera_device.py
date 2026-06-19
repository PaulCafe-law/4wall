from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlmodel import Session


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.config import Settings
from app.db import create_engine_for_settings
from app.models import CameraDevice, Organization, Site, utc_now
from app.security import create_camera_device_token, hash_camera_device_token


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or update a Factory Camera device.")
    parser.add_argument("--organization-id", required=True, help="Organization that owns the camera.")
    parser.add_argument("--site-id", help="Optional site id for the camera.")
    parser.add_argument("--camera-id", help="Existing camera id to update.")
    parser.add_argument("--name", required=True, help="Human-readable camera name.")
    parser.add_argument("--status", choices=["active", "inactive"], default="active")
    parser.add_argument("--sampling-interval-seconds", type=int, default=10)
    parser.add_argument("--retention-days", type=int, default=7)
    parser.add_argument("--local-spool-hours", type=int, default=24)
    parser.add_argument("--rtsp-configured", action="store_true", help="Mark RTSP credentials configured on the Pi.")
    parser.add_argument("--rotate-token", action="store_true", help="Replace the existing camera device token.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    settings = Settings.from_env()
    engine = create_engine_for_settings(settings)

    with Session(engine) as session:
        _validate_scope(session, organization_id=args.organization_id, site_id=args.site_id)
        camera = session.get(CameraDevice, args.camera_id) if args.camera_id else None
        if args.camera_id and camera is None:
            raise SystemExit("camera_not_found")
        token = None
        created = camera is None

        if camera is None:
            token = create_camera_device_token()
            camera = CameraDevice(
                organization_id=args.organization_id,
                site_id=args.site_id,
                name=args.name.strip(),
                status=args.status,
                device_token_hash=hash_camera_device_token(token),
                rtsp_configured=args.rtsp_configured,
                sampling_interval_seconds=args.sampling_interval_seconds,
                retention_days=args.retention_days,
                local_spool_hours=args.local_spool_hours,
            )
        else:
            if camera.organization_id != args.organization_id:
                raise SystemExit("camera_organization_mismatch")
            if args.site_id is not None and camera.site_id != args.site_id:
                camera.site_id = args.site_id
            camera.name = args.name.strip()
            camera.status = args.status
            camera.rtsp_configured = args.rtsp_configured or camera.rtsp_configured
            camera.sampling_interval_seconds = args.sampling_interval_seconds
            camera.retention_days = args.retention_days
            camera.local_spool_hours = args.local_spool_hours
            camera.updated_at = utc_now()
            if args.rotate_token:
                token = create_camera_device_token()
                camera.device_token_hash = hash_camera_device_token(token)

        session.add(camera)
        session.commit()
        session.refresh(camera)

        output = {
            "created": created,
            "cameraId": camera.id,
            "organizationId": camera.organization_id,
            "siteId": camera.site_id,
            "name": camera.name,
            "status": camera.status,
            "samplingIntervalSeconds": camera.sampling_interval_seconds,
            "retentionDays": camera.retention_days,
            "localSpoolHours": camera.local_spool_hours,
            "rtspConfigured": camera.rtsp_configured,
        }
        if token is not None:
            output["deviceToken"] = token
            output["deviceTokenWarning"] = "Store this on the Pi now. The plaintext token is not recoverable."
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


def _validate_scope(session: Session, *, organization_id: str, site_id: str | None) -> None:
    organization = session.get(Organization, organization_id)
    if organization is None:
        raise SystemExit("organization_not_found")
    if site_id is None:
        return
    site = session.get(Site, site_id)
    if site is None:
        raise SystemExit("site_not_found")
    if site.organization_id != organization_id:
        raise SystemExit("site_organization_mismatch")


if __name__ == "__main__":
    raise SystemExit(main())
