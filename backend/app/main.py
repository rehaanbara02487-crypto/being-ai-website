from pathlib import Path
import asyncio
import json 
import sys
import shutil
import subprocess
import threading

from app.project_builder import build_project
from app.project_planner import plan_new_project
from app.project_runner import detect_run_profile, run_install_if_needed, start_project_process
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import requests

from app.agent_file_actions import plan_file_actions
from app.autonomous_agent import get_task, request_stop, start_task
from app.file_action_tools import FileActionError, apply_actions
from app.git_service import GitServiceError
import app.git_service as git_service
from app.ollama_service import OllamaOfflineError, get_ollama_status, stream_chat_response
from app.config import get_settings, get_workspace_root
from app.workspace_paths import resolve_project_dir, resolve_workspace_path
from app.workspace_registry import (
    get_workspace_entry,
    list_all_workspaces,
    list_project_slugs,
    pick_folder_dialog,
    register_external_workspace,
    touch_workspace,
)
from app.repository_indexer import build_repository_context, should_skip_path
from app.workspace_intelligence import scan_repository
from app.workspace_index_service import get_or_build_index, search_workspace_index
from app.git_intelligence import explain_changes_for_pr, suggest_commit_message, summarize_diff
from app.terminal_intelligence import analyze_terminal_logs
from app.review_sessions import (
    create_review_session,
    get_pending_actions,
    get_review_session,
    mark_actions,
    reject_review_session,
)
from app.schemas import (
    AgentFileActionApplyRequest,
    AgentFileActionPlanRequest,
    AutonomousAgentStartRequest,
    CreateFileRequest,
    CreateFolderRequest,
    FileRequest,
    GitBranchRequest,
    GitCommitRequest,
    GitRestoreRequest,
    GitRevertRequest,
    GitSnapshotRequest,
    OllamaChatRequest,
    ProjectPlanRequest,
    RenamePathRequest,
    ReviewApplyRequest,
    ReviewRejectRequest,
    WorkspaceOpenRequest,
)
from app.file_writer import save_file

