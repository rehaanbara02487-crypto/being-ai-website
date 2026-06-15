"""Autonomous sandboxed agent loop for end-to-end coding tasks."""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
import uuid

from app.agent_file_actions import plan_file_actions
from app.config import get_settings
from app.file_action_tools import apply_actions, preview_actions
from app.project_runner import detect_run_profile, run_install_if_needed
from app.repository_context import get_repository_context_for_request
from app.repository_indexer import should_skip_path


TASKS: dict[str, dict] = {}
TASKS_LOCK = threading.Lock()


def get_agent_run_root() -> Path:
    return get_settings().beingai_workspace_root.parent / ".agent_runs"


def create_task(
    project_name: str,
    prompt: str,
    model: str | None,
    max_iterations: int,
    max_context_chars: int | None,
    *,
    opened_file: str | None = None,
    selected_folder: str | None = None,
    auto_apply: bool = True,
) -> dict:
    task_id = str(uuid.uuid4())
    task = {
        "id": task_id,
        "project_name": project_name,
        "prompt": prompt,
        "model": model,
        "max_iterations": max(1, min(max_iterations, 6)),
        "max_context_chars": max_context_chars,
        "opened_file": opened_file,
        "selected_folder": selected_folder,
        "auto_apply": auto_apply,
        "status": "queued",
        "current_step": "Queued",
        "iteration": 0,
        "events": [],
        "logs": [],
        "final_plan": None,
        "error": None,
        "stopped": False,
        "created_at": time.time(),
        "updated_at": time.time(),
    }

    with TASKS_LOCK:
        TASKS[task_id] = task

    return task


def get_task(task_id: str) -> dict | None:
    with TASKS_LOCK:
        task = TASKS.get(task_id)
        return None if task is None else serialize_task(task)


def request_stop(task_id: str) -> dict | None:
    with TASKS_LOCK:
        task = TASKS.get(task_id)
        if not task:
            return None
        task["stopped"] = True
        task["status"] = "stopping"
        task["current_step"] = "Stopping"
        add_event_locked(task, "stop_requested", "Stop requested")
        return serialize_task(task)


def serialize_task(task: dict) -> dict:
    return {
        key: value
        for key, value in task.items()
        if key not in {"sandbox_dir"}
    }


def add_event_locked(task: dict, event_type: str, message: str, **extra):
    task["events"].append({
        "type": event_type,
        "message": message,
        "timestamp": time.time(),
        **extra,
    })
    task["updated_at"] = time.time()


def add_event(task: dict, event_type: str, message: str, **extra):
    with TASKS_LOCK:
        add_event_locked(task, event_type, message, **extra)


def add_log(task: dict, stream: str, message: str):
    with TASKS_LOCK:
        task["logs"].append({
            "stream": stream,
            "message": message,
            "timestamp": time.time(),
        })
        task["updated_at"] = time.time()


def set_task_state(task: dict, status: str | None = None, current_step: str | None = None, **extra):
    with TASKS_LOCK:
        if status:
            task["status"] = status
        if current_step:
            task["current_step"] = current_step
        task.update(extra)
        task["updated_at"] = time.time()


def is_stopped(task: dict) -> bool:
    with TASKS_LOCK:
        return bool(task["stopped"])


def start_task(
    project_dir: Path,
    project_name: str,
    prompt: str,
    model: str | None,
    max_iterations: int,
    max_context_chars: int | None,
    *,
    opened_file: str | None = None,
    selected_folder: str | None = None,
    auto_apply: bool = True,
) -> dict:
    task = create_task(
        project_name,
        prompt,
        model,
        max_iterations,
        max_context_chars,
        opened_file=opened_file,
        selected_folder=selected_folder,
        auto_apply=auto_apply,
    )
    worker = threading.Thread(
        target=run_task,
        args=(task, project_dir),
        daemon=True,
    )
    worker.start()
    return serialize_task(task)


def copy_project_to_sandbox(project_dir: Path, task_id: str) -> Path:
    run_root = get_agent_run_root()
    run_root.mkdir(parents=True, exist_ok=True)
    sandbox_dir = run_root / task_id

    if sandbox_dir.exists():
        shutil.rmtree(sandbox_dir)

    shutil.copytree(project_dir, sandbox_dir)
    return sandbox_dir


