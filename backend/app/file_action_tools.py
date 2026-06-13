"""Validated file action tools for AI-assisted workspace edits."""

from dataclasses import dataclass
import difflib
from pathlib import Path


SUPPORTED_TOOLS = {
    "create_file",
    "edit_file",
    "delete_file",
    "rename_file",
    "create_folder",
}


class FileActionError(ValueError):
    """Raised when a requested file action is invalid."""


@dataclass
class NormalizedAction:
    tool: str
    path: str
    content: str | None = None
    new_path: str | None = None


def resolve_workspace_path(project_dir: Path, relative_path: str) -> Path:
    if not relative_path or not relative_path.strip():
        raise FileActionError("Path is required")

    requested_path = Path(relative_path)
    if requested_path.is_absolute():
        raise FileActionError("Absolute paths are not allowed")

    target_path = (project_dir / requested_path).resolve()

    try:
        target_path.relative_to(project_dir)
    except ValueError as exc:
        raise FileActionError("Path escapes project workspace") from exc

    return target_path


def normalize_action(action: dict) -> NormalizedAction:
    tool = action.get("tool") or action.get("name")
    args = action.get("args") or action.get("arguments") or action

    if tool not in SUPPORTED_TOOLS:
        raise FileActionError(f"Unsupported tool: {tool}")

    return NormalizedAction(
        tool=tool,
        path=args.get("path") or args.get("filename") or "",
        content=args.get("content"),
        new_path=args.get("new_path") or args.get("newPath"),
    )


def unified_diff(old: str, new: str, fromfile: str, tofile: str) -> str:
    return "".join(
        difflib.unified_diff(
            old.splitlines(keepends=True),
            new.splitlines(keepends=True),
            fromfile=fromfile,
            tofile=tofile,
        )
    )


def preview_action(project_dir: Path, action: dict, index: int) -> dict:
    normalized = normalize_action(action)
    target_path = resolve_workspace_path(project_dir, normalized.path)
    relative_path = target_path.relative_to(project_dir).as_posix()

    result = {
        "id": f"action-{index}",
        "tool": normalized.tool,
        "path": relative_path,
        "new_path": normalized.new_path,
        "summary": "",
        "diff": "",
        "valid": True,
        "error": None,
        "args": {
            "path": relative_path,
        },
    }

    if normalized.tool in {"create_file", "edit_file"}:
        result["args"]["content"] = normalized.content or ""

    if normalized.new_path:
        new_target_path = resolve_workspace_path(project_dir, normalized.new_path)
        result["new_path"] = new_target_path.relative_to(project_dir).as_posix()
        result["args"]["new_path"] = result["new_path"]

    try:
        if normalized.tool == "create_file":
            if target_path.exists():
                raise FileActionError("File already exists")
            content = normalized.content or ""
            result["summary"] = f"Create file {relative_path}"
            result["diff"] = unified_diff("", content, "/dev/null", relative_path)

        elif normalized.tool == "edit_file":
            if not target_path.is_file():
                raise FileActionError("File does not exist")
            old_content = target_path.read_text(encoding="utf-8")
            new_content = normalized.content or ""
            result["summary"] = f"Edit file {relative_path}"
            result["diff"] = unified_diff(old_content, new_content, relative_path, relative_path)

        elif normalized.tool == "delete_file":
            if not target_path.is_file():
                raise FileActionError("File does not exist")
            old_content = target_path.read_text(encoding="utf-8")
            result["summary"] = f"Delete file {relative_path}"
            result["diff"] = unified_diff(old_content, "", relative_path, "/dev/null")

        elif normalized.tool == "rename_file":
            if not target_path.is_file():
                raise FileActionError("File does not exist")
            if not result["new_path"]:
                raise FileActionError("New path is required")
            new_target_path = resolve_workspace_path(project_dir, result["new_path"])
            if new_target_path.exists():
                raise FileActionError("Destination already exists")
            result["summary"] = f"Rename file {relative_path} to {result['new_path']}"
            result["diff"] = f"rename from {relative_path}\nrename to {result['new_path']}\n"

        elif normalized.tool == "create_folder":
            if target_path.exists():
                raise FileActionError("Folder already exists")
            result["summary"] = f"Create folder {relative_path}"
            result["diff"] = f"create folder {relative_path}/\n"

    except (OSError, UnicodeDecodeError) as exc:
        raise FileActionError(str(exc)) from exc

    return result


def preview_actions(project_dir: Path, actions: list[dict]) -> list[dict]:
    previews = []

    for index, action in enumerate(actions, start=1):
        try:
            previews.append(preview_action(project_dir, action, index))
        except FileActionError as exc:
            previews.append({
                "id": f"action-{index}",
                "tool": action.get("tool") or action.get("name") or "unknown",
                "path": action.get("path") or (action.get("args") or {}).get("path") or "",
                "new_path": action.get("new_path") or (action.get("args") or {}).get("new_path"),
                "summary": "Invalid file action",
                "diff": "",
                "valid": False,
                "error": str(exc),
                "args": action.get("args") or action,
            })

    return previews


def apply_action(project_dir: Path, action: dict) -> dict:
    preview = preview_action(project_dir, action, 1)
    target_path = resolve_workspace_path(project_dir, preview["path"])

    if preview["tool"] == "create_file":
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(preview["args"].get("content", ""), encoding="utf-8")

    elif preview["tool"] == "edit_file":
        target_path.write_text(preview["args"].get("content", ""), encoding="utf-8")

    elif preview["tool"] == "delete_file":
        target_path.unlink()

    elif preview["tool"] == "rename_file":
        new_target_path = resolve_workspace_path(project_dir, preview["new_path"])
        new_target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.rename(new_target_path)

    elif preview["tool"] == "create_folder":
        target_path.mkdir(parents=True, exist_ok=False)

    return {
        "tool": preview["tool"],
        "path": preview["path"],
        "new_path": preview["new_path"],
        "status": "applied",
        "summary": preview["summary"],
    }


def apply_actions(project_dir: Path, actions: list[dict]) -> list[dict]:
    previews = preview_actions(project_dir, actions)
    invalid_actions = [preview for preview in previews if not preview["valid"]]

    if invalid_actions:
        raise FileActionError(invalid_actions[0]["error"])

    results = []
    for preview in previews:
        results.append(apply_action(project_dir, {
            "tool": preview["tool"],
            "args": preview["args"],
        }))

    return results
