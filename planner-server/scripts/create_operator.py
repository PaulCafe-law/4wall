from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlmodel import Session


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.config import Settings
from app.db import create_engine_for_settings, init_db
from app.operator_admin import upsert_operator


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or update a planner-server operator account.")
    parser.add_argument("--username", required=True, help="Operator username")
    parser.add_argument("--display-name", required=True, help="Operator display name")
    parser.add_argument("--password", required=True, help="Plaintext operator password")
    parser.add_argument(
        "--update-password",
        action="store_true",
        help="Update the password when the operator already exists.",
    )
    parser.add_argument(
        "--deactivate",
        action="store_true",
        help="Mark the operator inactive after creation/update.",
    )
    parser.add_argument(
        "--activate",
        action="store_true",
        help="Force the operator active after creation/update.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.activate and args.deactivate:
        raise SystemExit("--activate and --deactivate cannot be used together")

    active = None
    if args.activate:
        active = True
    elif args.deactivate:
        active = False

    settings = Settings.from_env()
    engine = create_engine_for_settings(settings)
    init_db(engine, settings)

    with Session(engine) as session:
        result = upsert_operator(
            session,
            username=args.username,
            display_name=args.display_name,
            password=args.password,
            update_password=args.update_password,
            active=active,
        )
        session.commit()
        session.refresh(result.operator)
        username = result.operator.username
        is_active = result.operator.is_active
        created = result.created
        password_updated = result.password_updated

    verb = "created" if created else "updated"
    print(
        f"{verb} operator "
        f"username={username} "
        f"active={is_active} "
        f"password_updated={password_updated}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
