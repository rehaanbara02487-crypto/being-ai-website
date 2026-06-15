"""Repository intelligence: manifest scanning and workspace summaries."""

from __future__ import annotations

import json
import re
from pathlib import Path

from app.repository_indexer import SKIPPED_DIRS, should_skip_path

MANIFEST_FILES = (
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "README.md",
    "Dockerfile",
    ".env.example",
    "tsconfig.json",
)


def _read_text(path: Path, limit: int = 12000) -> str:
    try:
        return path.read_text(encoding="utf-8")[:limit]
    except (OSError, UnicodeDecodeError):
        return ""


def _parse_package_json(content: str) -> dict:
    if not content.strip():
        return {}
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {}


def _detect_languages(project_dir: Path) -> list[str]:
    extensions = {
        ".py": "Python",
        ".js": "JavaScript",
        ".jsx": "JavaScript",
        ".ts": "TypeScript",
        ".tsx": "TypeScript",
        ".vue": "Vue",
        ".go": "Go",
        ".rs": "Rust",
        ".java": "Java",
        ".css": "CSS",
        ".html": "HTML",
        ".md": "Markdown",
    }
    found: set[str] = set()
    count = 0
    for path in project_dir.rglob("*"):
        if count > 5000:
            break
        relative = path.relative_to(project_dir)
        if should_skip_path(relative) or not path.is_file():
            continue
        count += 1
        language = extensions.get(path.suffix.lower())
        if language:
            found.add(language)
    return sorted(found)


def scan_repository(project_dir: Path, *, git_status: dict | None = None) -> dict:
    project_dir = project_dir.resolve()
    manifests: dict[str, str] = {}

    for name in MANIFEST_FILES:
        path = project_dir / name
        if path.is_file():
            manifests[name] = _read_text(path)

    package = _parse_package_json(manifests.get("package.json", ""))
    dependencies = {
        **package.get("dependencies", {}),
        **package.get("devDependencies", {}),
    }
    scripts = package.get("scripts", {})
    project_type = "unknown"
    framework = "unknown"
    entry_points: list[str] = []

    if package:
        project_type = "node"
        deps = {key.lower() for key in dependencies}
        if "next" in deps:
            framework = "Next.js"
            entry_points = ["pages/", "app/"]
        elif "vue" in deps:
            framework = "Vue"
            entry_points = ["src/main.js", "src/main.ts", "src/App.vue"]
        elif "react" in deps or "react" in json.dumps(package).lower():
            framework = "React"
            entry_points = ["src/main.jsx", "src/main.tsx", "src/App.jsx", "src/App.tsx"]
        elif "express" in deps:
            framework = "Express"
            entry_points = ["index.js", "server.js", "src/index.js"]
        elif scripts.get("dev") and "vite" in json.dumps(package).lower():
            framework = "Vite"
            entry_points = ["src/main.jsx", "src/main.tsx"]

    if (project_dir / "requirements.txt").exists() or (project_dir / "pyproject.toml").exists():
        project_type = "python"
        req_text = manifests.get("requirements.txt", "") + manifests.get("pyproject.toml", "")
        lowered = req_text.lower()
        if "fastapi" in lowered:
            framework = "FastAPI"
            entry_points = ["main.py", "app/main.py"]
        elif "flask" in lowered:
            framework = "Flask"
            entry_points = ["app.py", "wsgi.py"]
        else:
            framework = "Python"
            for candidate in ("main.py", "app.py", "__main__.py"):
                if (project_dir / candidate).exists():
                    entry_points.append(candidate)

    if (project_dir / "Dockerfile").exists():
        project_type = project_type if project_type != "unknown" else "containerized"

    languages = _detect_languages(project_dir)
    file_count = sum(
        1
        for path in project_dir.rglob("*")
        if path.is_file() and not should_skip_path(path.relative_to(project_dir))
    )

    summary_lines = [
        f"Project type: {project_type}",
        f"Framework: {framework}",
        f"Languages: {', '.join(languages) if languages else 'unknown'}",
        f"Entry points: {', '.join(entry_points) if entry_points else 'unknown'}",
        f"Files indexed: {file_count}",
    ]
    if scripts:
        summary_lines.append(f"Scripts: {', '.join(f'{name}={value}' for name, value in list(scripts.items())[:8])}")
    if dependencies:
        summary_lines.append(
            "Dependencies: "
            + ", ".join(list(dependencies.keys())[:20])
            + ("..." if len(dependencies) > 20 else "")
        )
    if git_status:
        summary_lines.append(
            f"Git: branch={git_status.get('branch', 'unknown')}, "
            f"changes={len(git_status.get('changes', []))}"
        )

    return {
        "project_type": project_type,
        "framework": framework,
        "languages": languages,
        "entry_points": entry_points,
        "dependencies": dependencies,
        "scripts": scripts,
        "manifests_found": list(manifests.keys()),
        "manifests": manifests,
        "file_count": file_count,
        "summary": "\n".join(summary_lines),
        "git_status": git_status or {},
    }
