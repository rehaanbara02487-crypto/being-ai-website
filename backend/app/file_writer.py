from pathlib import Path

WORKSPACE = Path("data/workspaces")


def save_file(project_name: str, filename: str, content: str):
    project_dir = WORKSPACE / project_name
    project_dir.mkdir(parents=True, exist_ok=True)

    file_path = project_dir / filename

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

    return str(file_path)