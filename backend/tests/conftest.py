"""Pytest fixtures for database layer tests."""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings
from app.db.base import Base
from app.db import models  # noqa: F401
from app.db.database import dispose_database, init_database


@pytest.fixture
def test_settings(tmp_path: Path) -> Settings:
    db_path = tmp_path / "test.db"
    workspace = tmp_path / "workspaces"
    workspace.mkdir()
    return Settings(
        beingai_db_path=db_path,
        beingai_workspace_root=workspace,
        sqlalchemy_echo=False,
    )


@pytest.fixture
def db_engine():
    """Isolated in-memory database for ORM tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(db_engine) -> Generator[Session, None, None]:
    session_factory = sessionmaker(bind=db_engine, autocommit=False, autoflush=False)
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@pytest.fixture(autouse=True)
def reset_global_database():
    dispose_database()
    get_settings.cache_clear()
    yield
    dispose_database()
    get_settings.cache_clear()

