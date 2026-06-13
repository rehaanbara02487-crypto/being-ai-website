"""Repository indexing helpers for context-aware AI chat."""

from dataclasses import dataclass
from pathlib import Path
import re


SKIPPED_DIRS = {
    ".git",
    ".pytest_cache",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "venv",
    ".venv",
}

SKIPPED_SUFFIXES = {
    ".bmp",
    ".db",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".lock",
    ".pdf",
    ".png",
    ".pyc",
    ".sqlite",
    ".svg",
    ".webp",
    ".zip",
}

IMPORTANT_FILENAMES = {
    "app.py",
    "main.py",
    "package.json",
    "requirements.txt",
    "vite.config.js",
}

MAX_FILE_CHARS = 6000


@dataclass
class IndexedFile:
    path: str
    content: str
    score: int


def should_skip_path(path: Path) -> bool:
    if any(part in SKIPPED_DIRS for part in path.parts):
        return True

    return path.suffix.lower() in SKIPPED_SUFFIXES


def build_project_tree(project_dir: Path) -> str:
    entries = []

    for path in sorted(project_dir.rglob("*")):
        relative_path = path.relative_to(project_dir)
        if should_skip_path(relative_path):
            continue

        suffix = "/" if path.is_dir() else ""
        entries.append(f"{relative_path.as_posix()}{suffix}")

    return "\n".join(entries)


def query_terms(prompt: str) -> set[str]:
    terms = {
        term.lower()
        for term in re.findall(r"[a-zA-Z0-9_]+", prompt)
        if len(term) > 2
    }

    if "authentication" in terms:
        terms.add("auth")
    if "routes" in terms or "route" in terms or "api" in terms:
        terms.update({"router", "routers", "route"})

    return terms


def score_file(relative_path: str, content: str, prompt: str) -> int:
    terms = query_terms(prompt)
    lower_path = relative_path.lower()
    lower_content = content.lower()
    score = 0
    broad_project_question = any(
        phrase in prompt.lower()
        for phrase in ("explain", "architecture", "overview", "this project")
    )

    if broad_project_question and Path(relative_path).name in IMPORTANT_FILENAMES:
        score += 8

    if "auth" in terms and "auth" in lower_path:
        score += 12

    if terms.intersection({"api", "route", "router", "routers"}) and (
        "router" in lower_path or "route" in lower_path
    ):
        score += 12

    for term in terms:
        if term in lower_path:
            score += 6
        if term in lower_content:
            score += min(lower_content.count(term), 5)

    if any(keyword in lower_path for keyword in ("auth", "route", "router", "api")):
        score += 3

    return score


def read_project_files(project_dir: Path, prompt: str) -> list[IndexedFile]:
    indexed_files = []

    for path in sorted(project_dir.rglob("*")):
        relative_path = path.relative_to(project_dir)
        relative_name = relative_path.as_posix()

        if not path.is_file() or should_skip_path(relative_path):
            continue

        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue

        if "\x00" in content:
            continue

        trimmed_content = content[:MAX_FILE_CHARS]
        indexed_files.append(
            IndexedFile(
                path=relative_name,
                content=trimmed_content,
                score=score_file(relative_name, trimmed_content, prompt),
            )
        )

    return sorted(indexed_files, key=lambda file: (-file.score, file.path))


def build_repository_context(
    project_dir: Path,
    prompt: str,
    max_chars: int,
) -> dict:
    tree = build_project_tree(project_dir)
    indexed_files = read_project_files(project_dir, prompt)
    remaining_chars = max(max_chars - len(tree), 0)
    selected_files = []
    context_sections = [
        "PROJECT TREE:",
        tree or "(empty project)",
        "",
        "RELEVANT FILE CONTENTS:",
    ]

    for indexed_file in indexed_files:
        file_header = f"\nFILE: {indexed_file.path}\n"
        file_section = f"{file_header}{indexed_file.content}\n"

        if len(file_section) > remaining_chars:
            if not selected_files:
                available = max(remaining_chars - len(file_header), 0)
                if available <= 0:
                    break
                file_section = f"{file_header}{indexed_file.content[:available]}\n"
            else:
                break

        context_sections.append(file_section)
        remaining_chars -= len(file_section)
        selected_files.append({
            "path": indexed_file.path,
            "chars": min(len(indexed_file.content), len(file_section)),
            "score": indexed_file.score,
        })

        if remaining_chars <= 0:
            break

    return {
        "tree": tree,
        "files": selected_files,
        "context": "\n".join(context_sections),
        "status": f"Using {len(selected_files)} file(s) as workspace context.",
        "total_files": len(indexed_files),
        "max_context_chars": max_chars,
    }
