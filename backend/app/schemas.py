from pydantic import BaseModel


class FileRequest(BaseModel):
    project_name: str
    filename: str
    content: str


class CreateFileRequest(BaseModel):
    path: str
    content: str = ""


class CreateFolderRequest(BaseModel):
    path: str


class RenamePathRequest(BaseModel):
    path: str
    new_path: str


class OllamaChatRequest(BaseModel):
    prompt: str
    model: str | None = None
    system_prompt: str | None = None
    project_name: str | None = None
    use_workspace_context: bool = False
    max_context_chars: int | None = None
    opened_file: str | None = None
    selected_folder: str | None = None


class AgentFileActionPlanRequest(BaseModel):
    project_name: str
    prompt: str
    model: str | None = None
    use_workspace_context: bool = True
    max_context_chars: int | None = None
    opened_file: str | None = None
    selected_folder: str | None = None
    auto_apply: bool = False


class AgentFileActionApplyRequest(BaseModel):
    project_name: str
    actions: list[dict]
    prompt: str | None = None


class ReviewApplyRequest(BaseModel):
    action_ids: list[str] | None = None


class ReviewRejectRequest(BaseModel):
    reason: str | None = None


class AutonomousAgentStartRequest(BaseModel):
    project_name: str
    prompt: str
    model: str | None = None
    max_iterations: int = 3
    max_context_chars: int | None = None
    opened_file: str | None = None
    selected_folder: str | None = None
    auto_apply: bool = True


class ProjectPlanRequest(BaseModel):
    prompt: str
    project_name: str | None = None
    model: str | None = None
    stack: str | None = None
    target: str = "default"
    target_path: str | None = None
    current_workspace: str | None = None
    auto_apply: bool = False


class WorkspaceOpenRequest(BaseModel):
    path: str
    name: str | None = None


class GitBranchRequest(BaseModel):
    name: str
    checkout: bool = True


class GitCommitRequest(BaseModel):
    message: str
    files: list[str] | None = None
    create_snapshot: bool = True


class GitRestoreRequest(BaseModel):
    ref: str
    path: str | None = None


class GitRevertRequest(BaseModel):
    commit_hash: str


class GitSnapshotRequest(BaseModel):
    name: str | None = None