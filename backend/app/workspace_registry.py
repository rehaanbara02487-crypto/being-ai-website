"""Registry for user-opened external workspace folders."""

from __future__ import annotations

import hashlib
import json
import re
import time
import uuid
from pathlib import Path

from fastapi import HTTPException

from app.config import REPO_ROOT, get_workspace_root

REGISTRY_PATH = REPO_ROOT / "data" / "workspace_registry.json"

_WINDOWS_BLOCKED = (
    Path("C:/Windows"),
    Path("C:/Program Files"),
    Path("C:/Program Files (x86)"),
)


def _load_registry() -> dict:
    if not REGISTRY_PATH.exists():
        return {"workspaces": []}

    try:
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"workspaces": []}


def _save_registry(data: dict) -> None:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _normalize_path(path: str | Path) -> Path:
    return Path(path).expanduser().resolve()


def validate_external_path(path: str | Path) -> Path:
    resolved = _normalize_path(path)

    if not resolved.exists() or not resolved.is_dir():
        raise HTTPException(status_code=400, detail="Path must be an existing directory")

    for blocked in _WINDOWS_BLOCKED:
        try:
            resolved.relative_to(blocked.resolve())
            raise HTTPException(status_code=403, detail="Path is not allowed")
        except ValueError:
            continue

    probe = resolved / ".beingai_write_probe"
    try:
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=403, detail="Path is not writable") from exc

    return resolved


def _slug_from_path(path: Path) -> str:
    base = re.sub(r"[^a-z0-9-]+", "-", path.name.lower()).strip("-") or "workspace"
    suffix = hashlib.sha1(str(path).lower().encode("utf-8")).hexdigest()[:6]
    return f"{base}-{suffix}"


def get_external_project_dir(project_name: str) -> Path | None:
    data = _load_registry()
    for entry in data.get("workspaces", []):
        if entry.get("slug") == project_name and entry.get("kind") == "external":
            path = Path(entry["path"])
            if path.exists() and path.is_dir():
                return path.resolve()
    return None


def get_workspace_entry(project_name: str) -> dict | None:
    data = _load_registry()
    for entry in data.get("workspaces", []):
        if entry.get("slug") == project_name:
            return dict(entry)
    return None


def is_external_project(project_name: str) -> bool:
    entry = get_workspace_entry(project_name)
    return bool(entry and entry.get("kind") == "external")


def list_managed_project_names() -> list[str]:
    workspace = get_workspace_root()
    workspace.mkdir(parents=True, exist_ok=True)
    return sorted(item.name for item in workspace.iterdir() if item.is_dir())


def list_all_workspaces() -> list[dict]:
    managed_names = list_managed_project_names()
    managed = [
        {
            "id": f"managed:{name}",
            "slug": name,
            "name": name,
            "path": str((get_workspace_root() / name).resolve()),
            "kind": "managed",
            "last_opened_at": None,
        }
        for name in managed_names
    ]

    data = _load_registry()
    external = []
    for entry in data.get("workspaces", []):
        if entry.get("kind") != "external":
            continue
        path = Path(entry["path"])
        if not path.exists() or not path.is_dir():
            continue
        external.append(
            {
                "id": entry["id"],
                "slug": entry["slug"],
                "name": entry.get("name") or entry["slug"],
                "path": str(path.resolve()),
                "kind": "external",
                "last_opened_at": entry.get("last_opened_at"),
            }
        )

    return managed + external


def list_project_slugs() -> list[str]:
    managed = list_managed_project_names()
    data = _load_registry()
    external = [
        entry["slug"]
        for entry in data.get("workspaces", [])
        if entry.get("kind") == "external"
        and Path(entry["path"]).exists()
        and Path(entry["path"]).is_dir()
    ]
    return sorted(set(managed + external))


