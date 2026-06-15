"""Git intelligence helpers powered by Ollama."""

from __future__ import annotations

from app.ollama_service import generate_text_response


def suggest_commit_message(project_name: str, diff: str, changes: list[dict]) -> str:
    change_lines = "\n".join(
        f"- {change.get('path', change.get('file', 'unknown'))}: {change.get('status', 'modified')}"
        for change in changes[:40]
    )
    prompt = f"""
Project: {project_name}

Changed files:
{change_lines or '(no file list)'}

Diff excerpt:
{diff[:6000] or '(empty diff)'}

Write a single concise git commit message in imperative mood.
Return only the commit subject line, optionally followed by a blank line and bullet body.
""".strip()
    return generate_text_response(prompt).strip()


def summarize_diff(project_name: str, diff: str) -> str:
    prompt = f"""
Summarize this git diff for project {project_name}.
Explain what changed, why it matters, and any risks.
Keep it under 180 words.

Diff:
{diff[:8000] or '(empty diff)'}
""".strip()
    return generate_text_response(prompt).strip()


def explain_changes_for_pr(project_name: str, diff: str, base_branch: str, head_branch: str) -> str:
    prompt = f"""
Write a pull request description for {project_name}.
Base branch: {base_branch}
Head branch: {head_branch}

Include sections: Summary, Changes, Test plan.

Diff excerpt:
{diff[:8000] or '(empty diff)'}
""".strip()
    return generate_text_response(prompt).strip()
