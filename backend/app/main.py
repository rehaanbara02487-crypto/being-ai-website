from pathlib import Path
import json 
import shutil
import subprocess

from app.project_builder import build_project
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests

from app.schemas import CreateFileRequest, CreateFolderRequest, FileRequest, RenamePathRequest
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
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


WORKSPACE_ROOT = Path("data/workspaces")


def get_project_dir(project_name: str) -> Path:
    project_dir = (WORKSPACE_ROOT / project_name).resolve()

    if not project_dir.exists() or not project_dir.is_dir():
        raise HTTPException(status_code=404, detail="Project not found")

    return project_dir


def resolve_project_path(project_name: str, relative_path: str) -> Path:
    if not relative_path or not relative_path.strip():
        raise HTTPException(status_code=400, detail="Path is required")

    requested_path = Path(relative_path)
    if requested_path.is_absolute():
        raise HTTPException(status_code=400, detail="Absolute paths are not allowed")

    project_dir = get_project_dir(project_name)
    target_path = (project_dir / requested_path).resolve()

    try:
        target_path.relative_to(project_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail="Path escapes project workspace")

    return target_path


class PromptRequest(BaseModel):
    prompt: str

class PlanRequest(BaseModel):
    project_name: str
    instruction: str

class ApplyPlanRequest(BaseModel):
    project_name: str
    instruction: str
    
class RunFixRequest(BaseModel):
    project_name: str
    instruction: str
@app.get("/")
async def root():
    return {
        "status": "running",
        "name": "BeingAI Engineer"
    }


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


@app.get("/projects")
async def list_projects():

    workspace = WORKSPACE_ROOT

    projects = []

    for item in workspace.iterdir():
        if item.is_dir():
            projects.append(item.name)

    return {
        "projects": projects
    }


@app.get("/projects/{project_name}")
async def get_project_files(project_name: str):

    project_dir = WORKSPACE_ROOT / project_name

    if not project_dir.exists():
        return {
            "error": "Project not found"
        }

    files = []
    folders = []

    for item in project_dir.rglob("*"):
        if item.is_dir():
            folders.append(str(item.relative_to(project_dir)))
        elif item.is_file():
            files.append(str(item.relative_to(project_dir)))

    return {
        "project": project_name,
        "files": sorted(files),
        "folders": sorted(folders)
    }
@app.get("/projects/{project_name}/file")
async def read_file(
    project_name: str,
    path: str
):

    from pathlib import Path

    file_path = (
        Path("data/workspaces")
        / project_name
        / path
    )

    if not file_path.exists():
        return {
            "error": "File not found"
        }

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

    file_path = (
        Path("data/workspaces")
        / project_name
        / filename
    )

    if not file_path.exists():
        return {
            "error": "File not found"
        }

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

    project_dir = Path("data/workspaces") / project_name

    if not project_dir.exists():
        return {
            "error": "Project not found"
        }

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

    project_dir = (
        Path("data/workspaces")
        / request.project_name
    )

    if not project_dir.exists():
        return {
            "error": "Project not found"
        }

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

    project_dir = (
        Path("data/workspaces")
        / request.project_name
    )

    if not project_dir.exists():
        return {
            "error": "Project not found"
        }

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
        file = project_dir / relative_path

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
@app.post("/run-project")
async def run_project(project_name: str):

    project_dir = Path("data/workspaces") / project_name

    if not project_dir.exists():
        return {"error": "Project not found"}

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