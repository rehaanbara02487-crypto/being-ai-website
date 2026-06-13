"""Greenfield project planning via Agent Mode tool calls."""

from __future__ import annotations

import json
import re
from pathlib import Path

from app.agent_file_actions import extract_json_object, strip_json_fences
from app.config import get_workspace_root
from app.file_action_tools import preview_actions
from app.ollama_service import generate_text_response
from app.project_templates import detect_stack, get_template
from app.workspace_paths import ensure_project_name_safe


GREENFIELD_PHASE1_PROMPT = """
You are BEING AI planning a brand-new software project from scratch.
Return ONLY valid JSON. No markdown.

Analyze the user request and produce a scaffold plan:
{
  "project_name": "kebab-case-slug",
  "message": "short summary of the project plan",
  "stack": "react-vite|flask|fastapi",
  "folders": ["src", "public"],
  "files": [
    {"path": "package.json", "purpose": "dependencies and scripts"},
    {"path": "src/App.jsx", "purpose": "main UI component"}
  ]
}

Rules:
- project_name must be lowercase kebab-case, 2-4 words max.
- folders must list every directory needed before files are created.
- files must list every file to generate with relative paths.
- Choose stack from the user request.
""".strip()


GREENFIELD_PHASE2_PROMPT = """
You are BEING AI generating files for a new project.
Return ONLY valid JSON. No markdown.

Response shape:
{
  "tool_calls": [
    {"tool": "create_folder", "args": {"path": "src"}},
    {"tool": "create_file", "args": {"path": "package.json", "content": "..."}}
  ]
}

Rules:
- Emit create_folder actions before files in those folders.
- For create_file and edit_file, include the COMPLETE file content.
- Use relative paths only.
- Follow the stack template exactly.
- Make the project runnable after apply.
- Do not use markdown code fences inside content strings.
""".strip()


def derive_project_slug(prompt: str, proposed_name: str | None = None) -> str:
    if proposed_name:
        slug = re.sub(r"[^a-z0-9-]+", "-", proposed_name.lower()).strip("-")
        return slug or "new-project"

    words = re.findall(r"[a-z0-9]+", prompt.lower())
    stop = {
        "a", "an", "the", "and", "or", "for", "with", "from", "to", "of", "in", "on",
        "build", "create", "make", "generate", "scaffold", "new", "modern", "simple",
        "complete", "full", "app", "application", "project", "using", "use",
    }
    meaningful = [word for word in words if word not in stop and len(word) > 1]
    if not meaningful:
        return "new-project"
    return "-".join(meaningful[:4])


def is_greenfield_prompt(prompt: str) -> bool:
    lowered = prompt.lower()
    triggers = ("build ", "create ", "make ", "generate ", "scaffold ", "new ")
    targets = (" app", " application", " project", " api", " website", " todo", " react", " flask")
    return any(lowered.startswith(t) or t in lowered for t in triggers) and any(
        target in lowered for target in targets
    )


def planning_project_dir(project_name: str) -> Path:
    ensure_project_name_safe(project_name)
    return get_workspace_root() / project_name


def plan_scaffold(prompt: str, model: str | None, stack: str | None, project_name: str | None) -> dict:
    template = get_template(detect_stack(prompt, stack))
    planning_prompt = f"""
User request:
{prompt}

Target stack: {template["label"]}
Template guidance:
{template["guidance"]}

Required folders: {", ".join(template["required_folders"]) or "(none)"}
Required files: {", ".join(template["required_files"])}
""".strip()

    response_text = generate_text_response(
        planning_prompt,
        model=model,
        system_prompt=GREENFIELD_PHASE1_PROMPT,
    )
    scaffold = extract_json_object(response_text)

    resolved_name = derive_project_slug(
        prompt,
        project_name or scaffold.get("project_name"),
    )
    ensure_project_name_safe(resolved_name)

    scaffold["project_name"] = resolved_name
    scaffold["stack"] = detect_stack(prompt, scaffold.get("stack") or stack)
    return scaffold


