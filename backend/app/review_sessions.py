"""In-memory review sessions for AI-generated file patches."""

from copy import deepcopy
import time
import uuid


REVIEW_SESSIONS = {}


def create_review_session(project_name: str, prompt: str, plan: dict) -> dict:
    review_id = str(uuid.uuid4())
    stored_plan = deepcopy(plan)

    for preview in stored_plan.get("previews", []):
        preview["status"] = "pending" if preview.get("valid") else "invalid"

    session = {
        "id": review_id,
        "project_name": project_name,
        "prompt": prompt,
        "message": stored_plan.get("message", ""),
        "tool_calls": stored_plan.get("tool_calls", []),
        "previews": stored_plan.get("previews", []),
        "change_summary": stored_plan.get("change_summary"),
        "requires_approval": True,
        "is_greenfield": stored_plan.get("is_greenfield", False),
        "run_profile": stored_plan.get("run_profile"),
        "stack": stored_plan.get("stack"),
        "proposed_project_name": stored_plan.get("proposed_project_name", project_name),
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    REVIEW_SESSIONS[review_id] = session
    return deepcopy(session)


def get_review_session(review_id: str) -> dict | None:
    session = REVIEW_SESSIONS.get(review_id)
    return None if session is None else deepcopy(session)


def get_pending_actions(review_id: str, action_ids: list[str] | None = None) -> list[dict]:
    session = REVIEW_SESSIONS.get(review_id)
    if not session:
        return []

    requested_ids = set(action_ids or [])
    actions = []

    for preview in session["previews"]:
        if requested_ids and preview["id"] not in requested_ids:
            continue
        if preview.get("status") != "pending" or not preview.get("valid"):
            continue
        actions.append({
            "tool": preview["tool"],
            "args": preview["args"],
        })

    return actions


def mark_actions(review_id: str, action_ids: list[str], status: str):
    session = REVIEW_SESSIONS.get(review_id)
    if not session:
        return None

    action_ids_set = set(action_ids)
    for preview in session["previews"]:
        if preview["id"] in action_ids_set:
            preview["status"] = status

    session["updated_at"] = time.time()
    return deepcopy(session)


def reject_review_session(review_id: str):
    session = REVIEW_SESSIONS.get(review_id)
    if not session:
        return None

    for preview in session["previews"]:
        if preview.get("status") == "pending":
            preview["status"] = "rejected"

    session["updated_at"] = time.time()
    return deepcopy(session)
