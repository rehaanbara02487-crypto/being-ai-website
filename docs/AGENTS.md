# BeingAI — Agent Architecture

## 1. Orchestration Model

BeingAI uses **LangGraph** with a **supervisor pattern**: one routing node decides which specialist agent runs next based on `GraphState`. Agents do not call each other directly; they mutate shared state and return control to the supervisor.

```
                    ┌──────────────┐
                    │  SUPERVISOR  │
                    └──────┬───────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      ┌─────────┐    ┌─────────┐    ┌──────────┐
      │ PLANNER │    │  CODER  │    │ TERMINAL │
      └─────────┘    └────┬────┘    └────┬─────┘
                          │              │
                          ▼              ▼
                     ┌─────────┐   ┌─────────┐
                     │  DEBUG  │   │ GITHUB  │
                     └─────────┘   └────┬────┘
                                        │
                                        ▼
                                  ┌─────────┐
                                  │ MEMORY  │
                                  └─────────┘
```

## 2. Graph State (`GraphState`)

Central TypedDict passed between all nodes. Persisted snapshots after each node for recovery.

```python
class GraphState(TypedDict):
    # Identity
    project_id: str
    session_id: str
    run_id: str

    # User intent
    user_request: str
    project_type: str | None          # e.g. "flutter", "nextjs", inferred by planner

    # Planning
    plan: Plan | None                 # Structured implementation plan
    current_step_index: int
    plan_status: Literal["pending", "in_progress", "complete", "failed"]

    # Execution context
    workspace_path: str
    files_touched: list[str]
    last_command: CommandResult | None
    last_error: ErrorContext | None
    retry_count: int

    # Agent coordination
    next_agent: AgentName | None      # Set by supervisor
    messages: list[AgentMessage]      # Internal agent conversation
    tool_results: list[ToolResult]

    # Outcomes
    status: Literal["running", "success", "failed", "cancelled"]
    summary: str | None
```

## 3. Agent Specifications

### 3.1 Supervisor

| Attribute | Value |
|-----------|-------|
| **Role** | Route to the correct agent; enforce max retries; detect completion |
| **Inputs** | Full `GraphState` |
| **Outputs** | `next_agent`, optional `status` transition |
| **Tools** | None (pure routing logic + optional lightweight LLM for ambiguous cases) |

**Routing rules (deterministic first, LLM fallback):**

```
IF plan is None                          → PLANNER
ELIF current_step needs file changes     → CODER
ELIF current_step needs shell commands   → TERMINAL
ELIF last_command.failed AND retry < max  → DEBUG
ELIF plan complete AND github_enabled     → GITHUB
ELIF plan complete                       → MEMORY → END
ELIF retry_count >= max                  → END (failed)
```

### 3.2 Planner Agent

| Attribute | Value |
|-----------|-------|
| **Role** | Decompose natural language into an executable plan |
| **Inputs** | `user_request`, memory context (prior projects, conventions) |
| **Outputs** | `Plan` object, `project_type`, initial folder structure spec |
| **Tools** | `memory_search`, `list_workspace` (read-only) |

**Plan schema:**

```python
class PlanStep(BaseModel):
    id: str
    title: str
    description: str
    type: Literal["scaffold", "file", "command", "verify", "git"]
    files: list[FileSpec] | None
    commands: list[str] | None
    success_criteria: str
    depends_on: list[str] = []

class Plan(BaseModel):
    title: str
    summary: str
    tech_stack: dict[str, str]
    architecture_notes: str
    folder_structure: list[str]          # Expected paths
    steps: list[PlanStep]
    estimated_commands: list[str]
```

**Example output for "Build a Flutter expense tracker":**

- Phase 1: `flutter create`, folder layout
- Phase 2: Models (Expense), repository, SQLite/Hive
- Phase 3: UI screens (list, add, charts)
- Phase 4: `flutter analyze`, `flutter test`
- Phase 5: Git init + commit

### 3.3 Coder Agent

| Attribute | Value |
|-----------|-------|
| **Role** | Create and modify source files per plan step |
| **Inputs** | Current `PlanStep`, workspace tree, relevant file contents |
| **Outputs** | File writes/edits via tools; updates `files_touched` |
| **Tools** | `read_file`, `write_file`, `edit_file`, `list_dir`, `search_files` |

**Behavior:**

- Works one plan step (or sub-batch) at a time
- Reads existing files before editing (no blind overwrites)
- Emits diffs to event stream for UI
- Respects `architecture_notes` from plan and memory

### 3.4 Terminal Agent

| Attribute | Value |
|-----------|-------|
| **Role** | Execute shell commands in project workspace |
| **Inputs** | Commands from plan step or debug fix |
| **Outputs** | `CommandResult` (stdout, stderr, exit_code, duration) |
| **Tools** | `run_command`, `which`, `get_env` |