def generate_tool_calls_for_batch(
    prompt: str,
    scaffold: dict,
    file_batch: list[dict],
    model: str | None,
) -> list[dict]:
    template = get_template(scaffold["stack"])
    file_lines = "\n".join(
        f"- {item['path']}: {item.get('purpose', 'project file')}"
        for item in file_batch
    )
    folder_lines = "\n".join(f"- {folder}" for folder in scaffold.get("folders", []))

    batch_prompt = f"""
User request:
{prompt}

Project: {scaffold["project_name"]}
Stack: {template["label"]}

Folders to create:
{folder_lines or "(none)"}

Generate FULL content for these files:
{file_lines}

Template guidance:
{template["guidance"]}
""".strip()

    response_text = generate_text_response(
        batch_prompt,
        model=model,
        system_prompt=GREENFIELD_PHASE2_PROMPT,
    )
    parsed = extract_json_object(response_text)
    tool_calls = parsed.get("tool_calls", [])
    return tool_calls if isinstance(tool_calls, list) else []


def merge_tool_calls(scaffold: dict, batches: list[list[dict]]) -> list[dict]:
    actions: list[dict] = []
    seen_folders: set[str] = set()
    seen_files: set[str] = set()

    for folder in scaffold.get("folders", []):
        if folder and folder not in seen_folders:
            actions.append({"tool": "create_folder", "args": {"path": folder}})
            seen_folders.add(folder)

    for batch in batches:
        for action in batch:
            tool = action.get("tool") or action.get("name")
            args = action.get("args") or action
            path = args.get("path") or args.get("filename") or ""

            if tool == "create_folder" and path and path not in seen_folders:
                actions.append({"tool": "create_folder", "args": {"path": path}})
                seen_folders.add(path)
            elif tool in {"create_file", "edit_file"} and path and path not in seen_files:
                actions.append({
                    "tool": "create_file",
                    "args": {
                        "path": path,
                        "content": args.get("content", ""),
                    },
                })
                seen_files.add(path)

    return actions


def chunk_files(files: list, size: int = 6) -> list[list]:
    return [files[index:index + size] for index in range(0, len(files), size)]


def build_change_summary(previews: list[dict]) -> dict:
    valid_previews = [preview for preview in previews if preview.get("valid")]
    return {
        "files_changed": len({
            preview["new_path"] or preview["path"]
            for preview in valid_previews
            if preview.get("tool") != "create_folder"
        }),
        "folders_changed": len([
            preview for preview in valid_previews if preview.get("tool") == "create_folder"
        ]),
        "lines_added": sum(preview.get("lines_added", 0) for preview in valid_previews),
        "lines_removed": sum(preview.get("lines_removed", 0) for preview in valid_previews),
        "lines_modified": sum(preview.get("lines_modified", 0) for preview in valid_previews),
    }


def plan_new_project(
    prompt: str,
    model: str | None = None,
    project_name: str | None = None,
    stack: str | None = None,
) -> dict:
    scaffold = plan_scaffold(prompt, model, stack, project_name)
    template = get_template(scaffold["stack"])

    files = scaffold.get("files") or [
        {"path": path, "purpose": "required project file"}
        for path in template["required_files"]
    ]
    if not scaffold.get("folders"):
        scaffold["folders"] = template["required_folders"]

    batches = []
    for file_batch in chunk_files(files):
        batches.append(generate_tool_calls_for_batch(prompt, scaffold, file_batch, model))

    tool_calls = merge_tool_calls(scaffold, batches)
    project_dir = planning_project_dir(scaffold["project_name"])
    previews = preview_actions(project_dir, tool_calls)

    plan = {
        "message": scaffold.get("message") or f"Planned new project {scaffold['project_name']}.",
        "tool_calls": tool_calls,
        "previews": previews,
        "change_summary": build_change_summary(previews),
        "requires_approval": True,
        "is_greenfield": True,
        "proposed_project_name": scaffold["project_name"],
        "stack": scaffold["stack"],
        "run_profile": template["run_profile"],
        "scaffold": {
            "folders": scaffold.get("folders", []),
            "files": [item.get("path") for item in files],
        },
    }
    return plan
