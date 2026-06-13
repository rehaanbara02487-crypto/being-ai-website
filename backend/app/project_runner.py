"""Detect and run projects by stack (Python, npm, etc.)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from fastapi import HTTPException


def detect_run_profile(project_dir: Path) -> dict:
    package_json = project_dir / "package.json"
    if package_json.is_file():
        try:
            data = json.loads(package_json.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid package.json") from exc

        scripts = data.get("scripts") or {}
        script_name = "dev" if "dev" in scripts else "start" if "start" in scripts else None
        if not script_name:
            raise HTTPException(
                status_code=400,
                detail="package.json must define a dev or start script",
            )

        return {
            "type": "npm",
            "install_command": "npm install",
            "start_command": f"npm run {script_name}",
            "script": script_name,
        }

    for filename in ("main.py", "app.py"):
        entrypoint = project_dir / filename
        if entrypoint.is_file():
            return {
                "type": "python",
                "entrypoint": filename,
            }

    raise HTTPException(
        status_code=400,
        detail="Project must contain package.json or main.py/app.py",
    )


def run_install_if_needed(project_dir: Path, profile: dict, log_callback) -> None:
    if profile["type"] != "npm":
        return

    if (project_dir / "node_modules").exists():
        return

    log_callback("system", "Installing dependencies (npm install)...\n")
    result = subprocess.run(
        ["npm", "install"],
        cwd=str(project_dir),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    if result.stdout:
        log_callback("stdout", result.stdout)
    if result.stderr:
        log_callback("stderr", result.stderr)
    if result.returncode != 0:
        raise HTTPException(
            status_code=400,
            detail=result.stderr.strip() or "npm install failed",
        )


def start_project_process(project_dir: Path, profile: dict) -> subprocess.Popen:
    if profile["type"] == "python":
        return subprocess.Popen(
            [sys.executable, "-u", profile["entrypoint"]],
            cwd=str(project_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="ignore",
            bufsize=1,
        )

    if profile["type"] == "npm":
        command = profile["start_command"].split()
        return subprocess.Popen(
            command,
            cwd=str(project_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="ignore",
            bufsize=1,
            shell=False,
        )

    raise HTTPException(status_code=400, detail=f"Unsupported run profile: {profile['type']}")