def register_external_workspace(path: str | Path, *, name: str | None = None) -> dict:
    resolved = validate_external_path(path)
    data = _load_registry()
    workspaces = data.setdefault("workspaces", [])

    for entry in workspaces:
        if entry.get("kind") == "external" and _normalize_path(entry["path"]) == resolved:
            entry["last_opened_at"] = time.time()
            if name:
                entry["name"] = name
            _save_registry(data)
            return workspace_payload(entry)

    slug = _slug_from_path(resolved)
    existing_slugs = {entry.get("slug") for entry in workspaces}
    while slug in existing_slugs or slug in list_managed_project_names():
        slug = f"{slug}-{hashlib.sha1(str(time.time()).encode()).hexdigest()[:4]}"

    entry = {
        "id": str(uuid.uuid4()),
        "slug": slug,
        "name": name or resolved.name or slug,
        "path": str(resolved),
        "kind": "external",
        "last_opened_at": time.time(),
    }
    workspaces.append(entry)
    _save_registry(data)
    return workspace_payload(entry)


def register_project_at_path(parent_dir: Path, project_name: str) -> dict:
    from app.workspace_paths import ensure_project_name_safe

    ensure_project_name_safe(project_name)
    project_dir = (parent_dir / project_name).resolve()
    project_dir.mkdir(parents=True, exist_ok=True)

    workspace_root = get_workspace_root().resolve()
    try:
        project_dir.relative_to(workspace_root)
        return {
            "id": f"managed:{project_name}",
            "slug": project_name,
            "name": project_name,
            "path": str(project_dir),
            "kind": "managed",
            "last_opened_at": time.time(),
        }
    except ValueError:
        return register_external_workspace(project_dir, name=project_name)


def touch_workspace(slug: str) -> None:
    data = _load_registry()
    for entry in data.get("workspaces", []):
        if entry.get("slug") == slug:
            entry["last_opened_at"] = time.time()
            _save_registry(data)
            return


def workspace_payload(entry: dict) -> dict:
    path = Path(entry["path"]).resolve()
    return {
        "id": entry["id"],
        "slug": entry["slug"],
        "name": entry.get("name") or entry["slug"],
        "path": str(path),
        "kind": entry.get("kind", "external"),
        "last_opened_at": entry.get("last_opened_at"),
    }


def resolve_greenfield_target(
    target: str,
    *,
    target_path: str | None = None,
    current_project_slug: str | None = None,
    project_name: str,
) -> tuple[Path, dict]:
    from app.workspace_paths import ensure_project_name_safe, resolve_project_dir

    ensure_project_name_safe(project_name)

    if current_project_slug and is_external_project(current_project_slug):
        if target in {"default", "current", "in_place"}:
            target = "in_place"

    if target == "in_place":
        if not current_project_slug:
            raise HTTPException(
                status_code=400,
                detail="Open a workspace folder before generating in place",
            )

        project_dir = resolve_project_dir(current_project_slug, must_exist=True)
        entry = get_workspace_entry(current_project_slug)
        if entry and entry.get("kind") == "external":
            touch_workspace(current_project_slug)
            return project_dir, workspace_payload(entry)

        return project_dir, {
            "id": f"managed:{current_project_slug}",
            "slug": current_project_slug,
            "name": current_project_slug,
            "path": str(project_dir),
            "kind": "managed",
            "last_opened_at": time.time(),
        }

    if target == "custom":
        if not target_path:
            raise HTTPException(status_code=400, detail="target_path is required for custom target")
        project_dir = validate_external_path(target_path)
        meta = register_external_workspace(project_dir)
        touch_workspace(meta["slug"])
        return project_dir, meta

    if target == "current":
        if not current_project_slug:
            raise HTTPException(status_code=400, detail="Open a workspace before using current target")
        parent = resolve_project_dir(current_project_slug, must_exist=True)
        project_dir = (parent / project_name).resolve()
        meta = register_project_at_path(parent, project_name)
        return project_dir, meta

    workspace_root = get_workspace_root()
    workspace_root.mkdir(parents=True, exist_ok=True)
    project_dir = (workspace_root / project_name).resolve()
    project_dir.mkdir(parents=True, exist_ok=True)
    return project_dir, {
        "id": f"managed:{project_name}",
        "slug": project_name,
        "name": project_name,
        "path": str(project_dir),
        "kind": "managed",
        "last_opened_at": time.time(),
    }


def pick_folder_dialog() -> str | None:
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError as exc:
        raise HTTPException(status_code=501, detail="Folder picker is unavailable on this system") from exc

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    selected = filedialog.askdirectory(title="Select workspace folder")
    root.destroy()
    return selected or None
