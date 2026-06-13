import re
import json

from app.workspace_paths import ensure_project_name_safe, resolve_workspace_target


def build_project(project_name: str, model_response: str):

    match = re.search(r'\{.*\}', model_response, re.DOTALL)

    if not match:
        raise Exception(
            f"No JSON found. Model returned:\n{model_response[:500]}"
        )

    data = json.loads(match.group())

    if "files" not in data:
        raise Exception(
            f"Model returned invalid format. Keys found: {list(data.keys())}"
        )

    ensure_project_name_safe(project_name)

    created_files = []

    for file in data["files"]:
        filename = file["filename"]
        content = file["content"]

        file_path = resolve_workspace_target(project_name, filename)

        file_path.parent.mkdir(parents=True, exist_ok=True)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        created_files.append(str(file_path))

    return created_files