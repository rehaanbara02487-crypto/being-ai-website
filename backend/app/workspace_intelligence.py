"""Repository intelligence: manifest scanning and workspace summaries."""

from __future__ import annotations

import json
import re
from pathlib import Path

from app.repository_indexer import SKIPPED_DIRS, build_project_tree, should_skip_path

MANIFEST_FILES = (
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "requirements.txt",
    "pyproject.toml",
    "Pipfile",
    "pom.xml",
    "build.gradle",
    "manage.py",
    "README.md",
    "Dockerfile",
    ".env.example",
    "tsconfig.json",
)

COMPONENT_PATH_HINTS = ("components/", "component/", "widgets/", "ui/")
ROUTE_PATH_HINTS = ("routes/", "router/", "routers/", "pages/", "app/", "api/", "controllers/")
MODEL_PATH_HINTS = ("models/", "model/", "schemas/", "entities/")
SERVICE_PATH_HINTS = ("services/", "service/", "providers/", "hooks/")


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


def _detect_package_manager(project_dir: Path, manifests: dict[str, str]) -> str:
    if (project_dir / "pnpm-lock.yaml").exists() or "pnpm-lock.yaml" in manifests:
        return "pnpm"
    if (project_dir / "yarn.lock").exists() or "yarn.lock" in manifests:
        return "yarn"
    if (project_dir / "package-lock.json").exists() or "package.json" in manifests:
        return "npm"
    if (project_dir / "poetry.lock").exists():
        return "poetry"
    if (project_dir / "Pipfile").exists() or "Pipfile" in manifests:
        return "pipenv"
    if (project_dir / "requirements.txt").exists() or "requirements.txt" in manifests:
        return "pip"
    if list(project_dir.glob("*.csproj")):
        return "dotnet"
    if (project_dir / "pom.xml").exists() or (project_dir / "build.gradle").exists():
        return "maven/gradle"
    return "unknown"


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
        ".cs": "C#",
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


def _count_structure(project_dir: Path, index: dict | None = None) -> dict:
    components = 0
    routes = 0
    models = 0
    services = 0

    indexed_paths = {entry.get("path", "") for entry in (index or {}).get("files", [])}

    def inspect_path(rel: str) -> None:
        nonlocal components, routes, models, services
        lower = rel.lower()
        name = Path(rel).name.lower()
        if any(part in lower for part in COMPONENT_PATH_HINTS) or name.endswith((".jsx", ".tsx", ".vue")):
            if "component" in lower or "/components/" in lower or name.startswith(("todo", "app")):
                components += 1
        if any(part in lower for part in ROUTE_PATH_HINTS) or "route" in name:
            routes += 1
        if any(part in lower for part in MODEL_PATH_HINTS) or "model" in name or name == "schemas.py":
            models += 1
        if any(part in lower for part in SERVICE_PATH_HINTS) or "service" in name:
            services += 1

    if indexed_paths:
        for rel in indexed_paths:
            inspect_path(rel)
    else:
        for path in project_dir.rglob("*"):
            relative = path.relative_to(project_dir)
            if not path.is_file() or should_skip_path(relative):
                continue
            inspect_path(relative.as_posix())

    return {
        "components": components,
        "routes": routes,
        "models": models,
        "services": services,
    }


def _detect_framework(project_dir: Path, package: dict, manifests: dict[str, str]) -> tuple[str, str, list[str]]:
    project_type = "unknown"
    framework = "unknown"
    entry_points: list[str] = []
    dependencies = {
        **package.get("dependencies", {}),
        **package.get("devDependencies", {}),
    }
    scripts = package.get("scripts", {})

    if list(project_dir.glob("*.csproj")):
        return "dotnet", ".NET", ["Program.cs", "Startup.cs"]

    if (project_dir / "pom.xml").exists():
        pom = manifests.get("pom.xml", _read_text(project_dir / "pom.xml"))
        if "spring-boot" in pom.lower():
            return "java", "Spring Boot", ["src/main/java"]
        return "java", "Maven", ["src/main/java"]

    if (project_dir / "build.gradle").exists():
        gradle = _read_text(project_dir / "build.gradle")
        if "spring-boot" in gradle.lower():
            return "java", "Spring Boot", ["src/main/java"]
        return "java", "Gradle", ["src/main/java"]

    if (project_dir / "manage.py").exists():
        return "python", "Django", ["manage.py"]

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
            if scripts.get("dev") and "vite" in json.dumps(package).lower():
                framework = "React + Vite"
            else:
                framework = "React"
            entry_points = ["src/main.jsx", "src/main.tsx", "src/App.jsx", "src/App.tsx"]
        elif "express" in deps:
            framework = "Express"
            entry_points = ["index.js", "server.js", "src/index.js"]
        elif scripts.get("dev") and "vite" in json.dumps(package).lower():
            framework = "Vite"
            entry_points = ["src/main.jsx", "src/main.tsx"]
        else:
            framework = "Node"
            entry_points = ["index.js", "src/index.js"]

    req_text = manifests.get("requirements.txt", "") + manifests.get("pyproject.toml", "")
    if req_text or (project_dir / "requirements.txt").exists() or (project_dir / "pyproject.toml").exists():
        project_type = "python"
        lowered = req_text.lower()
        if "fastapi" in lowered:
            framework = "FastAPI"
            entry_points = ["main.py", "app/main.py"]
        elif "flask" in lowered:
            framework = "Flask"
            entry_points = ["app.py", "wsgi.py"]
        elif "django" in lowered:
            framework = "Django"
            entry_points = ["manage.py"]
        elif framework == "unknown":
            framework = "Python"
            for candidate in ("main.py", "app.py", "__main__.py"):
                if (project_dir / candidate).exists():
                    entry_points.append(candidate)

    if (project_dir / "Dockerfile").exists() and project_type == "unknown":
        project_type = "containerized"

    return project_type, framework, entry_points


