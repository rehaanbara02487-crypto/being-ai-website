"""Cached workspace indexing with lightweight symbol extraction."""

from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path

from app.config import REPO_ROOT
from app.repository_indexer import should_skip_path

INDEX_ROOT = REPO_ROOT / "data" / "workspace_indexes"

SYMBOL_PATTERNS = {
    "python": [
        re.compile(r"^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(", re.MULTILINE),
        re.compile(r"^\s*class\s+([A-Za-z_][\w]*)\s*[:\(]", re.MULTILINE),
    ],
    "javascript": [
        re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(", re.MULTILINE),
        re.compile(r"^\s*export\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)", re.MULTILINE),
        re.compile(r"^\s*class\s+([A-Za-z_$][\w$]*)\s*", re.MULTILINE),
    ],
}

IMPORT_PATTERNS = [
    re.compile(r"^\s*import\s+(.+)$", re.MULTILINE),
    re.compile(r"^\s*from\s+([^\s]+)\s+import\s+(.+)$", re.MULTILINE),
    re.compile(r"^\s*require\(['\"]([^'\"]+)['\"]\)", re.MULTILINE),
]

CODE_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".vue",
    ".go",
    ".rs",
    ".java",
}


def _cache_path(project_name: str) -> Path:
    safe = hashlib.sha1(project_name.encode("utf-8")).hexdigest()
    INDEX_ROOT.mkdir(parents=True, exist_ok=True)
    return INDEX_ROOT / f"{safe}.json"


def _language_for_suffix(suffix: str) -> str | None:
    if suffix == ".py":
        return "python"
    if suffix in {".js", ".jsx", ".ts", ".tsx", ".vue"}:
        return "javascript"
    return None


def _extract_symbols(content: str, language: str | None) -> list[dict]:
    if not language or language not in SYMBOL_PATTERNS:
        return []

    symbols = []
    for pattern in SYMBOL_PATTERNS[language]:
        for match in pattern.finditer(content):
            name = match.group(1)
            kind = "class" if "class" in pattern.pattern else "function"
            symbols.append({"name": name, "kind": kind})
    return symbols


def _extract_imports(content: str) -> list[str]:
    imports: list[str] = []
    for pattern in IMPORT_PATTERNS:
        imports.extend(match.group(0).strip() for match in pattern.finditer(content))
    return imports[:50]


def build_workspace_index(project_dir: Path, project_name: str) -> dict:
    project_dir = project_dir.resolve()
    files: list[dict] = []
    symbols: list[dict] = []

    for path in sorted(project_dir.rglob("*")):
        relative = path.relative_to(project_dir)
        if not path.is_file() or should_skip_path(relative):
            continue
        if path.suffix.lower() not in CODE_EXTENSIONS:
            continue

        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue

        rel = relative.as_posix()
        language = _language_for_suffix(path.suffix.lower())
        file_symbols = _extract_symbols(content, language)
        file_imports = _extract_imports(content)
        files.append(
            {
                "path": rel,
                "language": language or "unknown",
                "size": len(content),
                "imports": file_imports,
                "symbols": file_symbols,
            }
        )
        for symbol in file_symbols:
            symbols.append({**symbol, "path": rel})

    index = {
        "project_name": project_name,
        "project_dir": str(project_dir),
        "built_at": time.time(),
        "file_count": len(files),
        "symbol_count": len(symbols),
        "files": files,
        "symbols": symbols,
    }
    _cache_path(project_name).write_text(json.dumps(index), encoding="utf-8")
    return index


def load_workspace_index(project_name: str) -> dict | None:
    cache_file = _cache_path(project_name)
    if not cache_file.exists():
        return None
    try:
        return json.loads(cache_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def get_or_build_index(project_dir: Path, project_name: str, *, force: bool = False) -> dict:
    existing = None if force else load_workspace_index(project_name)
    if existing and existing.get("project_dir") == str(project_dir.resolve()):
        return existing
    return build_workspace_index(project_dir, project_name)


def search_workspace_index(index: dict, query: str, *, limit: int = 25) -> list[dict]:
    lowered_query = query.lower()
    semantic_terms: set[str] = set()

    if any(token in lowered_query for token in ("auth", "login", "signin", "signup", "session")):
        semantic_terms.update({"auth", "authentication", "login", "session", "jwt", "oauth"})
    if any(token in lowered_query for token in ("route", "routes", "api", "endpoint", "controller")):
        semantic_terms.update({"route", "router", "api", "controller", "endpoint", "views"})
    if any(token in lowered_query for token in ("model", "models", "database", "schema", "entity")):
        semantic_terms.update({"model", "models", "schema", "entity", "database", "sqlalchemy"})
    if "unused" in lowered_query:
        semantic_terms.update({"unused", "dead", "deprecated"})

    terms = {
        term.lower()
        for term in re.findall(r"[a-zA-Z0-9_]+", query)
        if len(term) > 2
    }
    terms.update(semantic_terms)
    if not terms:
        return []

    results: list[dict] = []
    for file_entry in index.get("files", []):
        path = file_entry.get("path", "")
        lower_path = path.lower()
        score = 0
        for term in terms:
            if term in lower_path:
                score += 5
            for symbol in file_entry.get("symbols", []):
                if term in symbol.get("name", "").lower():
                    score += 8
            for imp in file_entry.get("imports", []):
                if term in imp.lower():
                    score += 3
        if score:
            results.append({"path": path, "score": score, "symbols": file_entry.get("symbols", [])})

    results.sort(key=lambda item: (-item["score"], item["path"]))
    return results[:limit]


def invalidate_workspace_index(project_name: str) -> None:
    cache_file = _cache_path(project_name)
    if cache_file.exists():
        cache_file.unlink(missing_ok=True)