app = FastAPI(
    title="BeingAI Engineer",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import logging

logging.basicConfig(level=logging.INFO)
logging.getLogger("beingai.generation").setLevel(logging.INFO)


RUNNING_PROJECTS = {}
RUNNING_PROJECTS_LOCK = threading.Lock()


def get_project_dir(project_name: str) -> Path:
    return resolve_project_dir(project_name, must_exist=True)


def ensure_project_workspace(project_name: str) -> Path:
    from app.workspace_paths import ensure_project_name_safe

    ensure_project_name_safe(project_name)
    project_dir = get_workspace_root() / project_name
    project_dir.mkdir(parents=True, exist_ok=True)
    return resolve_project_dir(project_name, must_exist=True)


def resolve_project_path(project_name: str, relative_path: str) -> Path:
    return resolve_workspace_path(project_name, relative_path)


def append_run_log(run_info: dict, stream: str, message: str):
    with RUNNING_PROJECTS_LOCK:
        run_info["logs"].append({
            "stream": stream,
            "message": message,
        })


def read_process_stream(run_info: dict, stream_name: str, stream):
    try:
        for line in iter(stream.readline, ""):
            if not line:
                break
            append_run_log(run_info, stream_name, line)
    finally:
        stream.close()


def monitor_process(project_name: str, run_info: dict):
    return_code = run_info["process"].wait()

    with RUNNING_PROJECTS_LOCK:
        run_info["running"] = False
        run_info["returncode"] = return_code
        run_info["logs"].append({
            "stream": "system",
            "message": f"Process exited with code {return_code}\n",
            "returncode": return_code,
        })


def get_run_info(project_name: str):
    with RUNNING_PROJECTS_LOCK:
        run_info = RUNNING_PROJECTS.get(project_name)

    if not run_info:
        return {
            "project": project_name,
            "running": False,
            "returncode": None,
            "entrypoint": None,
        }

    return {
        "project": project_name,
        "running": run_info["running"],
        "returncode": run_info["returncode"],
        "entrypoint": run_info["entrypoint"],
    }


def get_repository_context_for_request(project_name: str, prompt: str, max_context_chars: int | None):
    project_dir = get_project_dir(project_name)
    context_limit = max_context_chars or get_settings().ollama_context_char_limit

    git_status_payload = {}
    try:
        git_service.ensure_git_repo(project_dir)
        git_status_payload = {
            "branch": git_service.current_branch(project_dir),
            "changes": git_service.status(project_dir).get("changes", []),
        }
    except GitServiceError:
        pass

    intelligence = scan_repository(project_dir, git_status=git_status_payload)
    index = get_or_build_index(project_dir, project_name)
    search_hits = search_workspace_index(index, prompt, limit=12)

    context_payload = build_repository_context(
        project_dir,
        prompt,
        max_chars=context_limit,
    )

    index_section = "\n".join(
        f"- {hit['path']} (score {hit['score']})"
        for hit in search_hits
    ) or "(no direct index matches)"

    context_payload["intelligence"] = intelligence
    context_payload["index"] = {
        "file_count": index.get("file_count", 0),
        "symbol_count": index.get("symbol_count", 0),
        "search_hits": search_hits,
    }
    context_payload["context"] = (
        "REPOSITORY SUMMARY:\n"
        f"{intelligence['summary']}\n\n"
        "INDEX SEARCH MATCHES:\n"
        f"{index_section}\n\n"
        f"{context_payload['context']}"
    )
    context_payload["status"] = (
        f"{context_payload['status']} Repository intelligence loaded."
    )
    return context_payload


def git_project_dir(project_name: str) -> Path:
    return get_project_dir(project_name)


def handle_git_error(exc: GitServiceError):
    raise HTTPException(status_code=400, detail=str(exc)) from exc


class PromptRequest(BaseModel):
    prompt: str

class PlanRequest(BaseModel):
    project_name: str
    instruction: str

class ApplyPlanRequest(BaseModel):
    project_name: str
    instruction: str
    
class TerminalAnalyzeRequest(BaseModel):
    logs: list[dict] = []


class GitSuggestCommitRequest(BaseModel):
    diff: str = ""
    changes: list[dict] = []


class GitSummarizeRequest(BaseModel):
    diff: str = ""


class GitPrDescriptionRequest(BaseModel):
    diff: str = ""
    base_branch: str = "main"
    head_branch: str = "HEAD"


class RunFixRequest(BaseModel):
    project_name: str
    instruction: str


@app.get("/")
async def root():
    return {
        "status": "running",
        "name": "BeingAI Engineer"
    }


@app.post("/ollama/chat/stream")
async def ollama_chat_stream(request: OllamaChatRequest):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    repository_context = None
    context_payload = None

    if request.use_workspace_context:
        if not request.project_name:
            raise HTTPException(status_code=400, detail="Project name is required for workspace context")

        context_payload = get_repository_context_for_request(
            request.project_name,
            request.prompt,
            request.max_context_chars,
        )
        repository_context = context_payload["context"]

    def event_stream():
        if context_payload:
            public_context_payload = {
                key: value
                for key, value in context_payload.items()
                if key != "context"
            }
            yield f"data: {json.dumps({'type': 'context', **public_context_payload})}\n\n"

        try:
            for payload in stream_chat_response(
                request.prompt,
                model=request.model,
                system_prompt=request.system_prompt,
                repository_context=repository_context,
            ):
                yield f"data: {json.dumps(payload)}\n\n"
        except OllamaOfflineError as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/ollama/status")
async def ollama_status(model: str | None = None):
    return get_ollama_status(model)


@app.post("/agent/projects/plan")
async def plan_new_project_endpoint(request: ProjectPlanRequest):
    from app.generation_log import log_generation_step

    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    log_generation_step(
        "CHAT RECEIVED",
        endpoint="/agent/projects/plan",
        prompt_preview=request.prompt[:200],
        target=request.target,
        current_workspace=request.current_workspace,
        auto_apply=request.auto_apply,
    )

    try:
        plan = plan_new_project(
            request.prompt,
            model=request.model,
            project_name=request.project_name,
            stack=request.stack,
            target=request.target,
            target_path=request.target_path,
            current_workspace=request.current_workspace,
        )
    except OllamaOfflineError as exc:
        log_generation_step("GENERATION FAILED", stage="plan", error=str(exc))
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (json.JSONDecodeError, ValueError) as exc:
        log_generation_step("GENERATION FAILED", stage="plan", error=str(exc))
        raise HTTPException(status_code=502, detail=f"Invalid project plan from Ollama: {exc}") from exc
    except HTTPException as exc:
        log_generation_step("GENERATION FAILED", stage="plan", error=str(exc.detail))
        raise

    project_name = plan.get("workspace_slug") or plan["proposed_project_name"]
    review_session = create_review_session(project_name, request.prompt, plan)
    log_generation_step(
        "REVIEW CREATED",
        review_id=review_session.get("id"),
        project_name=project_name,
        workspace_path=plan.get("workspace_path"),
        preview_count=len(review_session.get("previews") or []),
    )

    response = {
        **plan,
        "review_session": review_session,
        "review_session_id": review_session["id"],
    }

    if request.auto_apply and review_session.get("id"):
        log_generation_step(
            "APPLY START",
            review_id=review_session["id"],
            workspace_path=review_session.get("workspace_path"),
        )
        try:
            apply_result = await apply_agent_review_actions(
                review_session["id"],
                ReviewApplyRequest(action_ids=None),
            )
        except HTTPException as exc:
            invalid_previews = [
                {
                    "path": preview.get("path"),
                    "error": preview.get("error"),
                }
                for preview in review_session.get("previews") or []
                if not preview.get("valid")
            ]
            log_generation_step(
                "GENERATION FAILED",
                stage="apply",
                error=str(exc.detail),
                invalid_previews=invalid_previews,
            )
            raise HTTPException(
                status_code=exc.status_code,
                detail={
                    "message": str(exc.detail),
                    "invalid_previews": invalid_previews,
                },
            ) from exc
        except FileActionError as exc:
            log_generation_step("GENERATION FAILED", stage="apply", error=str(exc))
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        log_generation_step(
            "GENERATION COMPLETE",
            applied_count=len(apply_result.get("results") or []),
            workspace_path=apply_result.get("workspace_path"),
        )
        response["apply_result"] = apply_result
        response["auto_applied"] = True

    return response


@app.post("/agent/file-actions/plan")
async def plan_agent_file_actions(request: AgentFileActionPlanRequest):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    project_dir = get_project_dir(request.project_name)
    context_payload = None
    repository_context = None

    if request.use_workspace_context:
        context_payload = get_repository_context_for_request(
            request.project_name,
            request.prompt,
            request.max_context_chars,
        )
        repository_context = context_payload["context"]

    try:
        plan = plan_file_actions(
            project_dir,
            request.prompt,
            repository_context=repository_context,
            model=request.model,
        )
    except OllamaOfflineError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid tool plan from Ollama: {exc}") from exc

    review_session = create_review_session(request.project_name, request.prompt, plan)

    return {
        **plan,
        "review_session": review_session,
        "review_session_id": review_session["id"],
        "context": None if not context_payload else {
            key: value
            for key, value in context_payload.items()
            if key != "context"
        },
    }


@app.post("/agent/file-actions/apply")
async def apply_agent_file_actions(request: AgentFileActionApplyRequest):
    project_dir = get_project_dir(request.project_name)

    try:
        results = apply_actions(project_dir, request.actions)
    except FileActionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "status": "applied",
        "results": results,
        "message": f"Applied {len(results)} file operation(s).",
    }