**Behavior:**

- Always `cd` to `workspace_path` before execution
- Streams output in real time
- Parses common error patterns (npm, pip, flutter, cargo) for structured `ErrorContext`
- Never runs commands outside allowlist if configured

### 3.5 Debug Agent

| Attribute | Value |
|-----------|-------|
| **Role** | Diagnose failures and produce fix instructions |
| **Inputs** | `last_error`, `last_command`, relevant files, plan context |
| **Outputs** | `FixAction` list (file patches and/or commands) |
| **Tools** | `read_file`, `search_files`, `run_command` (diagnostic only) |

**FixAction schema:**

```python
class FixAction(BaseModel):
    type: Literal["edit_file", "write_file", "run_command", "skip_step"]
    target: str
    payload: str
    rationale: str
```

After producing fixes, supervisor routes back to **Coder** or **Terminal** as appropriate. Increments `retry_count`.

### 3.6 GitHub Agent

| Attribute | Value |
|-----------|-------|
| **Role** | Version control and remote publishing |
| **Inputs** | Completed project, user GitHub settings |
| **Outputs** | Repo URL, commit SHAs |
| **Tools** | `git_init`, `git_add`, `git_commit`, `git_push`, `github_create_repo` |

**Behavior:**

- Creates meaningful commit messages from plan summary
- Milestone commits during build (optional, configurable)
- Push only when `BEINGAI_AUTO_PUSH=true` or user confirms in UI
- Never force-push to `main` without explicit flag

### 3.7 Memory Agent

| Attribute | Value |
|-----------|-------|
| **Role** | Persist learnings for future sessions |
| **Inputs** | Final `GraphState`, plan, files_touched, errors encountered |
| **Outputs** | Memory entries in SQLite + optional embedding index (future) |
| **Tools** | `memory_store`, `memory_summarize` |

**Stored memory types:**

| Type | Example |
|------|---------|
| `architecture` | "Expense tracker uses Provider + SQLite via sqflite" |
| `convention` | "User prefers camelCase file names in Flutter" |
| `dependency` | "flutter_expense_tracker uses fl_chart 0.68" |
| `failure` | "Flutter 3.22 requires SDK constraint >=3.2.0" |
| `preference` | "Always add README with run instructions" |

## 4. LangGraph Structure

```python
# Pseudocode — graph/build.py

graph = StateGraph(GraphState)

graph.add_node("supervisor", supervisor_node)
graph.add_node("planner", planner_node)
graph.add_node("coder", coder_node)
graph.add_node("terminal", terminal_node)
graph.add_node("debug", debug_node)
graph.add_node("github", github_node)
graph.add_node("memory", memory_node)

graph.set_entry_point("supervisor")

graph.add_conditional_edges("supervisor", route_from_supervisor, {
    "planner": "planner",
    "coder": "coder",
    "terminal": "terminal",
    "debug": "debug",
    "github": "github",
    "memory": "memory",
    "end": END,
})

# All specialist agents return to supervisor
for agent in ["planner", "coder", "terminal", "debug", "github", "memory"]:
    graph.add_edge(agent, "supervisor")

app = graph.compile(checkpointer=SqliteSaver(...))
```

## 5. LLM Strategy

| Agent | Model tier | Rationale |
|-------|------------|-----------|
| Planner | High (reasoning) | Architecture decisions matter |
| Coder | High | Code quality critical |
| Debug | High | Error analysis is hard |
| Terminal | Low or none | Mostly deterministic execution |
| GitHub | Low | Template-driven commit messages |
| Memory | Medium | Summarization |
| Supervisor | None (rules) | Deterministic routing preferred |

All agents share a common `BaseAgent` with:

- System prompt template per agent
- Tool binding via LangChain `bind_tools`
- Token budget and truncation policy for file context
- Structured output parsing (Pydantic)

## 6. Human-in-the-Loop Hooks (Future)

| Hook | Trigger |
|------|---------|
| Plan approval | User reviews plan before execution |
| Destructive command | `rm`, `drop`, force push |
| GitHub push | First push to new remote |
| Budget exceeded | Max steps or max LLM spend |

State flag: `awaiting_user: bool` pauses graph until API receives `resume` payload.

## 7. Event Stream (UI Contract)

Each node emits typed events:

```typescript
type AgentEvent =
  | { type: "agent_start"; agent: AgentName }
  | { type: "agent_thought"; content: string }
  | { type: "tool_call"; tool: string; args: object }
  | { type: "tool_result"; tool: string; result: object }
  | { type: "plan_updated"; plan: Plan }
  | { type: "file_changed"; path: string; action: "create" | "edit" | "delete" }
  | { type: "terminal_output"; stream: "stdout" | "stderr"; line: string }
  | { type: "error"; message: string }
  | { type: "run_complete"; status: string; summary: string }
```
