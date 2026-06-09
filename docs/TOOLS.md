# BeingAI — Tool System

## 1. Design Goals

| Goal | How |
|------|-----|
| **Uniform interface** | All tools implement `BaseTool` with schema-validated I/O |
| **Agent-scoped access** | Each agent gets a subset of tools via registry |
| **Auditable** | Every invocation logged to `run_events` + domain tables |
| **Safe by default** | Path sandbox, command policy, confirmation gates |
| **Testable** | Tools accept injectable backends (mock FS, mock shell) |

## 2. Tool Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Tool Registry                         │
│  register(tool) · get_for_agent(agent) · dispatch()   │
└─────────────────────────┬───────────────────────────────┘
                          │
     ┌────────────────────┼────────────────────┐
     ▼                    ▼                    ▼
┌──────────┐        ┌──────────┐        ┌──────────┐
│ BaseTool │        │ Middleware│       │ Backends │
│ protocol │───────►│  chain   │───────►│ (real)   │
└──────────┘        └──────────┘        └──────────┘
                     · audit_log
                     · path_sandbox
                     · rate_limit
                     · confirm_gate
```

## 3. Base Tool Protocol

```python
class ToolResult(BaseModel):
    success: bool
    data: dict | list | str | None = None
    error: str | None = None
    metadata: dict = {}

class BaseTool(ABC):
    name: str
    description: str
    parameters: type[BaseModel]          # JSON schema for LLM

    @abstractmethod
    async def execute(self, ctx: ToolContext, params: BaseModel) -> ToolResult: ...

class ToolContext(BaseModel):
    project_id: str
    run_id: str
    workspace_path: str
    agent: str
    config: Settings
```

Tools are exposed to LangChain/LangGraph via `StructuredTool.from_function` or native `@tool` decorators with Pydantic args.

## 4. Tool Catalog

### 4.1 Filesystem Tools

| Tool | Agent(s) | Description |
|------|----------|-------------|
| `read_file` | Coder, Debug, Planner | Read file content with optional line range |
| `write_file` | Coder | Create or overwrite file; creates parent dirs |
| `edit_file` | Coder, Debug | Apply search/replace or patch hunks |
| `delete_file` | Coder | Remove file (confirmation if outside staging) |
| `list_dir` | Coder, Planner, Debug | List directory tree (depth-limited) |
| `search_files` | Coder, Debug | Grep/ripgrep across workspace |
| `file_exists` | All | Check path existence |

**Sandbox rule:** Resolve all paths relative to `workspace_path`. Reject `..` traversal and paths outside workspace root.

```python
def resolve_safe_path(workspace: Path, relative: str) -> Path:
    target = (workspace / relative).resolve()
    if not target.is_relative_to(workspace.resolve()):
        raise PathSandboxError(f"Path escapes workspace: {relative}")
    return target
```

### 4.2 Terminal Tools

| Tool | Agent(s) | Description |
|------|----------|-------------|
| `run_command` | Terminal, Debug | Execute shell command in workspace |
| `run_command_streaming` | Terminal | Same, but yields stdout/stderr chunks |
| `which` | Terminal | Locate executable |
| `get_cwd` | Terminal | Confirm working directory |

**Execution model:**

```python
class RunCommandParams(BaseModel):
    command: str
    timeout_seconds: int = 300
    env: dict[str, str] = {}