@app.get("/agent/reviews/{review_id}")
async def get_agent_review(review_id: str):
    review = get_review_session(review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review session not found")
    return review


@app.post("/agent/reviews/{review_id}/apply")
async def apply_agent_review_actions(review_id: str, request: ReviewApplyRequest):
    review = get_review_session(review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review session not found")

    if review.get("is_greenfield"):
        workspace_path = review.get("workspace_path")
        if workspace_path:
            project_dir = Path(workspace_path).resolve()
            project_dir.mkdir(parents=True, exist_ok=True)
        else:
            project_dir = ensure_project_workspace(review["project_name"])
    else:
        project_dir = get_project_dir(review["project_name"])

    actions = get_pending_actions(review_id, request.action_ids)

    if not actions:
        invalid_previews = [
            {
                "id": preview.get("id"),
                "path": preview.get("path"),
                "error": preview.get("error"),
                "tool": preview.get("tool"),
            }
            for preview in review.get("previews") or []
            if not preview.get("valid")
        ]
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No pending valid actions selected",
                "invalid_previews": invalid_previews,
            },
        )

    from app.generation_log import log_generation_step

    log_generation_step(
        "APPLY START",
        review_id=review_id,
        action_count=len(actions),
        workspace_path=str(project_dir),
    )

    try:
        results = apply_actions(project_dir, actions)
    except FileActionError as exc:
        log_generation_step("GENERATION FAILED", stage="apply_actions", error=str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if review.get("is_greenfield"):
        try:
            git_service.ensure_git_repo(project_dir)
            git_service.commit(
                project_dir,
                f"Initial scaffold: {review.get('prompt', 'new project')[:72]}",
                create_snapshot=True,
            )
        except GitServiceError:
            pass

    action_ids = request.action_ids or [
        preview["id"]
        for preview in review["previews"]
        if preview.get("status") == "pending" and preview.get("valid")
    ]
    updated_review = mark_actions(review_id, action_ids, "applied")

    return {
        "status": "applied",
        "results": results,
        "review_session": updated_review,
        "project_name": review.get("workspace_slug") or review["project_name"],
        "workspace_path": review.get("workspace_path"),
        "is_greenfield": review.get("is_greenfield", False),
        "run_profile": review.get("run_profile"),
        "message": f"Applied {len(results)} file operation(s).",
    }


@app.post("/agent/reviews/{review_id}/reject")
async def reject_agent_review(review_id: str, request: ReviewRejectRequest):
    review = reject_review_session(review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review session not found")

    return {
        "status": "rejected",
        "review_session": review,
        "message": request.reason or "Review changes rejected.",
    }


@app.post("/agent/tasks")
async def start_autonomous_agent_task(request: AutonomousAgentStartRequest):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    project_dir = get_project_dir(request.project_name)
    return start_task(
        project_dir,
        request.project_name,
        request.prompt,
        request.model,
        request.max_iterations,
        request.max_context_chars,
    )


@app.get("/agent/tasks/{task_id}")
async def get_autonomous_agent_task(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.post("/agent/tasks/{task_id}/stop")
async def stop_autonomous_agent_task(task_id: str):
    task = request_stop(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.post("/generate")
async def generate(data: PromptRequest):

    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "qwen2.5-coder:7b",
            "prompt": f"""
Return ONLY valid JSON.

Format:

{{
  "files": [
    {{
      "filename": "main.py",
      "content": "..."
    }},
    {{
      "filename": "models.py",
      "content": "..."
    }},
    {{
      "filename": "requirements.txt",
      "content": "..."
    }}
  ]
}}

Do not explain.
Do not use markdown.
Do not use ```json.
Return JSON only.

User request:
{data.prompt}
""",
            "stream": False
        }
    )

    result = response.json()

    print(result["response"])

    try:
        created_files = build_project(
            "generated_project",
            result["response"]
        )

        return {
            "status": "success",
            "files": created_files
        }

    except Exception as e:
        return {
            "error": str(e),
            "raw_response": result["response"]
        }


@app.post("/save-file")
async def save_generated_file(request: FileRequest):

    path = save_file(
        request.project_name,
        request.filename,
        request.content
    )

    return {
        "status": "success",
        "path": path
    }


@app.get("/workspaces")
async def list_workspaces():
    return {"workspaces": list_all_workspaces()}


@app.post("/workspaces/open")
async def open_workspace(request: WorkspaceOpenRequest):
    workspace = register_external_workspace(request.path, name=request.name)
    touch_workspace(workspace["slug"])
    return workspace


@app.post("/workspaces/pick-folder")
async def pick_workspace_folder():
    selected = pick_folder_dialog()
    if not selected:
        return {"cancelled": True}

    workspace = register_external_workspace(selected)
    touch_workspace(workspace["slug"])
    return workspace


@app.get("/projects")
async def list_projects():
    get_workspace_root().mkdir(parents=True, exist_ok=True)
    return {"projects": list_project_slugs()}


@app.get("/projects/{project_name}")
async def get_project_files(project_name: str):

    project_dir = resolve_project_dir(project_name, must_exist=True)
    touch_workspace(project_name)

    files = []
    folders = []

    for item in project_dir.rglob("*"):
        relative = item.relative_to(project_dir)
        if should_skip_path(relative):
            continue
        if item.is_dir():
            folders.append(str(relative))
        elif item.is_file():
            files.append(str(relative))

    entry = get_workspace_entry(project_name)
    kind = entry.get("kind", "managed") if entry else "managed"

    return {
        "project": project_name,
        "path": str(project_dir),
        "kind": kind,
        "files": sorted(files),
        "folders": sorted(folders),
    }


@app.get("/projects/{project_name}/intelligence")
async def get_project_intelligence(project_name: str):
    project_dir = get_project_dir(project_name)
    git_status_payload = {}
    try:
        git_service.ensure_git_repo(project_dir)
        git_status_payload = {
            "branch": git_service.current_branch(project_dir),
            "changes": git_service.status(project_dir).get("changes", []),
        }
    except GitServiceError:
        pass
    return scan_repository(project_dir, git_status=git_status_payload)


@app.post("/projects/{project_name}/index/rebuild")
async def rebuild_project_index(project_name: str):
    project_dir = get_project_dir(project_name)
    from app.workspace_index_service import build_workspace_index

    index = build_workspace_index(project_dir, project_name)
    return {
        "file_count": index["file_count"],
        "symbol_count": index["symbol_count"],
        "built_at": index["built_at"],
    }


@app.get("/projects/{project_name}/index/search")
async def search_project_index(project_name: str, q: str, limit: int = 25):
    project_dir = get_project_dir(project_name)
    index = get_or_build_index(project_dir, project_name)
    return {
        "query": q,
        "results": search_workspace_index(index, q, limit=limit),
        "file_count": index.get("file_count", 0),
        "symbol_count": index.get("symbol_count", 0),
    }


@app.get("/projects/{project_name}/index")
async def get_project_index(project_name: str):
    project_dir = get_project_dir(project_name)
    index = get_or_build_index(project_dir, project_name)
    return {
        "file_count": index.get("file_count", 0),
        "symbol_count": index.get("symbol_count", 0),
        "built_at": index.get("built_at"),
        "files": [entry["path"] for entry in index.get("files", [])[:200]],
    }


@app.post("/projects/{project_name}/terminal/analyze")
async def analyze_project_terminal(project_name: str, request: TerminalAnalyzeRequest):
    _ = project_name
    return analyze_terminal_logs(request.logs)
@app.get("/projects/{project_name}/file")
async def read_file(
    project_name: str,
    path: str
):

    file_path = resolve_workspace_path(project_name, path, must_exist=True)

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    return {
        "filename": path,
        "content": content
    }


@app.post("/projects/{project_name}/file")
async def create_project_file(project_name: str, request: CreateFileRequest):
    file_path = resolve_project_path(project_name, request.path)

    if file_path.exists():
        raise HTTPException(status_code=409, detail="File already exists")

    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(request.content, encoding="utf-8")

    return {
        "status": "created",
        "type": "file",
        "path": request.path
    }


@app.post("/projects/{project_name}/folder")
async def create_project_folder(project_name: str, request: CreateFolderRequest):
    folder_path = resolve_project_path(project_name, request.path)

    if folder_path.exists():
        raise HTTPException(status_code=409, detail="Folder already exists")

    folder_path.mkdir(parents=True, exist_ok=False)

    return {
        "status": "created",
        "type": "folder",
        "path": request.path
    }


@app.patch("/projects/{project_name}/path")
async def rename_project_path(project_name: str, request: RenamePathRequest):
    current_path = resolve_project_path(project_name, request.path)
    new_path = resolve_project_path(project_name, request.new_path)

    if not current_path.exists():
        raise HTTPException(status_code=404, detail="Path not found")

    if new_path.exists():
        raise HTTPException(status_code=409, detail="Destination already exists")

    new_path.parent.mkdir(parents=True, exist_ok=True)
    current_path.rename(new_path)

    return {
        "status": "renamed",
        "from": request.path,
        "to": request.new_path
    }


@app.delete("/projects/{project_name}/path")
async def delete_project_path(project_name: str, path: str):
    target_path = resolve_project_path(project_name, path)
    project_dir = get_project_dir(project_name)

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Path not found")

    if target_path == project_dir:
        raise HTTPException(status_code=400, detail="Cannot delete project root")

    if target_path.is_dir():
        shutil.rmtree(target_path)
        deleted_type = "folder"
    else:
        target_path.unlink()
        deleted_type = "file"

    return {
        "status": "deleted",
        "type": deleted_type,
        "path": path
    }


@app.get("/projects/{project_name}/git/branch")
async def git_current_branch(project_name: str):
    try:
        project_dir = git_project_dir(project_name)
        return {
            "branch": git_service.current_branch(project_dir),
            "branches": git_service.list_branches(project_dir),
        }
    except GitServiceError as exc:
        handle_git_error(exc)


@app.get("/projects/{project_name}/git/status")
async def git_status(project_name: str):
    try:
        return git_service.status(git_project_dir(project_name))
    except GitServiceError as exc:
        handle_git_error(exc)


@app.get("/projects/{project_name}/git/diff")
async def git_diff(project_name: str, path: str | None = None):
    try:
        if path:
            resolve_workspace_path(project_name, path, must_exist=False)
        return git_service.diff(git_project_dir(project_name), path)
    except GitServiceError as exc:
        handle_git_error(exc)


@app.get("/projects/{project_name}/git/history")
async def git_history(project_name: str, limit: int = 30):
    try:
        return {
            "commits": git_service.history(git_project_dir(project_name), limit)
        }
    except GitServiceError as exc:
        handle_git_error(exc)


@app.post("/projects/{project_name}/git/branches")
async def git_create_branch(project_name: str, request: GitBranchRequest):
    try:
        return git_service.create_branch(
            git_project_dir(project_name),
            request.name,
            checkout=request.checkout,
        )
    except GitServiceError as exc:
        handle_git_error(exc)


@app.post("/projects/{project_name}/git/checkout")
async def git_switch_branch(project_name: str, request: GitBranchRequest):
    try:
        return git_service.switch_branch(git_project_dir(project_name), request.name)
    except GitServiceError as exc:
        handle_git_error(exc)


@app.post("/projects/{project_name}/git/commit")
async def git_commit(project_name: str, request: GitCommitRequest):
    try:
        if request.files:
            for file_path in request.files:
                resolve_workspace_path(project_name, file_path, must_exist=False)
        return git_service.commit(
            git_project_dir(project_name),
            request.message,
            files=request.files,
            create_snapshot=request.create_snapshot,
        )
    except GitServiceError as exc:
        handle_git_error(exc)


@app.post("/projects/{project_name}/git/suggest-commit")
async def git_suggest_commit(project_name: str, request: GitSuggestCommitRequest):
    try:
        message = suggest_commit_message(
            project_name,
            request.diff,
            request.changes,
        )
        return {"message": message}
    except OllamaOfflineError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/projects/{project_name}/git/summarize-diff")
async def git_summarize_diff(project_name: str, request: GitSummarizeRequest):
    try:
        summary = summarize_diff(project_name, request.diff)
        return {"summary": summary}
    except OllamaOfflineError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/projects/{project_name}/git/pr-description")
async def git_pr_description(project_name: str, request: GitPrDescriptionRequest):
    try:
        description = explain_changes_for_pr(
            project_name,
            request.diff,
            request.base_branch,
            request.head_branch,
        )
        return {"description": description}
    except OllamaOfflineError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/projects/{project_name}/git/snapshots")
async def git_snapshots(project_name: str):
    try:
        return {
            "snapshots": git_service.snapshots(git_project_dir(project_name))
        }
    except GitServiceError as exc:
        handle_git_error(exc)


@app.post("/projects/{project_name}/git/snapshots")
async def git_create_snapshot(project_name: str, request: GitSnapshotRequest):
    try:
        return git_service.create_snapshot_tag(git_project_dir(project_name), request.name)
    except GitServiceError as exc:
        handle_git_error(exc)


@app.post("/projects/{project_name}/git/restore")
async def git_restore(project_name: str, request: GitRestoreRequest):
    try:
        if request.path:
            resolve_workspace_path(project_name, request.path, must_exist=False)
        return git_service.restore(git_project_dir(project_name), request.ref, request.path)
    except GitServiceError as exc:
        handle_git_error(exc)


@app.post("/projects/{project_name}/git/revert")
async def git_revert(project_name: str, request: GitRevertRequest):
    try:
        return git_service.revert(git_project_dir(project_name), request.commit_hash)
    except GitServiceError as exc:
        handle_git_error(exc)
@app.post("/edit-file")
async def edit_file(request: FileRequest):

    path = save_file(
        request.project_name,
        request.filename,
        request.content
    )

    return {
        "status": "updated",
        "path": path
    }
@app.post("/ai-edit")
async def ai_edit(
    project_name: str,
    filename: str,
    instruction: str
):

    file_path = resolve_workspace_path(project_name, filename, must_exist=True)

    with open(file_path, "r", encoding="utf-8") as f:
        current_code = f.read()

    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "qwen2.5-coder:7b",
            "prompt": f"""
You are editing an existing source file.

Current code:

{current_code}

Instruction:

{instruction}

IMPORTANT RULES:
- Modify the existing code only.
- Keep all existing functionality.
- NEVER replace the framework.
- If current code uses FastAPI, keep FastAPI.
- If current code uses Flask, keep Flask.
- Make the smallest possible change.
- Return the COMPLETE updated file.
- Return ONLY code.

No markdown.
No explanations.
No comments outside code.
""",
            "stream": False
        }
    )

    updated_code = response.json()["response"]

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(updated_code)

    return {
        "status": "updated",
        "filename": filename
    }