def get_entrypoint(project_dir: Path) -> Path | None:
    for filename in ("main.py", "app.py"):
        entrypoint = project_dir / filename
        if entrypoint.is_file():
            return entrypoint
    return None


def run_sandbox_project(task: dict, sandbox_dir: Path) -> tuple[int, str, str]:
    try:
        profile = detect_run_profile(sandbox_dir)
    except Exception as exc:  # noqa: BLE001 - fallback to python entrypoints
        add_log(task, "stderr", f"{exc}\n")
        profile = None

    if profile and profile.get("type") == "npm":
        try:
            run_install_if_needed(sandbox_dir, profile, lambda stream, message: add_log(task, stream, message))
        except Exception as exc:  # noqa: BLE001
            return 1, "", f"{exc}\n"

        add_log(task, "system", f"Running {profile['start_command']}\n")
        process = subprocess.Popen(
            profile["start_command"],
            cwd=str(sandbox_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="ignore",
            shell=True,
        )
    else:
        entrypoint = get_entrypoint(sandbox_dir)
        if not entrypoint:
            return 1, "", "Project must contain package.json or main.py/app.py\n"

        add_log(task, "system", f"Running {entrypoint.name}\n")
        process = subprocess.Popen(
            [sys.executable, "-u", entrypoint.name],
            cwd=str(sandbox_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )

    try:
        stdout, stderr = process.communicate(timeout=25)
    except subprocess.TimeoutExpired:
        process.kill()
        stdout, stderr = process.communicate()
        stderr = f"{stderr or ''}Run timed out after 25 seconds\n"

    if stdout:
        add_log(task, "stdout", stdout)
    if stderr:
        add_log(task, "stderr", stderr)

    add_log(task, "system", f"Run exited with code {process.returncode}\n")
    return process.returncode, stdout or "", stderr or ""


def safe_run_sandbox_project(task: dict, sandbox_dir: Path) -> tuple[int, str, str]:
    try:
        return run_sandbox_project(task, sandbox_dir)
    except subprocess.TimeoutExpired:
        add_log(task, "stderr", "Run timed out after 20 seconds\n")
        return 124, "", "Run timed out after 20 seconds\n"


def list_relative_files(project_dir: Path) -> set[str]:
    files = set()
    for path in project_dir.rglob("*"):
        relative_path = path.relative_to(project_dir)
        if path.is_file() and not should_skip_path(relative_path):
            files.add(relative_path.as_posix())
    return files


def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None


def build_final_actions(real_dir: Path, sandbox_dir: Path) -> list[dict]:
    real_files = list_relative_files(real_dir)
    sandbox_files = list_relative_files(sandbox_dir)
    actions = []

    for relative_path in sorted(sandbox_files - real_files):
        content = read_text(sandbox_dir / relative_path)
        if content is not None:
            actions.append({
                "tool": "create_file",
                "args": {
                    "path": relative_path,
                    "content": content,
                },
            })

    for relative_path in sorted(real_files & sandbox_files):
        real_content = read_text(real_dir / relative_path)
        sandbox_content = read_text(sandbox_dir / relative_path)
        if real_content is not None and sandbox_content is not None and real_content != sandbox_content:
            actions.append({
                "tool": "edit_file",
                "args": {
                    "path": relative_path,
                    "content": sandbox_content,
                },
            })

    for relative_path in sorted(real_files - sandbox_files):
        actions.append({
            "tool": "delete_file",
            "args": {
                "path": relative_path,
            },
        })

    for folder in sorted(path for path in sandbox_dir.rglob("*") if path.is_dir()):
        relative_path = folder.relative_to(sandbox_dir)
        if should_skip_path(relative_path):
            continue
        real_folder = real_dir / relative_path
        if not real_folder.exists() and not any(folder.iterdir()):
            actions.append({
                "tool": "create_folder",
                "args": {
                    "path": relative_path.as_posix(),
                },
            })

    return actions


def build_change_summary(previews: list[dict]) -> dict:
    valid_previews = [preview for preview in previews if preview.get("valid")]
    return {
        "files_changed": len({
            preview["new_path"] or preview["path"]
            for preview in valid_previews
            if preview.get("tool") != "create_folder"
        }),
        "folders_changed": len([
            preview
            for preview in valid_previews
            if preview.get("tool") == "create_folder"
        ]),
        "lines_added": sum(preview.get("lines_added", 0) for preview in valid_previews),
        "lines_removed": sum(preview.get("lines_removed", 0) for preview in valid_previews),
    }


def finish_with_final_plan(task: dict, real_dir: Path, sandbox_dir: Path, status: str):
    final_actions = build_final_actions(real_dir, sandbox_dir)
    previews = preview_actions(real_dir, final_actions)
    set_task_state(
        task,
        status=status,
        current_step="Final review ready",
        final_plan={
            "message": "Review the autonomous agent changes before applying.",
            "tool_calls": final_actions,
            "previews": previews,
            "change_summary": build_change_summary(previews),
            "requires_approval": True,
        },
    )
    add_event(task, "final_review", "Final diff is ready for approval", files_changed=len(final_actions))


def run_task(task: dict, project_dir: Path):
    sandbox_dir = None
    previous_error = ""

    try:
        set_task_state(task, status="running", current_step="Analyzing repository")
        add_event(task, "analyze", "Analyzing repository")
        sandbox_dir = copy_project_to_sandbox(project_dir, task["id"])
        task["sandbox_dir"] = str(sandbox_dir)

        for iteration in range(1, task["max_iterations"] + 1):
            if is_stopped(task):
                set_task_state(task, status="stopped", current_step="Stopped")
                add_event(task, "stopped", "Task stopped by user")
                return

            set_task_state(task, current_step="Planning changes", iteration=iteration)
            add_event(task, "plan", f"Planning iteration {iteration}", iteration=iteration)

            prompt = task["prompt"]
            if previous_error:
                prompt = f"{prompt}\n\nPrevious run failed. Fix this error:\n{previous_error[-4000:]}"

            context_payload = get_repository_context_for_request(
                sandbox_dir,
                task["project_name"],
                prompt,
                task["max_context_chars"] or get_settings().ollama_context_char_limit,
                opened_file=task.get("opened_file"),
                selected_folder=task.get("selected_folder"),
            )
            plan = plan_file_actions(
                sandbox_dir,
                prompt,
                repository_context=context_payload["context"],
                model=task["model"],
            )
            valid_actions = [
                {
                    "tool": preview["tool"],
                    "args": preview["args"],
                }
                for preview in plan["previews"]
                if preview.get("valid")
            ]

            if valid_actions:
                set_task_state(task, current_step="Applying sandbox changes")
                add_event(task, "apply_sandbox", f"Applying {len(valid_actions)} sandbox action(s)", iteration=iteration)
                apply_actions(sandbox_dir, valid_actions)
            else:
                add_event(task, "no_changes", "Planner returned no valid file actions", iteration=iteration)

            if is_stopped(task):
                set_task_state(task, status="stopped", current_step="Stopped")
                add_event(task, "stopped", "Task stopped by user")
                return

            set_task_state(task, current_step="Running project")
            add_event(task, "run", f"Running project iteration {iteration}", iteration=iteration)
            returncode, stdout, stderr = safe_run_sandbox_project(task, sandbox_dir)

            if returncode == 0:
                add_event(task, "success", "Project ran successfully", iteration=iteration)
                finish_with_final_plan(task, project_dir, sandbox_dir, status="review")
                return

            previous_error = stderr or stdout or f"Process exited with code {returncode}"
            add_event(task, "error", "Run failed; retrying if attempts remain", iteration=iteration, returncode=returncode)

        add_event(task, "max_iterations", "Max iterations reached; final review is based on latest sandbox state")
        finish_with_final_plan(task, project_dir, sandbox_dir, status="review")

    except Exception as exc:  # noqa: BLE001 - task state should capture any agent failure
        set_task_state(task, status="failed", current_step="Failed", error=str(exc))
        add_event(task, "failed", str(exc))
