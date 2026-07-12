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
    assert "camera_devices" in table_names
    assert "camera_frames" in table_names
    assert "camera_gauge_readings" in table_names
    assert "camera_ocr_observations" in table_names
    assert "camera_person_observations" in table_names
    assert "equipment_watch_zones" in table_names
    assert "equipment_state_observations" in table_names
    assert "line_group_bindings" in table_names
    assert "line_user_bindings" in table_names
    assert "line_account_link_attempts" in table_names

    webhook_column_defs = {
        column["name"]: column for column in inspector.get_columns("line_webhook_events")
    }
    assert webhook_column_defs["encrypted_reply_messages"]["nullable"] is True

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

    camera_columns = {column["name"] for column in inspector.get_columns("camera_devices")}
    assert "device_token_hash" in camera_columns
    assert "sampling_interval_seconds" in camera_columns

    frame_columns = {column["name"] for column in inspector.get_columns("camera_frames")}
    assert "storage_key" in frame_columns
    assert "analysis_status" in frame_columns

    gauge_columns = {column["name"] for column in inspector.get_columns("camera_gauge_readings")}
    assert "gauge_id" in gauge_columns
    assert "value" in gauge_columns
    assert "confidence" in gauge_columns

    ocr_columns = {column["name"] for column in inspector.get_columns("camera_ocr_observations")}
    assert "mode" in ocr_columns
    assert "raw_ocr_lines_json" in ocr_columns
    assert "structured_fields_json" in ocr_columns
    assert "summary_status" in ocr_columns

    person_columns = {column["name"] for column in inspector.get_columns("camera_person_observations")}
    assert "person_count" in person_columns
    assert "detections_json" in person_columns
    assert "calibration_id" in person_columns

    binding_columns = {column["name"] for column in inspector.get_columns("line_group_bindings")}
    assert "group_id" in binding_columns
    assert "source_type" in binding_columns
    assert "organization_id" in binding_columns
    assert "site_id" in binding_columns
    assert "site_slug" in binding_columns
    assert "is_active" in binding_columns

    user_binding_columns = {column["name"] for column in inspector.get_columns("line_user_bindings")}
    assert {
        "destination_id",
        "line_user_id",
        "user_id",
        "site_id",
        "is_active",
        "verified_at",
        "created_at",
        "updated_at",
    }.issubset(user_binding_columns)
    user_binding_uniques = {
        tuple(constraint["column_names"])
        for constraint in inspector.get_unique_constraints("line_user_bindings")
    }
    assert ("destination_id", "line_user_id") in user_binding_uniques
    assert ("destination_id", "user_id") in user_binding_uniques

    link_attempt_column_defs = {
        column["name"]: column for column in inspector.get_columns("line_account_link_attempts")
    }
    link_attempt_columns = set(link_attempt_column_defs)
    assert {
        "flow_token_hash",
        "expected_line_user_id",
        "destination_id",
        "is_current",
        "encrypted_link_token",
        "user_id",
        "site_id",
        "nonce_hash",
        "redirect_token_hash",
        "status",
        "expires_at",
        "consumed_at",
        "redirected_at",
        "created_at",
        "updated_at",
    }.issubset(link_attempt_columns)
    assert link_attempt_column_defs["encrypted_link_token"]["nullable"] is True
    link_attempt_uniques = {
        tuple(constraint["column_names"])
        for constraint in inspector.get_unique_constraints("line_account_link_attempts")
    }
    assert ("destination_id", "expected_line_user_id", "is_current") in link_attempt_uniques
    link_attempt_checks = {
        constraint["name"] for constraint in inspector.get_check_constraints("line_account_link_attempts")
    }
    assert "ck_line_link_attempts_current_status" in link_attempt_checks
