from __future__ import annotations

import argparse
from dataclasses import replace
from datetime import datetime, timezone
import json
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.config import Settings
from app.line_floorplan.layout import load_floorplan_layout
from app.line_floorplan.messages import (
    build_floorplan_imagemap_message,
    build_gauges_message,
    build_machine_detail_message,
    build_machine_list_message,
    build_text_message,
)
from app.line_floorplan.service import GaugeReadingView, MachineDetailView
from app.line_floorplan.tokens import create_floorplan_render_token
from app.models import Site


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Dry-run LINE floorplan reply payloads.")
    parser.add_argument("--site-slug", default="jingcheng")
    parser.add_argument("--group-id", default="Cdryrun")
    parser.add_argument("--site-name", default="靚程工廠")
    parser.add_argument("--public-base-url", default=None, help="Fallback if LINE_PUBLIC_BASE_URL is not set.")
    return parser.parse_args()


def main() -> int:
    _configure_stdio()
    args = parse_args()
    settings = Settings.from_env()
    if not settings.line_public_base_url:
        settings = replace(settings, line_public_base_url=args.public_base_url or "https://api.example.test")
    layout = load_floorplan_layout(args.site_slug)
    token = create_floorplan_render_token(settings, site_slug=layout.site_slug, group_id=args.group_id)
    machine = layout.machine("m-hc600")
    if machine is None:
        raise SystemExit("machine_not_found")
    gauges = (
        GaugeReadingView(
            gauge_id="press_am_meter",
            label="PRESS",
            value=121.5,
            unit="bar",
            confidence=0.94,
            status="ok",
            captured_at=datetime.now(timezone.utc),
            minutes_ago=3,
            trend="↗",
            stale=False,
        ),
        GaugeReadingView(
            gauge_id="flow_am_meter",
            label="FLOW",
            value=42.0,
            unit="L/min",
            confidence=0.91,
            status="ok",
            captured_at=datetime.now(timezone.utc),
            minutes_ago=3,
            trend="→",
            stale=False,
        ),
    )
    site = Site(
        id=layout.site_id,
        organization_id="dry-run-org",
        name=args.site_name,
        address="dry-run",
        lat=0,
        lng=0,
    )
    machine_detail = MachineDetailView(
        machine=machine,
        site=site,
        gauges=gauges,
        today_incident_count=1,
        thumbnail_url=None,
        thumbnail_ttl_seconds=600,
    )
    output = {
        "renderToken": token,
        "webhookReplies": {
            "floorplan": build_floorplan_imagemap_message(
                settings,
                layout=layout,
                group_id=args.group_id,
                render_token=token,
            ),
            "machines": build_machine_list_message(layout),
            "gauges": build_gauges_message({machine.id: gauges}, layout),
            "daily_incidents": build_text_message("今日異常：dry-run 1 件待確認"),
        },
        "machineDetail": build_machine_detail_message(machine_detail),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


def _configure_stdio() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
