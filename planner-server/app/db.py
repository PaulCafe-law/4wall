from __future__ import annotations

from collections.abc import Callable

from sqlmodel import Session, SQLModel, create_engine

from app.config import Settings


def create_engine_for_settings(settings: Settings):
    connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
    return create_engine(settings.database_url, echo=False, connect_args=connect_args)


def create_session_factory(engine) -> Callable[[], Session]:
    def factory() -> Session:
        return Session(engine)

    return factory


def init_db(engine, settings: Settings) -> None:
    if settings.environment.lower() in {"development", "dev", "test"}:
        SQLModel.metadata.create_all(engine)
