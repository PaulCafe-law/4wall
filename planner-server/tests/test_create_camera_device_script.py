from __future__ import annotations

import json

from sqlmodel import select

from app.models import CameraDevice
from app.security import verify_camera_device_token
from scripts import create_camera_device
from tests.helpers import seed_organization, seed_site


def test_create_camera_device_script_creates_device_token_once(
    capsys,
    client,
    monkeypatch,
    session_factory,
    test_settings,
) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Provision Org")
        site = seed_site(session, organization_id=org.id, name="Factory Site")
        org_id = org.id
        site_id = site.id
        session.commit()

    monkeypatch.setenv("BUILDING_ROUTE_ENVIRONMENT", "test")
    monkeypatch.setenv("BUILDING_ROUTE_DATABASE_URL", test_settings.database_url)
    monkeypatch.setattr(
        "sys.argv",
        [
            "create_camera_device.py",
            "--organization-id",
            org_id,
            "--site-id",
            site_id,
            "--name",
            "Factory camera 01",
            "--rtsp-configured",
        ],
    )

    assert create_camera_device.main() == 0

    payload = json.loads(capsys.readouterr().out)
    assert payload["created"] is True
    assert payload["cameraId"]
    assert payload["deviceToken"].startswith("fwcam_")
    assert payload["rtspConfigured"] is True

    with session_factory() as session:
        camera = session.exec(select(CameraDevice).where(CameraDevice.id == payload["cameraId"])).one()
        assert camera.organization_id == org_id
        assert camera.site_id == site_id
        assert camera.name == "Factory camera 01"
        assert verify_camera_device_token(payload["deviceToken"], camera.device_token_hash)
