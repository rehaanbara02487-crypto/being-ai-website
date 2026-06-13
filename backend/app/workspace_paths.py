"""Workspace path sandboxing for all file operations."""

from __future__ import annotations

import os
import re
from pathlib import Path

from fastapi import HTTPException

from app.config import get_workspace_root


class PathEscapeError(Exception):
    """Raised when a path escapes the workspace sandbox."""


_INVALID_SEGMENT = re.compile(r"[\0<>:\"|?*]")


def _normalize_slashes(value: str) -> str:
    return value.replace("\\", "/")


def _validate_name_segment(name: str, label: str) -> None:
    if not name or not str(name).strip():
        raise HTTPException(status_code=400, detail=f"{label} is required")

    if "\0" in name:
        raise HTTPException(status_code=403, detail=f"{label} contains invalid characters")

    if Path(name).is_absolute():
        raise HTTPException(status_code=403, detail=f"{label} must be relative")

    normalized = _normalize_slashes(name)
    parts = Path(normalized).parts

    if ".." in parts:
        raise HTTPException(status_code=403, detail=f"{label} escapes workspace")

    if any(_INVALID_SEGMENT.search(part) for part in parts):
        raise HTTPException(status_code=403, detail=f"{label} contains invalid characters")


def _validate_project_name_http(project_name: str) -> None:
    _validate_name_segment(project_name, "Project name")

    if project_name in {".", ".."}:
        raise HTTPException(status_code=403, detail="Invalid project name")

    if "/" in _normalize_slashes(project_name):
        raise HTTPException(status_code=403, detail="Project name must be a single path segment")


def _validate_name_segment_raise(name: str, label: str) -> None:
    if not name or not str(name).strip():
        raise PathEscapeError(f"{label} is required")

    if "\0" in name:
        raise PathEscapeError(f"{label} contains invalid characters")

    if Path(name).is_absolute():
        raise PathEscapeError(f"{label} must be relative")

    normalized = _normalize_slashes(name)
    parts = Path(normalized).parts

    if ".." in parts:
        raise PathEscapeError(f"{label} escapes workspace")

    if any(_INVALID_SEGMENT.search(part) for part in parts):
        raise PathEscapeError(f"{label} contains invalid characters")


def _ensure_within_root(resolved_path: Path, root: Path, label: str) -> None:
    root = root.resolve()
    resolved = resolved_path.resolve()

    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise PathEscapeError(f"{label} escapes workspace") from exc


def _raise_http_from_escape(exc: PathEscapeError) -> None:
    raise HTTPException(status_code=403, detail=str(exc)) from exc


def resolve_project_dir(project_name: str, *, must_exist: bool = True) -> Path:
    """Resolve a project directory inside the workspace root."""
    _validate_project_name_http(project_name)

    workspace_root = get_workspace_root().resolve()
    project_path = workspace_root / project_name
    project_dir = project_path.resolve()

    try:
        _ensure_within_root(project_dir, workspace_root, "Project")
    except PathEscapeError as exc:
        _raise_http_from_escape(exc)

    if must_exist and (not project_dir.exists() or not project_dir.is_dir()):
        raise HTTPException(status_code=404, detail="Project not found")

    return project_dir


def resolve_path_in_project_dir(project_dir: Path, relative_path: str) -> Path:
    """Resolve a relative path inside an already-validated project directory."""
    _validate_name_segment_raise(relative_path, "Path")

    requested = Path(relative_path)
    workspace_root = get_workspace_root().resolve()
    project_root = project_dir.resolve()

    _ensure_within_root(project_root, workspace_root, "Project")

    target_path = (project_root / requested).resolve()

    _ensure_within_root(target_path, workspace_root, "Path")
    try:
        target_path.relative_to(project_root)
    except ValueError as exc:
        raise PathEscapeError("Path escapes project workspace") from exc

    return target_path


def resolve_workspace_path(
    project_name: str,
    relative_path: str,
    *,
    must_exist: bool = False,
) -> Path:
    """
    Resolve a path safely within a project workspace.

    Raises HTTPException(403) on escape attempts.
    Raises HTTPException(404) when must_exist=True and path is missing.
    """
    _validate_project_name_http(project_name)
    _validate_name_segment(relative_path, "Path")

    workspace_root = get_workspace_root().resolve()
    project_dir = (workspace_root / project_name).resolve()

    try:
        _ensure_within_root(project_dir, workspace_root, "Project")
    except PathEscapeError as exc:
        _raise_http_from_escape(exc)

    if not project_dir.exists() or not project_dir.is_dir():
        raise HTTPException(status_code=404, detail="Project not found")

    target_path = resolve_path_in_project_dir(project_dir, relative_path)

    if must_exist and not target_path.exists():
        raise HTTPException(status_code=404, detail="Path not found")

    return target_path


def resolve_workspace_target(project_name: str, relative_path: str) -> Path:
    """
    Resolve a write target inside a project without requiring the project to exist.

    Raises HTTPException(403) on escape attempts.
    """
    _validate_project_name_http(project_name)
    _validate_name_segment(relative_path, "Path")

    workspace_root = get_workspace_root().resolve()
    project_dir = (workspace_root / project_name).resolve()

    try:
        _ensure_within_root(project_dir, workspace_root, "Project")
        return resolve_path_in_project_dir(project_dir, relative_path)
    except PathEscapeError as exc:
        _raise_http_from_escape(exc)


def ensure_project_name_safe(project_name: str) -> None:
    """Validate a project name without requiring the directory to exist."""
    _validate_project_name_http(project_name)

    workspace_root = get_workspace_root().resolve()
    project_dir = (workspace_root / project_name).resolve()

    try:
        _ensure_within_root(project_dir, workspace_root, "Project")
    except PathEscapeError as exc:
        _raise_http_from_escape(exc)
