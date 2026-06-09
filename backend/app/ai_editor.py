from pathlib import Path


def read_project_file(project_name: str, filename: str):

    file_path = (
        Path("data/workspaces")
        / project_name
        / filename
    )

    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()