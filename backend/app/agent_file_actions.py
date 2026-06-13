"""Ollama-driven file action planning for approved workspace edits."""

import json
import re

from app.file_action_tools import preview_actions
from app.ollama_service import generate_text_response


AGENT_SYSTEM_PROMPT = """
You are BEING AI in Agent Mode. You can request file tools, but you cannot apply them directly.
Return ONLY valid JSON. Do not use markdown.

Available tools:
- create_file: {"path": "relative/path.py", "content": "complete file content"}
- edit_file: {"path": "relative/path.py", "content": "complete replacement file content"}
- delete_file: {"path": "relative/path.py"}
- rename_file: {"path": "old.py", "new_path": "new.py"}
- create_folder: {"path": "relative/folder"}

Response shape:
{
  "message": "short explanation",
  "tool_calls": [
    {
      "tool": "create_file",
      "args": {
        "path": "app.py",
        "content": "from flask import Flask\\n..."
      }
    }
  ]
}

Rules:
- Use relative paths only.
- For edit_file, return the complete replacement file content.
- Prefer small, targeted changes.
- If no file change is needed, return an empty tool_calls array.
""".strip()


def strip_json_fences(text: str) -> str:
    stripped = text.strip()

    if stripped.startswith("```json"):
        stripped = stripped.replace("```json", "", 1).strip()
    elif stripped.startswith("```"):
        stripped = stripped.replace("```", "", 1).strip()

    if stripped.endswith("```"):
        stripped = stripped[:-3].strip()

    return stripped


def extract_json_object(text: str) -> dict:
    stripped = strip_json_fences(text)

    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", stripped, flags=re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def plan_file_actions(
    project_dir,
    prompt: str,
    repository_context: str | None,
    model: str | None = None,
) -> dict:
    planning_prompt = f"""
Plan file tool calls for this user request:
{prompt}
""".strip()
    response_text = generate_text_response(
        planning_prompt,
        model=model,
        system_prompt=AGENT_SYSTEM_PROMPT,
        repository_context=repository_context,
    )
    parsed_response = extract_json_object(response_text)
    tool_calls = parsed_response.get("tool_calls", [])

    if not isinstance(tool_calls, list):
        tool_calls = []

    previews = preview_actions(project_dir, tool_calls)

    return {
        "message": parsed_response.get("message", "Review the planned file changes."),
        "tool_calls": tool_calls,
        "previews": previews,
        "requires_approval": True,
    }