```

- Uses `asyncio.create_subprocess_shell` with `cwd=workspace_path`
- Captures stdout/stderr (streamed to `run_events`)
- Persists to `commands_executed`
- On non-zero exit: creates `errors` row with parsed context

**Command policy (optional):**

```python
BLOCKED_PATTERNS = [
    r"rm\s+-rf\s+/",
    r"format\s+[a-z]:",
    r"mkfs\.",
]
# Allowlist mode: only commands matching prefixes in BEINGAI_COMMAND_ALLOWLIST
```

### 4.3 Git Tools

| Tool | Agent(s) | Description |
|------|----------|-------------|
| `git_status` | GitHub, Debug | Porcelain status |
| `git_init` | GitHub | Initialize repo |
| `git_add` | GitHub | Stage paths |
| `git_commit` | GitHub | Commit with message |
| `git_log` | GitHub, Memory | Recent commits |
| `git_diff` | Debug | Show changes |

**Implementation:** GitPython wrapper with audit logging to `git_operations`.

### 4.4 GitHub API Tools

| Tool | Agent(s) | Description |
|------|----------|-------------|
| `github_create_repo` | GitHub | Create remote via REST or `gh` CLI |
| `github_push` | GitHub | Push to origin |
| `github_get_user` | GitHub | Validate token |
| `github_set_remote` | GitHub | Add origin URL |

**Auth:** `GITHUB_TOKEN` from settings table or env. Never expose token to generated project code.

**Safety:** No force push to protected branches without `confirm_destructive=true` in tool params.

### 4.5 VS Code Integration Tools

| Tool | Agent(s) | Description |
|------|----------|-------------|
| `vscode_open_folder` | Coder | Open workspace in VS Code (`code <path>`) |
| `vscode_open_file` | Coder, Debug | Open file at optional line |
| `vscode_run_task` | Terminal | Execute tasks.json task (if present) |

**Implementation:** Invoke `code` CLI. Graceful no-op if VS Code not installed.

Optional future: Language Server Protocol bridge for diagnostics.

### 4.6 Memory Tools

| Tool | Agent(s) | Description |
|------|----------|-------------|
| `memory_search` | Planner, Coder, Debug | Query memory_entries by keyword/type |
| `memory_store` | Memory | Persist new memory entry |
| `memory_get_project_context` | Planner | Bundle relevant memories for project |
| `memory_store_adr` | Memory, Planner | Write architecture_decisions row |

**Search (v1):** SQL `LIKE` + type filter. **Future:** sqlite-vec or local embedding index.

## 5. Agent → Tool Matrix

| Tool | Planner | Coder | Terminal | Debug | GitHub | Memory |
|------|:-------:|:-----:|:--------:|:-----:|:------:|:------:|
| read_file | ✓ | ✓ | | ✓ | | |
| write_file | | ✓ | | ✓ | | |
| edit_file | | ✓ | | ✓ | | |
| list_dir | ✓ | ✓ | | ✓ | | |
| search_files | | ✓ | | ✓ | | |
| run_command | | | ✓ | ✓ | | |
| git_* | | | | | ✓ | |
| github_* | | | | | ✓ | |
| vscode_* | | ✓ | | ✓ | | |
| memory_* | ✓ | | | | | ✓ |

## 6. Middleware Chain

Every tool passes through middleware before/after execution:

### 6.1 `AuditMiddleware`

```python
async def before(ctx, tool, params):
    emit_event("tool_call", tool=tool.name, args=params.model_dump())

async def after(ctx, tool, params, result):
    emit_event("tool_result", tool=tool.name, result=result.model_dump())
```

### 6.2 `PathSandboxMiddleware`

Applies to all filesystem tools. Validates resolved paths.

### 6.3 `ConfirmGateMiddleware`

Blocks tools flagged `requires_confirmation` until UI sends approval:

- `delete_file` on non-generated paths
- `github_push` when `auto_push=false`
- Commands matching `BLOCKED_PATTERNS`

Sets `GraphState.awaiting_user = True`.

### 6.4 `RateLimitMiddleware`

- Max 100 tool calls per agent per run (configurable)
- Max 10 concurrent `run_command` (sequential by default)

## 7. Registry API

```python
# tools/registry.py

class ToolRegistry:
    def register(self, tool: BaseTool) -> None: ...
    def get_for_agent(self, agent: AgentName) -> list[BaseTool]: ...
    async def dispatch(self, ctx: ToolContext, name: str, params: dict) -> ToolResult: ...

# Singleton initialized at app startup
registry = ToolRegistry()
registry.register(ReadFileTool())
# ...
```

## 8. Error Handling

| Error type | Tool response | Graph behavior |
|------------|---------------|----------------|
| `PathSandboxError` | `success=false` | Coder retries with valid path |
| `CommandTimeoutError` | `success=false` | Debug agent invoked |
| `GitHubAuthError` | `success=false` | Pause for user token refresh |
| `ToolNotFoundError` | HTTP 400 at API level | N/A |

All errors include `error` string safe to pass back to LLM (no secrets).

## 9. Testing Strategy

```python
# tests/tools/test_filesystem.py

@pytest.fixture
def mock_workspace(tmp_path):
    return ToolContext(workspace_path=tmp_path, ...)

async def test_write_file_sandbox_escape(mock_workspace):
    tool = WriteFileTool()
    result = await tool.execute(mock_workspace, WriteParams(path="../../etc/passwd", ...))
    assert not result.success
```

Use `FakeTerminalBackend` recording commands without subprocess for unit tests.

## 10. File Layout

```
backend/app/tools/
├── __init__.py
├── base.py              # BaseTool, ToolContext, ToolResult
├── registry.py          # ToolRegistry + agent matrix
├── middleware/
│   ├── audit.py
│   ├── sandbox.py
│   └── confirm.py
├── filesystem.py
├── terminal.py
├── git.py
├── github_api.py
├── vscode.py
└── memory_store.py
```
