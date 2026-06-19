from __future__ import annotations

import json

from sqlmodel import select

from app.models import CameraDevice, EquipmentWatchZone
from app.security import hash_camera_device_token
from scripts import configure_camera_watch_zones
from tests.helpers import seed_organization


def test_configure_camera_watch_zones_script_creates_and_updates_by_name(
    capsys,
    client,
    monkeypatch,
    session_factory,
    test_settings,
    tmp_path,
) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Watch Zone Script Org")
        camera = _seed_camera(session, org.id)
        camera_id = camera.id
        session.commit()

    zones_file = tmp_path / "zones.json"
    zones_file.write_text(
        json.dumps(
            {
                "zones": [
                    {
                        "name": "CNC stack light",
                        "equipmentName": "CNC-01",
                        "roi": {"type": "box", "x": 0.1, "y": 0.2, "w": 0.2, "h": 0.3},
                        "expectedState": "green",
                        "alertOnStates": ["red"],
                        "minConfidence": 0.8,
                        "severity": "high",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    _run_script(monkeypatch, test_settings.database_url, camera_id, zones_file)
    first_payload = json.loads(capsys.readouterr().out)
    zone_id = first_payload["zones"][0]["zoneId"]

    zones_file.write_text(
        json.dumps(
            {
                "zones": [
                    {
                        "name": "CNC stack light",
                        "equipmentName": "CNC-01",
                        "roi": {"type": "box", "x": 0.1, "y": 0.2, "w": 0.2, "h": 0.3},
                        "expectedState": "green",
                        "alertOnStates": ["red", "off"],
                        "minConfidence": 0.9,
                        "severity": "critical",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    _run_script(monkeypatch, test_settings.database_url, camera_id, zones_file)
    second_payload = json.loads(capsys.readouterr().out)

    assert second_payload["zones"][0]["zoneId"] == zone_id
    assert second_payload["zones"][0]["severity"] == "critical"
    assert second_payload["zones"][0]["alertOnStates"] == ["red", "off"]
    with session_factory() as session:
        zones = session.exec(select(EquipmentWatchZone).where(EquipmentWatchZone.camera_id == camera_id)).all()
        assert len(zones) == 1
        assert zones[0].min_confidence == 0.9


def test_configure_camera_watch_zones_script_replaces_omitted_zones(
    capsys,
    client,
    monkeypatch,
    session_factory,
    test_settings,
    tmp_path,
) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Watch Zone Replace Org")
        camera = _seed_camera(session, org.id)
        camera_id = camera.id
        first = _seed_zone(session, camera, name="Keep")
        second = _seed_zone(session, camera, name="Deactivate")
        first_id = first.id
        second_id = second.id
        session.commit()

    zones_file = tmp_path / "zones.json"
    zones_file.write_text(
        json.dumps(
            {
                "zones": [
                    {
                        "zoneId": first_id,
                        "name": "Keep",
                        "equipmentName": "Pump-01",
                        "roi": {"type": "box", "x": 0.1, "y": 0.1, "w": 0.4, "h": 0.4},
                        "expectedState": "on",
                        "alertOnStates": ["off"],
                        "minConfidence": 0.8,
                        "severity": "medium",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    _run_script(monkeypatch, test_settings.database_url, camera_id, zones_file)
    payload = json.loads(capsys.readouterr().out)

    assert payload["deactivatedZoneIds"] == [second_id]
    with session_factory() as session:
        keep = session.get(EquipmentWatchZone, first_id)
        deactivated = session.get(EquipmentWatchZone, second_id)
        assert keep.is_active is True
        assert deactivated.is_active is False


def _run_script(monkeypatch, database_url: str, camera_id: str, zones_file) -> None:
    monkeypatch.setenv("BUILDING_ROUTE_ENVIRONMENT", "test")
    monkeypatch.setenv("BUILDING_ROUTE_DATABASE_URL", database_url)
    monkeypatch.setattr(
        "sys.argv",
        [
            "configure_camera_watch_zones.py",
            "--camera-id",
            camera_id,
            "--zones-file",
            str(zones_file),
        ],
    )
    assert configure_camera_watch_zones.main() == 0


def _seed_camera(session, organization_id: str) -> CameraDevice:
    camera = CameraDevice(
        organization_id=organization_id,
        name="Script Camera",
        device_token_hash=hash_camera_device_token("fwcam_script"),
        rtsp_configured=True,
    )
    session.add(camera)
    session.flush()
    return camera


def _seed_zone(session, camera: CameraDevice, *, name: str) -> EquipmentWatchZone:
    zone = EquipmentWatchZone(
        camera_id=camera.id,
        organization_id=camera.organization_id,
        name=name,
        equipment_name=name,
        roi_json={"type": "box", "x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2},
        expected_state="on",
        alert_on_states_json=["off"],
        min_confidence=0.8,
        severity="medium",
        is_active=True,
    )
    session.add(zone)
    session.flush()
    return zone