@app.get("/project-context/{project_name}")
async def project_context(project_name: str):

    project_dir = resolve_project_dir(project_name, must_exist=True)

    context = {}

    for file in project_dir.rglob("*"):

        if file.is_file():

            relative_path = str(
                file.relative_to(project_dir)
            )

            try:
                with open(file, "r", encoding="utf-8") as f:
                    context[relative_path] = f.read()
            except UnicodeDecodeError:
                continue

    return {
        "project": project_name,
        "files": context
    }
class PlanRequest(BaseModel):
    project_name: str
    instruction: str
@app.post("/ai-plan")
async def ai_plan(request: PlanRequest):

    project_dir = resolve_project_dir(request.project_name, must_exist=True)

    context = ""

    for file in project_dir.rglob("*"):

        if file.is_file():

            try:

                with open(
                    file,
                    "r",
                    encoding="utf-8"
                ) as f:

                    context += f"\nFILE: {file.relative_to(project_dir)}\n"
                    context += f.read()
                    context += "\n"

            except UnicodeDecodeError:
                continue

    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "qwen2.5-coder:7b",
            "prompt": f"""
You are a senior software architect.

Project:

{context}

Instruction:

{request.instruction}

Return ONLY valid JSON:

{{
  "files_to_edit": [
    "file1.py",
    "file2.py"
  ],
  "reason": "short explanation"
}}

No markdown.
JSON only.
""",
            "stream": False
        }
    )

    return response.json()["response"]

