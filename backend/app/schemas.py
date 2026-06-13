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


class AgentFileActionPlanRequest(BaseModel):
    project_name: str
    prompt: str
    model: str | None = None
    use_workspace_context: bool = True
    max_context_chars: int | None = None


class AgentFileActionApplyRequest(BaseModel):
    project_name: str
    actions: list[dict]
    prompt: str | None = None


class AutonomousAgentStartRequest(BaseModel):
    project_name: str
    prompt: str
    model: str | None = None
    max_iterations: int = 3
    max_context_chars: int | None = None