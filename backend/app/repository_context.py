"""Unified repository context assembly for chat and agent pipelines."""

from __future__ import annotations

import time

from app.config import get_settings
from app.repository_indexer import build_repository_context
from app.workspace_index_service import get_or_build_index, search_workspace_index
from app.workspace_intelligence import scan_repository
import app.git_service as git_service
from app.git_service import GitServiceError


def get_repository_context_for_request(
    project_dir,
    project_name: str,
    prompt: str,
    max_context_chars: int | None,
    *,
    opened_file: str | None = None,
    selected_folder: str | None = None,
    force_reindex: bool = False,
):
    context_limit = max_context_chars or get_settings().ollama_context_char_limit
    started = time.perf_counter()

    git_status_payload = {}
    try:
        git_service.ensure_git_repo(project_dir)
        git_status_payload = {
            "branch": git_service.current_branch(project_dir),
            "changes": git_service.status(project_dir).get("changes", []),
        }
    except GitServiceError:
        pass

    index_started = time.perf_counter()
    index = get_or_build_index(project_dir, project_name, force=force_reindex)
    index_duration_ms = round((time.perf_counter() - index_started) * 1000, 1)

    intelligence = scan_repository(
        project_dir,
        git_status=git_status_payload,
        index=index,
        index_duration_ms=index_duration_ms,
    )
    search_hits = search_workspace_index(index, prompt, limit=12)

    editor_lines = []
    if opened_file:
        editor_lines.append(f"Active editor file: {opened_file}")
    if selected_folder:
        editor_lines.append(f"Selected explorer folder: {selected_folder}")

    context_payload = build_repository_context(
        project_dir,
        prompt,
        max_chars=context_limit,
    )

    index_section = "\n".join(
        f"- {hit['path']} (score {hit['score']})"
        for hit in search_hits
    ) or "(no direct index matches)"

    editor_section = "\n".join(editor_lines) or "(none)"
    preamble = (
        "REPOSITORY SUMMARY:\n"
        f"{intelligence['summary']}\n\n"
        "EDITOR CONTEXT:\n"
        f"{editor_section}\n\n"
        "INDEX SEARCH MATCHES:\n"
        f"{index_section}\n\n"
    )

    if opened_file and opened_file not in {item["path"] for item in context_payload.get("files", [])}:
        try:
            active_content = (project_dir / opened_file).read_text(encoding="utf-8")
            active_trimmed = active_content[: min(4000, context_limit // 4)]
            preamble += f"ACTIVE FILE ({opened_file}):\n{active_trimmed}\n\n"

            context_payload.setdefault("files", []).insert(
                0,
                {
                    "path": opened_file,
                    "chars": len(active_trimmed),
                    "score": 999,
                },
            )
        except (OSError, UnicodeDecodeError):
            pass

    context_payload["intelligence"] = intelligence
    context_payload["index"] = {
        "file_count": index.get("file_count", 0),
        "symbol_count": index.get("symbol_count", 0),
        "search_hits": search_hits,
        "built_at": index.get("built_at"),
        "index_duration_ms": index_duration_ms,
    }
    context_payload["context"] = f"{preamble}{context_payload['context']}"
    context_payload["status"] = (
        f"{context_payload['status']} {intelligence['framework']} · "
        f"{index.get('file_count', 0)} files indexed · "
        f"{len(context_payload.get('files', []))} context files"
    )
    context_payload["diagnostics"] = {
        "files_indexed": index.get("file_count", 0),
        "symbols_indexed": index.get("symbol_count", 0),
        "index_duration_ms": index_duration_ms,
        "context_chars": len(context_payload["context"]),
        "context_file_count": len(context_payload.get("files", [])),
        "total_duration_ms": round((time.perf_counter() - started) * 1000, 1),
    }
    return context_payload


def invalidate_workspace_index(project_name: str) -> None:
    from app.workspace_index_service import invalidate_workspace_index as drop_index_cache

    drop_index_cache(project_name)