@app.post("/ai-apply-plan")
async def ai_apply_plan(request: ApplyPlanRequest):

    resolve_project_dir(request.project_name, must_exist=True)

    updated_files = []

    plan = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "qwen2.5-coder:7b",
            "prompt": f"""
Analyze this instruction:

{request.instruction}

Return ONLY valid JSON in this format:

{{
    "files_to_edit": ["main.py"]
}}

No markdown.
No explanations.
""",
            "stream": False,
        },
    )
    print("PLAN RESPONSE:")
    print(plan.json())
    print("PLAN RESPONSE TEXT:")
    print(plan.json()["response"])

    plan_response = plan.json()["response"].strip()
    if plan_response.startswith("```json"):
        plan_response = plan_response.replace("```json", "", 1)

    if plan_response.startswith("```"):
        plan_response = plan_response.replace("```", "", 1)

    if plan_response.endswith("```"):
        plan_response = plan_response[:-3]

    plan_response = plan_response.strip()

    files_to_edit = json.loads(
        plan_response
    )["files_to_edit"]

    for relative_path in files_to_edit:
        file = resolve_workspace_path(request.project_name, relative_path, must_exist=True)

        if not file.is_file():
                continue

        with open(file, "r", encoding="utf-8") as f:
            current_code = f.read()
        print("CURRENT FILE LENGTH:", len(current_code))
        print("CURRENT FILE:")
        print(current_code[:1000])
        print("CURRENT FILE:")
        print(current_code[:500])
        response = requests.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "qwen2.5-coder:7b",
                    "prompt": f"""
    You are editing an existing source file.

EXISTING FILE CONTENT:

{current_code}

You MUST modify THIS file.

DO NOT create a new application.
DO NOT replace the framework.
DO NOT generate example code.
DO NOT generate a tutorial.

Edit the existing file directly.

Return the FULL modified file.
    Instruction:

    {request.instruction}

    IMPORTANT:
    - Keep the existing framework.
    - Keep existing functionality.
    - Make only required changes.
    - Return COMPLETE updated code.
    - Return ONLY code.

    No markdown.
    No explanations.
    """,
                    "stream": False,
                },
            )

        updated_code = response.json()["response"]
        print("UPDATED CODE:")
        print(updated_code[:1000])
        print("UPDATED FILE LENGTH:", len(updated_code))
        print("RAW AI OUTPUT:")
        print(repr(updated_code[:200]))

        # Cleanup AI output
        updated_code = updated_code.strip()

        if  updated_code.startswith("```python"):
            updated_code = updated_code.replace("```python", "", 1)

        if  updated_code.startswith("```"):
            updated_code = updated_code.replace("```", "", 1)

        if  updated_code.endswith("```"):
            updated_code = updated_code[:-3]

        with open(file, "w", encoding="utf-8") as f:
            f.write(updated_code)

        updated_files.append(relative_path)

    return {
    "status": "success",
    "updated_files": updated_files
    }