def _select_key_files(project_dir: Path, entry_points: list[str], index: dict | None, limit: int = 8) -> list[str]:
    candidates: list[str] = []

    for entry in entry_points:
        if entry.endswith("/"):
            folder = project_dir / entry.rstrip("/")
            if folder.is_dir():
                for child in sorted(folder.rglob("*")):
                    if child.is_file() and child.suffix.lower() in {".py", ".js", ".jsx", ".ts", ".tsx", ".vue"}:
                        candidates.append(child.relative_to(project_dir).as_posix())
                        if len(candidates) >= limit:
                            return candidates
        else:
            if (project_dir / entry).exists():
                candidates.append(entry)

    priority_names = (
        "package.json",
        "src/App.jsx",
        "src/App.tsx",
        "src/main.jsx",
        "src/main.tsx",
        "main.py",
        "app.py",
    )
    for name in priority_names:
        if name not in candidates and (project_dir / name).exists():
            candidates.append(name)

    if index:
        for file_entry in index.get("files", [])[:100]:
            path = file_entry.get("path", "")
            if path and path not in candidates:
                lower = path.lower()
                if any(token in lower for token in ("component", "route", "main", "app.")):
                    candidates.append(path)
            if len(candidates) >= limit:
                break

    return candidates[:limit]


def scan_repository(
    project_dir: Path,
    *,
    git_status: dict | None = None,
    index: dict | None = None,
    index_duration_ms: float | None = None,
) -> dict:
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
    project_type, framework, entry_points = _detect_framework(project_dir, package, manifests)
    package_manager = _detect_package_manager(project_dir, manifests)
    languages = _detect_languages(project_dir)
    structure = _count_structure(project_dir, index)
    key_files = _select_key_files(project_dir, entry_points, index)

    file_count = index.get("file_count") if index else sum(
        1
        for path in project_dir.rglob("*")
        if path.is_file() and not should_skip_path(path.relative_to(project_dir))
    )
    symbol_count = index.get("symbol_count", 0) if index else 0

    tree_lines = build_project_tree(project_dir).splitlines()
    folder_tree = tree_lines[:80]
    if len(tree_lines) > 80:
        folder_tree.append(f"... ({len(tree_lines) - 80} more entries)")

    project_name = project_dir.name
    summary_lines = [
        f"Project: {project_name}",
        f"Framework: {framework}",
        f"Package manager: {package_manager}",
        f"Files: {file_count}",
        f"Components: {structure['components']}",
        f"Routes: {structure['routes']}",
        f"Models: {structure['models']}",
        f"Services: {structure['services']}",
    ]
    if symbol_count:
        summary_lines.append(f"Symbols indexed: {symbol_count}")
    if key_files:
        summary_lines.append("Key files:")
        summary_lines.extend(f"- {path}" for path in key_files[:6])
    if scripts:
        summary_lines.append(f"Scripts: {', '.join(f'{name}={value}' for name, value in list(scripts.items())[:8])}")
    if git_status:
        summary_lines.append(
            f"Git: branch={git_status.get('branch', 'unknown')}, "
            f"changes={len(git_status.get('changes', []))}"
        )

    return {
        "project_name": project_name,
        "project_type": project_type,
        "framework": framework,
        "package_manager": package_manager,
        "languages": languages,
        "entry_points": entry_points,
        "key_files": key_files,
        "dependencies": dependencies,
        "scripts": scripts,
        "manifests_found": list(manifests.keys()),
        "file_count": file_count,
        "symbol_count": symbol_count,
        "components": structure["components"],
        "routes": structure["routes"],
        "models": structure["models"],
        "services": structure["services"],
        "folder_tree": folder_tree,
        "summary": "\n".join(summary_lines),
        "git_status": git_status or {},
        "index_duration_ms": index_duration_ms,
    }
