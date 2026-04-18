from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_alembic_upgrade_creates_phase1_demo_tables(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "phase1-demo.db"
    database_url = f"sqlite:///{db_path}"
    monkeypatch.setenv("BUILDING_ROUTE_DATABASE_URL", database_url)

    planner_server_root = Path(__file__).resolve().parents[1]
    config = Config(str(planner_server_root / "alembic.ini"))
    config.set_main_option("script_location", str(planner_server_root / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)

    command.upgrade(config, "head")

    inspector = inspect(create_engine(database_url))
    table_names = set(inspector.get_table_names())

    assert "inspectionroute" in table_names
    assert "inspectiontemplate" in table_names
    assert "inspectionschedule" in table_names
    assert "dispatchrecord" in table_names
    assert "inspectioneventrecord" in table_names
    assert "inspectionreport" in table_names

    site_columns = {column["name"] for column in inspector.get_columns("site")}
    assert "map_config_json" in site_columns
    assert "zones_json" in site_columns
    assert "launch_points_json" in site_columns
    assert "viewpoints_json" in site_columns

    route_columns = {column["name"] for column in inspector.get_columns("inspectionroute")}
    assert "launch_point_json" in route_columns

    schedule_columns = {column["name"] for column in inspector.get_columns("inspectionschedule")}
    assert "next_run_at" in schedule_columns
    assert "last_run_at" in schedule_columns
    assert "last_dispatched_at" in schedule_columns
    assert "pause_reason" in schedule_columns
    assert "last_outcome" in schedule_columns

    dispatch_columns = {column["name"] for column in inspector.get_columns("dispatchrecord")}
    assert "accepted_at" in dispatch_columns
    assert "closed_at" in dispatch_columns