@app.post("/projects/{project_name}/run")
async def start_project_run(project_name: str):
    project_dir = get_project_dir(project_name)
    profile = detect_run_profile(project_dir)

    with RUNNING_PROJECTS_LOCK:
        existing_run = RUNNING_PROJECTS.get(project_name)
        if existing_run and existing_run["running"]:
            raise HTTPException(status_code=409, detail="Project is already running")

    run_info = {
        "process": None,
        "running": True,
        "returncode": None,
        "entrypoint": profile.get("entrypoint") or profile.get("start_command"),
        "logs": [],
    }

    def log_callback(stream: str, message: str):
        append_run_log(run_info, stream, message)

    try:
        run_install_if_needed(project_dir, profile, log_callback)
        process = start_project_process(project_dir, profile)
    except HTTPException:
        with RUNNING_PROJECTS_LOCK:
            RUNNING_PROJECTS.pop(project_name, None)
        raise

    run_info["process"] = process
    run_info["logs"].append({
        "stream": "system",
        "message": f"Started {run_info['entrypoint']}\n",
    })

    with RUNNING_PROJECTS_LOCK:
        RUNNING_PROJECTS[project_name] = run_info

    threading.Thread(
        target=read_process_stream,
        args=(run_info, "stdout", process.stdout),
        daemon=True,
    ).start()
    threading.Thread(
        target=read_process_stream,
        args=(run_info, "stderr", process.stderr),
        daemon=True,
    ).start()
    threading.Thread(
        target=monitor_process,
        args=(project_name, run_info),
        daemon=True,
    ).start()

    return get_run_info(project_name)


