"""SQLAlchemy engine, session factory, and FastAPI-compatible session dependency."""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from typing import TYPE_CHECKING

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings
from app.db.base import Base

if TYPE_CHECKING:
    pass

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def _set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def create_engine_from_settings(settings: Settings | None = None) -> Engine:
    settings = settings or get_settings()
    settings.beingai_db_path.parent.mkdir(parents=True, exist_ok=True)

    engine = create_engine(
        settings.database_url,
        echo=settings.sqlalchemy_echo,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
    )
    event.listen(engine, "connect", _set_sqlite_pragmas)
    return engine


def init_database(settings: Settings | None = None) -> sessionmaker[Session]:
    """Initialize global engine and session factory. Idempotent."""
    global _engine, _SessionLocal

    if _engine is not None and _SessionLocal is not None:
        return _SessionLocal

    _engine = create_engine_from_settings(settings)
    _SessionLocal = sessionmaker(
        bind=_engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )
    return _SessionLocal


def get_engine() -> Engine:
    if _engine is None:
        init_database()
    assert _engine is not None
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    if _SessionLocal is None:
        init_database()
    assert _SessionLocal is not None
    return _SessionLocal


def dispose_database() -> None:
    """Dispose engine and reset module-level state (for tests/shutdown)."""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


def get_db() -> Generator[Session, None, None]:
    """Yield a database session; commit on success, rollback on error."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Context manager for scripts and background tasks."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def check_database_connection() -> bool:
    """Return True if the database accepts a simple query."""
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def create_all_tables(engine: Engine | None = None) -> None:
    """Create all tables from metadata (used in tests; prefer Alembic in production)."""
    from app.db import models  # noqa: F401 — register all mappers

    target = engine or get_engine()
    Base.metadata.create_all(bind=target)
