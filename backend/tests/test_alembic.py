"""Alembic migration tests."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_alembic_upgrade_head(tmp_path, monkeypatch):
    db_path = tmp_path / "migrated.db"
    monkeypatch.setenv("BEINGAI_DB_PATH", str(db_path))

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr

    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    inspector = inspect(engine)

    expected_tables = {
        "projects",
        "sessions",
        "messages",
        "runs",
        "run_events",
        "plans",
        "plan_steps",
        "file_changes",
        "commands_executed",
        "errors",
        "git_operations",
        "memory_entries",
        "architecture_decisions",
        "settings",
        "alembic_version",
    }
    assert expected_tables.issubset(set(inspector.get_table_names()))

    with engine.connect() as conn:
        rows = conn.execute(text("SELECT key, value FROM settings ORDER BY key")).fetchall()
    assert len(rows) == 5
    assert rows[0][0] == "auto_push_github"

    engine.dispose()