@app.get("/projects/{project_name}/run")
async def project_run_status(project_name: str):
    get_project_dir(project_name)
    return get_run_info(project_name)


@app.get("/projects/{project_name}/run/stream")
async def stream_project_run(project_name: str):
    get_project_dir(project_name)

    async def event_stream():
        index = 0

        while True:
            with RUNNING_PROJECTS_LOCK:
                run_info = RUNNING_PROJECTS.get(project_name)

                if not run_info:
                    logs = [{
                        "stream": "system",
                        "message": "Project is not running\n",
                    }]
                    running = False
                    return_code = None
                    missing_run = True
                else:
                    logs = list(run_info["logs"])
                    running = run_info["running"]
                    return_code = run_info["returncode"]
                    missing_run = False

            if missing_run:
                payload = {
                    **logs[0],
                    "running": running,
                    "returncode": return_code,
                }
                yield f"data: {json.dumps(payload)}\n\n"
                break

            while index < len(logs):
                payload = {
                    **logs[index],
                    "running": running,
                    "returncode": return_code,
                }
                yield f"data: {json.dumps(payload)}\n\n"
                index += 1

            if not running:
                break

            await asyncio.sleep(0.2)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/projects/{project_name}/stop")
async def stop_project_run(project_name: str):
    get_project_dir(project_name)

    with RUNNING_PROJECTS_LOCK:
        run_info = RUNNING_PROJECTS.get(project_name)

    if not run_info or not run_info["running"]:
        return get_run_info(project_name)

    process = run_info["process"]
    process.terminate()

    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()

    append_run_log(run_info, "system", "Stop requested\n")

    return get_run_info(project_name)


@app.post("/run-project")
async def run_project(project_name: str):

    project_dir = resolve_project_dir(project_name, must_exist=True)

    try:

        import sys
        
        result = subprocess.run(
            [sys.executable, "-X", "utf8", "main.py"],
            cwd=str(project_dir),
            capture_output=True,
            text=True,
            timeout=20,
            encoding="utf-8",
            errors="ignore"
        )

        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }

    except Exception as e:
        return {
            "error": str(e)
        }
        
@app.post("/ai-run-fix")
async def ai_run_fix(request: RunFixRequest):

    plan_result = await ai_plan(
        PlanRequest(
            project_name=request.project_name,
            instruction=request.instruction
        )
    )

    apply_result = await ai_apply_plan(
        ApplyPlanRequest(
            project_name=request.project_name,
            instruction=request.instruction
        )
    )

    run_result = await run_project(
        request.project_name
    )

    return {
        "plan": plan_result,
        "apply": apply_result,
        "run": run_result
    }