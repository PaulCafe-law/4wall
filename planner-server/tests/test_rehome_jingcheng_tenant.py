from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import select

from app.models import (
    CameraDevice,
    CameraFrame,
    CameraGaugeReading,
    CameraOcrObservation,
    CameraPersonObservation,
    DecisionPointRecord,
    LineGroupBinding,
    Organization,
    OrganizationMembership,
)
from scripts.rehome_jingcheng_tenant import rehome_jingcheng_tenant
from tests.helpers import seed_organization, seed_site, seed_user


def test_rehome_jingcheng_moves_only_target_site_and_customer_data(client, session_factory) -> None:
    with session_factory() as session:
        source = seed_organization(session, name="Mixed Source")
        old_customer_org = seed_organization(session, name="Empty Customer")
        other_site = seed_site(session, organization_id=source.id, name="Other Factory")
        jingcheng_site = seed_site(session, organization_id=source.id, name="Jingcheng Factory")
        customer = seed_user(
            session,
            email="jingcheng",
            password="Password123!",
            org_roles=[(old_customer_org.id, "customer_viewer")],
        )
        cameras = [
            CameraDevice(
                organization_id=source.id,
                site_id=jingcheng_site.id,
                name=f"Camera {index}",
                device_token_hash=f"rehome-camera-token-{index}",
            )
            for index in range(3)
        ]
        session.add_all(cameras)
        session.flush()
        captured_at = datetime(2026, 7, 10, tzinfo=timezone.utc)
        session.add_all(
            [
                CameraFrame(
                    id="jingcheng-frame",
                    camera_id=cameras[0].id,
                    organization_id=source.id,
                    site_id=jingcheng_site.id,
                    captured_at=captured_at,
                    storage_key="camera-frames/mixed/jingcheng-frame.jpg",
                    content_type="image/jpeg",
                    upload_status="uploaded",
                    analysis_status="queued",
                    upload_expires_at=captured_at,
                ),
                # Older edge uploads can omit site_id. The camera ID is the
                # safe fallback and this also exercises multiple small batches.
                CameraFrame(
                    id="jingcheng-legacy-frame",
                    camera_id=cameras[0].id,
                    organization_id=source.id,
                    captured_at=captured_at,
                    storage_key="camera-frames/mixed/jingcheng-legacy-frame.jpg",
                    content_type="image/jpeg",
                    upload_status="uploaded",
                    analysis_status="queued",
                    upload_expires_at=captured_at,
                ),
            ]
        )
        session.add(
            CameraGaugeReading(
                camera_id=cameras[0].id,
                organization_id=source.id,
                site_id=jingcheng_site.id,
                gauge_id="press_am_meter",
                label="壓力表",
                value=8.0,
                unit="A",
                confidence=0.9,
                captured_at=captured_at,
            )
        )
        session.add(
            CameraOcrObservation(
                camera_id=cameras[0].id,
                organization_id=source.id,
                site_id=jingcheng_site.id,
                mode="machine_monitor",
                mode_confidence=0.9,
                captured_at=captured_at,
            )
        )
        session.add(
            CameraPersonObservation(
                camera_id=cameras[0].id,
                organization_id=source.id,
                site_id=jingcheng_site.id,
                captured_at=captured_at,
                image_width=1920,
                image_height=1080,
                person_count=1,
            )
        )
        session.add(
            DecisionPointRecord(
                organization_id=source.id,
                site_id=jingcheng_site.id,
                event_type="plan_vs_actual",
                subject_ref="HC600-01",
                occurred_at=captured_at,
            )
        )
        session.add(
            LineGroupBinding(
                group_id="C-jingcheng-test",
                organization_id=source.id,
                site_id=jingcheng_site.id,
                site_slug="jingcheng",
            )
        )
        session.commit()

        dry_run = rehome_jingcheng_tenant(
            session,
            site_id=jingcheng_site.id,
            account_email=customer.email,
            target_org_name="靚程企業",
            target_org_slug="jingcheng",
            apply=False,
        )
        assert dry_run["mode"] == "dry-run"
        assert dry_run["counts"]["camera_frames"] == 2
        assert session.get(type(jingcheng_site), jingcheng_site.id).organization_id == source.id

        result = rehome_jingcheng_tenant(
            session,
            site_id=jingcheng_site.id,
            account_email=customer.email,
            target_org_name="靚程企業",
            target_org_slug="jingcheng",
            batch_size=1,
            apply=True,
        )

        target = session.exec(select(Organization).where(Organization.slug == "jingcheng")).one()
        assert target.product_mode == "factory_ops"
        assert result["verification"]["cameraCount"] == 3
        assert result["firstPass"]["camera_frames"] == 2
        assert session.get(type(jingcheng_site), jingcheng_site.id).organization_id == target.id
        assert session.get(type(other_site), other_site.id).organization_id == source.id
        assert session.get(CameraFrame, "jingcheng-frame").organization_id == target.id
        assert session.get(CameraFrame, "jingcheng-legacy-frame").organization_id == target.id
        assert session.exec(select(DecisionPointRecord)).one().organization_id == target.id
        assert session.exec(select(LineGroupBinding)).one().organization_id == target.id

        memberships = session.exec(
            select(OrganizationMembership).where(OrganizationMembership.user_id == customer.id)
        ).all()
        active_org_ids = {membership.organization_id for membership in memberships if membership.is_active}
        assert active_org_ids == {target.id}

        rerun = rehome_jingcheng_tenant(
            session,
            site_id=jingcheng_site.id,
            account_email=customer.email,
            target_org_name="靚程企業",
            target_org_slug="jingcheng",
            batch_size=1,
            apply=True,
        )
        assert rerun["verification"]["cameraCount"] == 3
        assert all(changed == 0 for changed in rerun["firstPass"].values())
        assert all(changed == 0 for changed in rerun["secondPass"].values())
