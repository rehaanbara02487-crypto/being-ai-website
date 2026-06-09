#!/usr/bin/env python3
"""Bootstrap BeingAI database via Alembic migrations."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def init_db() -> None:
    (ROOT / "data").mkdir(parents=True, exist_ok=True)
    (ROOT / "data" / "workspaces").mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND,
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(result.returncode)
    print("Database migrated to head.")


if __name__ == "__main__":
    init_db()
