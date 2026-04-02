from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlmodel import Session, select


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.config import Settings
from app.db import create_engine_for_settings
from app.models import OperatorAccount
from app.security import hash_password


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create or update a planner-server operator account."
    )
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
    settings = Settings.from_env()
    engine = create_engine_for_settings(settings)

    with Session(engine) as session:
        statement = select(OperatorAccount).where(OperatorAccount.username == args.username)
        operator = session.exec(statement).first()

        if operator is None:
            operator = OperatorAccount(
                username=args.username,
                display_name=args.display_name,
                password_hash=hash_password(args.password),
                is_active=not args.deactivate,
            )
            session.add(operator)
            session.commit()
            print(f"created operator username={operator.username} active={operator.is_active}")
            return 0

        operator.display_name = args.display_name
        if args.update_password:
            operator.password_hash = hash_password(args.password)
        if args.activate:
            operator.is_active = True
        if args.deactivate:
            operator.is_active = False
        session.add(operator)
        session.commit()
        print(
            "updated operator "
            f"username={operator.username} active={operator.is_active} "
            f"password_updated={args.update_password}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
