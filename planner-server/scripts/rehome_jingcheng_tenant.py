"""Move the Jingcheng factory into its own customer tenant.

The command is intentionally dry-run by default. It only touches the named
site, its cameras, and rows that explicitly reference that site or cameras.
It never deletes frames or storage objects.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import and_, func, or_, update
from sqlmodel import Session, select

from app.audit import record_audit
from app.config import Settings
from app.db import create_engine_for_settings
from app.models import (
    CameraDevice,
    CameraFrame,
    CameraGaugeReading,
    CameraOcrObservation,
    CameraPersonObservation,
    DecisionPointRecord,
    EquipmentStateObservation,
    EquipmentWatchZone,
    IncidentRecord,
    IndustrialEngineJob,
    InspectionEventRecord,
    InspectionRoute,
    InspectionSchedule,
    InspectionTemplate,
    LineGroupBinding,
    Mission,
    Organization,
    OrganizationMembership,
    SemanticZoneRecord,
    Site,
    UserAccount,
)

DEFAULT_SITE_ID = "dd6cbdd3aa744736ad96d2791d689fce"
DEFAULT_ACCOUNT_EMAIL = "jingcheng"
DEFAULT_TARGET_ORG_NAME = "靚程企業"
DEFAULT_TARGET_ORG_SLUG = "jingcheng"

# These camera tables can be matched by their site when available, then by the
# three known camera IDs only for legacy rows that have no site assignment.
# Keeping this as one update per table is important: the factory history is
# sizeable and re-updating every row extends the production write lock.
SITE_AND_CAMERA_SCOPED_MODELS = (
    CameraFrame,
    CameraGaugeReading,
    CameraOcrObservation,
    CameraPersonObservation,
    EquipmentStateObservation,
)

# These tables have an explicit site_id and can be moved without guessing from
# text fields or human-readable names. The factory has no legacy route data at
# present, but including these tables makes the command fail-safe if any exists.
SITE_ONLY_MODELS = (
    InspectionRoute,
    InspectionTemplate,
    InspectionSchedule,
    Mission,
    InspectionEventRecord,
    IncidentRecord,
    IndustrialEngineJob,
    LineGroupBinding,
    DecisionPointRecord,
    SemanticZoneRecord,
)

# This table has no site_id, so camera IDs are its sole safe scope.
CAMERA_ONLY_MODELS = (
    EquipmentWatchZone,
)

SITE_SCOPED_MODELS = SITE_AND_CAMERA_SCOPED_MODELS + SITE_ONLY_MODELS
CAMERA_SCOPED_MODELS = SITE_AND_CAMERA_SCOPED_MODELS + CAMERA_ONLY_MODELS


def _count(statement, session: Session) -> int:
    return int(session.exec(statement).one() or 0)


def _site_counts(session: Session, site_id: str, camera_ids: list[str]) -> dict[str, int]:
    counts = {
        "camera_devices": _count(
            select(func.count()).select_from(CameraDevice).where(CameraDevice.site_id == site_id), session
        ),
    }
    for model in SITE_SCOPED_MODELS:
        counts[model.__tablename__] = _count(
            select(func.count()).select_from(model).where(model.site_id == site_id), session
        )
    for model in CAMERA_SCOPED_MODELS:
        name = model.__tablename__
        if name in counts:
            continue
        counts[name] = _count(
            select(func.count()).select_from(model).where(model.camera_id.in_(camera_ids)), session
        )
    return counts


def _expected_camera_ids(session: Session, site_id: str, expected_camera_count: int) -> list[str]:
    cameras = session.exec(
        select(CameraDevice).where(CameraDevice.site_id == site_id).order_by(CameraDevice.created_at.asc())
    ).all()
    if len(cameras) != expected_camera_count:
        raise RuntimeError(
            f"expected {expected_camera_count} cameras for site {site_id}, found {len(cameras)}; refusing to migrate"
        )
    return [camera.id for camera in cameras]


def _load_source(session: Session, *, site_id: str, account_email: str, expected_camera_count: int) -> tuple[Site, UserAccount, list[str]]:
    site = session.get(Site, site_id)
    if site is None:
        raise RuntimeError(f"site {site_id} was not found")
    account = session.exec(select(UserAccount).where(UserAccount.email == account_email.lower())).first()
    if account is None:
        raise RuntimeError(f"account {account_email!r} was not found")
    return site, account, _expected_camera_ids(session, site.id, expected_camera_count)


def _ensure_target_organization(
    session: Session,
    *,
    target_org_name: str,
    target_org_slug: str,
) -> Organization:
    organization = session.exec(select(Organization).where(Organization.slug == target_org_slug)).first()
    if organization is None:
        organization = Organization(name=target_org_name, slug=target_org_slug, product_mode="factory_ops")
        session.add(organization)
        session.flush()
    else:
        organization.name = target_org_name
        organization.product_mode = "factory_ops"
        session.add(organization)
        session.flush()
    return organization


def _upsert_customer_membership(session: Session, *, user_id: str, target_org_id: str) -> dict[str, int]:
    membership = session.exec(
        select(OrganizationMembership).where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.organization_id == target_org_id,
        )
    ).first()
    created = 0
    if membership is None:
        membership = OrganizationMembership(
            user_id=user_id,
            organization_id=target_org_id,
            role="customer_viewer",
            is_active=True,
        )
        session.add(membership)
        created = 1
    else:
        membership.role = "customer_viewer"
        membership.is_active = True
        session.add(membership)

    deactivated = session.exec(
        update(OrganizationMembership)
        .where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.organization_id.is_not(None),
            OrganizationMembership.organization_id != target_org_id,
            OrganizationMembership.is_active.is_(True),
        )
        .values(is_active=False)
    ).rowcount or 0
    return {"membershipCreated": created, "otherMembershipsDeactivated": int(deactivated)}


def _not_in_target(model: type[Any], target_org_id: str):
    """Return only rows that still need to be moved to the target tenant."""
    return or_(model.organization_id.is_(None), model.organization_id != target_org_id)


def _move_rows(session: Session, *, site_id: str, camera_ids: list[str], target_org_id: str) -> dict[str, int]:
    changed: dict[str, int] = {}
    changed["site"] = int(
        session.exec(
            update(Site)
            .where(Site.id == site_id, _not_in_target(Site, target_org_id))
            .values(organization_id=target_org_id)
        ).rowcount
        or 0
    )
    changed["camera_devices"] = int(
        session.exec(
            update(CameraDevice)
            .where(CameraDevice.id.in_(camera_ids), _not_in_target(CameraDevice, target_org_id))
            .values(organization_id=target_org_id)
        ).rowcount
        or 0
    )
    for model in SITE_AND_CAMERA_SCOPED_MODELS:
        changed[model.__tablename__] = int(
            session.exec(
                update(model)
                .where(
                    _not_in_target(model, target_org_id),
                    or_(
                        model.site_id == site_id,
                        and_(model.site_id.is_(None), model.camera_id.in_(camera_ids)),
                    ),
                )
                .values(organization_id=target_org_id)
            ).rowcount
            or 0
        )
    for model in SITE_ONLY_MODELS:
        changed[model.__tablename__] = int(
            session.exec(
                update(model)
                .where(model.site_id == site_id, _not_in_target(model, target_org_id))
                .values(organization_id=target_org_id)
            ).rowcount or 0
        )
    for model in CAMERA_ONLY_MODELS:
        changed[model.__tablename__] = int(
            session.exec(
                update(model)
                .where(model.camera_id.in_(camera_ids), _not_in_target(model, target_org_id))
                .values(organization_id=target_org_id)
            ).rowcount or 0
        )
    return changed


def _verify_target(
    session: Session,
    *,
    site_id: str,
    camera_ids: list[str],
    target_org_id: str,
) -> dict[str, Any]:
    site = session.get(Site, site_id)
    if site is None or site.organization_id != target_org_id:
        raise RuntimeError("site organization verification failed")
    moved_cameras = _count(
        select(func.count())
        .select_from(CameraDevice)
        .where(CameraDevice.id.in_(camera_ids), CameraDevice.organization_id == target_org_id),
        session,
    )
    if moved_cameras != len(camera_ids):
        raise RuntimeError("camera organization verification failed")

    remaining_foreign_rows: dict[str, int] = {}
    for model in SITE_AND_CAMERA_SCOPED_MODELS:
        remaining_foreign_rows[model.__tablename__] = _count(
            select(func.count())
            .select_from(model)
            .where(
                _not_in_target(model, target_org_id),
                or_(
                    model.site_id == site_id,
                    and_(model.site_id.is_(None), model.camera_id.in_(camera_ids)),
                ),
            ),
            session,
        )
    for model in SITE_ONLY_MODELS:
        remaining_foreign_rows[model.__tablename__] = _count(
            select(func.count())
            .select_from(model)
            .where(model.site_id == site_id, _not_in_target(model, target_org_id)),
            session,
        )
    for model in CAMERA_ONLY_MODELS:
        remaining_foreign_rows[model.__tablename__] = _count(
            select(func.count())
            .select_from(model)
            .where(model.camera_id.in_(camera_ids), _not_in_target(model, target_org_id)),
            session,
        )
    leaks = {name: count for name, count in remaining_foreign_rows.items() if count}
    if leaks:
        raise RuntimeError(f"foreign organization still has Jingcheng rows: {leaks}")
    return {
        "siteOrganizationId": site.organization_id,
        "cameraCount": moved_cameras,
        "remainingForeignRows": remaining_foreign_rows,
    }


def rehome_jingcheng_tenant(
    session: Session,
    *,
    site_id: str = DEFAULT_SITE_ID,
    account_email: str = DEFAULT_ACCOUNT_EMAIL,
    target_org_name: str = DEFAULT_TARGET_ORG_NAME,
    target_org_slug: str = DEFAULT_TARGET_ORG_SLUG,
    expected_camera_count: int = 3,
    apply: bool = False,
) -> dict[str, Any]:
    site, account, camera_ids = _load_source(
        session,
        site_id=site_id,
        account_email=account_email,
        expected_camera_count=expected_camera_count,
    )
    source_org_id = site.organization_id
    current_target = session.exec(select(Organization).where(Organization.slug == target_org_slug)).first()
    plan = {
        "mode": "apply" if apply else "dry-run",
        "siteId": site.id,
        "sourceOrganizationId": source_org_id,
        "targetOrganizationId": current_target.id if current_target is not None else None,
        "targetOrganizationSlug": target_org_slug,
        "cameraIds": camera_ids,
        "counts": _site_counts(session, site.id, camera_ids),
        "accountUserId": account.id,
    }
    if not apply:
        return plan

    try:
        target = _ensure_target_organization(
            session,
            target_org_name=target_org_name,
            target_org_slug=target_org_slug,
        )
        membership_changes = _upsert_customer_membership(session, user_id=account.id, target_org_id=target.id)
        first_pass = _move_rows(session, site_id=site.id, camera_ids=camera_ids, target_org_id=target.id)
        record_audit(
            session,
            action="tenant.jingcheng_rehomed",
            organization_id=target.id,
            target_type="site",
            target_id=site.id,
            metadata={"sourceOrganizationId": source_org_id, "cameraIds": camera_ids, "pass": 1},
        )
        session.commit()

        # A camera upload can have started before its CameraDevice row changed.
        # Run a second, short reconciliation pass before declaring success.
        second_pass = _move_rows(session, site_id=site.id, camera_ids=camera_ids, target_org_id=target.id)
        session.commit()
        verification = _verify_target(
            session,
            site_id=site.id,
            camera_ids=camera_ids,
            target_org_id=target.id,
        )
    except Exception:
        session.rollback()
        raise

    return {
        **plan,
        "targetOrganizationId": target.id,
        "membership": membership_changes,
        "firstPass": first_pass,
        "secondPass": second_pass,
        "verification": verification,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="perform the tenant rehome; omitted means dry-run")
    parser.add_argument("--site-id", default=DEFAULT_SITE_ID)
    parser.add_argument("--account-email", default=DEFAULT_ACCOUNT_EMAIL)
    parser.add_argument("--target-org-name", default=DEFAULT_TARGET_ORG_NAME)
    parser.add_argument("--target-org-slug", default=DEFAULT_TARGET_ORG_SLUG)
    parser.add_argument("--expected-camera-count", type=int, default=3)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    engine = create_engine_for_settings(Settings.from_env())
    with Session(engine) as session:
        result = rehome_jingcheng_tenant(
            session,
            site_id=args.site_id,
            account_email=args.account_email,
            target_org_name=args.target_org_name,
            target_org_slug=args.target_org_slug,
            expected_camera_count=args.expected_camera_count,
            apply=args.apply,
        )
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
