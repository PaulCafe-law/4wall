from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.config import Settings
from app.db import create_engine_for_settings
from app.models import CameraDevice, EquipmentWatchZone, utc_now
from app.routers.camera_ingest import EquipmentWatchZoneInputDto, _validate_zone


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or update Factory Camera watch zones.")
    parser.add_argument("--camera-id", required=True, help="Camera device id to configure.")
    parser.add_argument("--zones-file", required=True, help="JSON file containing {\"zones\": [...]} or a raw list.")
    parser.add_argument(
        "--merge",
        action="store_true",
        help="Keep existing active zones that are omitted from the zones file.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    settings = Settings.from_env()
    engine = create_engine_for_settings(settings)
    zone_inputs = load_zone_inputs(Path(args.zones_file))

    with Session(engine) as session:
        camera = session.get(CameraDevice, args.camera_id)
        if camera is None:
            raise SystemExit("camera_not_found")
        result = configure_watch_zones(
            session,
            camera=camera,
            zone_inputs=zone_inputs,
            replace=not args.merge,
        )
        session.commit()

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def load_zone_inputs(path: Path) -> list[EquipmentWatchZoneInputDto]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw_zones = payload.get("zones") if isinstance(payload, dict) else payload
    if not isinstance(raw_zones, list):
        raise SystemExit("zones_file_must_contain_zones_list")
    zones: list[EquipmentWatchZoneInputDto] = []
    for raw_zone in raw_zones:
        try:
            zone = EquipmentWatchZoneInputDto.model_validate(raw_zone)
            _validate_zone(zone)
        except HTTPException as exc:
            raise SystemExit(str(exc.detail)) from exc
        except Exception as exc:
            raise SystemExit(f"invalid_watch_zone:{exc}") from exc
        zones.append(zone)
    if not zones:
        raise SystemExit("zones_file_must_not_be_empty")
    return zones


def configure_watch_zones(
    session: Session,
    *,
    camera: CameraDevice,
    zone_inputs: list[EquipmentWatchZoneInputDto],
    replace: bool = True,
) -> dict[str, Any]:
    existing = list(session.exec(select(EquipmentWatchZone).where(EquipmentWatchZone.camera_id == camera.id)).all())
    existing_by_id = {zone.id: zone for zone in existing}
    existing_by_name = {zone.name.strip().lower(): zone for zone in existing}
    retained_ids: set[str] = set()
    output_zones: list[dict[str, Any]] = []

    for item in zone_inputs:
        zone = None
        if item.zoneId:
            zone = existing_by_id.get(item.zoneId)
            if zone is None:
                raise SystemExit(f"watch_zone_not_found:{item.zoneId}")
        if zone is None:
            zone = existing_by_name.get(item.name.strip().lower())
        if zone is None:
            zone = EquipmentWatchZone(
                camera_id=camera.id,
                organization_id=camera.organization_id,
                name=item.name.strip(),
                equipment_name=item.equipmentName.strip(),
                roi_json=item.roi,
                expected_state=item.expectedState.strip(),
                alert_on_states_json=_clean_alert_states(item.alertOnStates),
                min_confidence=item.minConfidence,
                severity=item.severity,
                is_active=True,
            )
        else:
            zone.name = item.name.strip()
            zone.equipment_name = item.equipmentName.strip()
            zone.roi_json = item.roi
            zone.expected_state = item.expectedState.strip()
            zone.alert_on_states_json = _clean_alert_states(item.alertOnStates)
            zone.min_confidence = item.minConfidence
            zone.severity = item.severity
            zone.is_active = True
            zone.updated_at = utc_now()
        session.add(zone)
        session.flush()
        retained_ids.add(zone.id)
        output_zones.append(_serialize_zone(zone))

    deactivated_zone_ids: list[str] = []
    if replace:
        for zone in existing:
            if zone.id in retained_ids or not zone.is_active:
                continue
            zone.is_active = False
            zone.updated_at = utc_now()
            session.add(zone)
            deactivated_zone_ids.append(zone.id)

    return {
        "cameraId": camera.id,
        "organizationId": camera.organization_id,
        "replace": replace,
        "activeZoneCount": len(output_zones),
        "deactivatedZoneIds": deactivated_zone_ids,
        "zones": output_zones,
    }


def _clean_alert_states(states: list[str]) -> list[str]:
    return [state.strip() for state in states if state.strip()]


def _serialize_zone(zone: EquipmentWatchZone) -> dict[str, Any]:
    return {
        "zoneId": zone.id,
        "cameraId": zone.camera_id,
        "organizationId": zone.organization_id,
        "name": zone.name,
        "equipmentName": zone.equipment_name,
        "roi": zone.roi_json,
        "expectedState": zone.expected_state,
        "alertOnStates": zone.alert_on_states_json,
        "minConfidence": zone.min_confidence,
        "severity": zone.severity,
        "isActive": zone.is_active,
    }


if __name__ == "__main__":
    raise SystemExit(main())
