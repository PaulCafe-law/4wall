from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from sqlmodel import Session, select


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.config import Settings
from app.db import create_engine_for_settings
from app.line_floorplan.layout import FloorplanLayoutError, load_floorplan_layout
from app.models import LineGroupBinding, Organization, Site


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bind a LINE group to a factory site.")
    parser.add_argument("--group-id", required=True, help="LINE groupId from webhook logs.")
    parser.add_argument("--source-type", default="group", choices=["group"], help="LINE source type.")
    parser.add_argument("--organization-id", required=True, help="Organization id that owns the site.")
    parser.add_argument("--site-id", required=True, help="Planner Site id to expose to this LINE group.")
    parser.add_argument("--site-slug", default="jingcheng", help="Floorplan layout slug.")
    return parser.parse_args()


def main() -> int:
    _configure_stdio()
    args = parse_args()
    settings = Settings.from_env()
    engine = create_engine_for_settings(settings)
    with Session(engine) as session:
        layout = _load_layout(args.site_slug)
        _validate_scope(session, organization_id=args.organization_id, site_id=args.site_id, layout_site_id=layout.site_id)
        binding = session.exec(select(LineGroupBinding).where(LineGroupBinding.group_id == args.group_id)).first()
        created = binding is None
        if binding is None:
            binding = LineGroupBinding(
                group_id=args.group_id,
                source_type=args.source_type,
                organization_id=args.organization_id,
                site_id=args.site_id,
                site_slug=args.site_slug,
                is_active=True,
            )
        else:
            binding.source_type = args.source_type
            binding.organization_id = args.organization_id
            binding.site_id = args.site_id
            binding.site_slug = args.site_slug
            binding.is_active = True
        session.add(binding)
        session.commit()
        session.refresh(binding)
        print(
            json.dumps(
                {
                    "created": created,
                    "bindingId": binding.id,
                    "groupId": binding.group_id,
                    "sourceType": binding.source_type,
                    "organizationId": binding.organization_id,
                    "siteId": binding.site_id,
                    "siteSlug": binding.site_slug,
                    "isActive": binding.is_active,
                    "createdAt": binding.created_at.isoformat(),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    return 0


def _load_layout(site_slug: str):
    try:
        return load_floorplan_layout(site_slug)
    except FloorplanLayoutError as exc:
        raise SystemExit(str(exc)) from exc


def _validate_scope(session: Session, *, organization_id: str, site_id: str, layout_site_id: str) -> None:
    organization = session.get(Organization, organization_id)
    if organization is None:
        raise SystemExit("organization_not_found")
    site = session.get(Site, site_id)
    if site is None:
        raise SystemExit("site_not_found")
    if site.organization_id != organization_id:
        raise SystemExit("site_organization_mismatch")
    if site.id != layout_site_id:
        raise SystemExit("site_layout_mismatch")


def _configure_stdio() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
