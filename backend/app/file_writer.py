from app.workspace_paths import ensure_project_name_safe, resolve_workspace_target


def save_file(project_name: str, filename: str, content: str):
    ensure_project_name_safe(project_name)
    file_path = resolve_workspace_target(project_name, filename)
    file_path.parent.mkdir(parents=True, exist_ok=True)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

    return str(file_path)