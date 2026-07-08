from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from app.config import Settings
from app.db import create_engine_for_settings


def _alembic_config() -> Config:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
    return config


def _script_heads(config: Config) -> set[str]:
    return set(ScriptDirectory.from_config(config).get_heads())


def _database_revision(settings: Settings) -> str | None:
    engine = create_engine_for_settings(settings)
    with engine.connect() as connection:
        value = connection.execute(text("select version_num from alembic_version")).scalar()
    return str(value) if value is not None else None


def _handle_failed_upgrade(config: Config, exc: BaseException) -> int:
    print(f"PREDEPLOY_ALEMBIC_ERROR {exc.__class__.__name__}: {exc}", file=sys.stderr)
    try:
        current = _database_revision(Settings.from_env())
        heads = _script_heads(config)
    except Exception as check_exc:
        print(
            f"PREDEPLOY_HEAD_CHECK_ERROR {check_exc.__class__.__name__}: {check_exc}",
            file=sys.stderr,
        )
        return 1

    print(f"PREDEPLOY_ALEMBIC_CURRENT {current}", file=sys.stderr)
    print(f"PREDEPLOY_ALEMBIC_HEADS {','.join(sorted(heads))}", file=sys.stderr)
    if current in heads:
        print("PREDEPLOY_ALEMBIC_ALREADY_AT_HEAD continuing deploy", file=sys.stderr)
        return 0
    return 1


def main() -> int:
    config = _alembic_config()
    try:
        command.upgrade(config, "head")
    except KeyboardInterrupt:
        raise
    except SystemExit as exc:
        return _handle_failed_upgrade(config, exc)
    except Exception as exc:
        return _handle_failed_upgrade(config, exc)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
