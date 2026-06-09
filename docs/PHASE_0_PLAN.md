# BeingAI — Phase 0 Implementation Plan

**Status:** Design only — no implementation yet  
**Scope:** Foundation layer that Phase 1+ builds on without rework  
**Principle:** Every Phase 0 component must be production-shaped (typed, tested boundaries, observable) even when behavior is stubbed.

---

## Phase 0 Scope Boundary

| In scope | Out of scope (Phase 1+) |
|----------|-------------------------|
| FastAPI app, CORS, lifespan | LLM calls, real agent execution |
| All 14 SQLAlchemy models + Alembic initial migration | Tool implementations |
| Project + Session + Message CRUD | Planner/Coder file generation |
| Run record creation (stub graph invoke) | Terminal execution, debug loop |
| LangGraph compiled graph (supervisor → stub → END) | GitHub push |
| Agent registry (register agents, no-op nodes) | Memory retrieval logic |
| SSE endpoint + event persistence to `run_events` | WebSocket (optional later) |
| Next.js shell + chat placeholder UI | Live streaming from real agents |
| Settings read from DB + env | Settings write UI |

**Phase 0 deliverable:** `dev.ps1` starts both servers; user creates a project, opens a session, sends a chat message, triggers a stub run, sees SSE heartbeat events in UI.

---

## 1. Exact File Tree

Every file created in Phase 0. Files marked `(stub)` contain minimal wiring only.

```
being-ai/
├── .env.example                          # exists — extend with LOG_LEVEL
├── .gitignore                            # exists
├── README.md                             # exists — update setup steps post-impl
│
├── docs/
│   ├── ARCHITECTURE.md                   # exists
│   ├── AGENTS.md                         # exists
│   ├── DATABASE.md                       # exists
│   ├── TOOLS.md                          # exists
│   ├── ROADMAP.md                        # exists
│   └── PHASE_0_PLAN.md                   # this document
│
├── data/
│   └── workspaces/
│       └── .gitkeep                      # exists
│
├── scripts/
│   ├── init_db.py                        # exists — deprecate after Alembic; keep as fallback
│   ├── dev.ps1                           # exists — update after frontend bootstrap
│   └── dev.sh                            # NEW — macOS/Linux equivalent
│
├── backend/
│   ├── requirements.txt                  # exists — extend (see §10)
│   ├── requirements-dev.txt              # NEW — pytest, httpx, ruff, mypy
│   ├── pyproject.toml                    # NEW — ruff + pytest config
│   ├── alembic.ini                       # NEW
│   ├── pytest.ini                        # NEW
│   │
│   ├── alembic/
│   │   ├── env.py                        # NEW — imports Base + all models
│   │   ├── script.py.mako                # NEW — Alembic template
│   │   └── versions/
│   │       └── 001_initial_schema.py     # NEW — autogenerate from models
│   │
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py                   # TestClient, in-memory SQLite, overrides
│   │   ├── test_health.py
│   │   ├── test_projects_api.py
│   │   ├── test_sessions_api.py
│   │   ├── test_runs_sse.py              # SSE stream returns events
│   │   └── test_graph_stub.py            # Graph compiles and reaches END
│   │
│   └── app/
│       ├── __init__.py                   # exists
│       ├── main.py                       # FastAPI factory, lifespan, middleware
│       ├── config.py                     # pydantic-settings Settings
│       │
│       ├── api/
│       │   ├── __init__.py
│       │   ├── router.py                 # Aggregates all routers under /api/v1
│       │   ├── deps.py                   # FastAPI Depends re-exports
│       │   ├── health.py                 # GET /health, GET /ready
│       │   ├── projects.py               # Project CRUD
│       │   ├── sessions.py               # Session + Message CRUD
│       │   ├── runs.py                   # Run create + SSE stream
│       │   └── settings.py               # GET settings (read-only Phase 0)
│       │
│       ├── core/
│       │   ├── __init__.py
│       │   ├── logging.py                # configure_logging()
│       │   ├── exceptions.py             # BeingAIError hierarchy
│       │   ├── handlers.py               # FastAPI exception handlers
│       │   ├── events.py                 # EventBus + RunEventEmitter
│       │   ├── enums.py                  # Shared string enums (mirror DB CHECK)
│       │   └── ids.py                    # uuid4 helpers
│       │
│       ├── db/
│       │   ├── __init__.py
│       │   ├── base.py                   # DeclarativeBase, TimestampMixin
│       │   ├── database.py               # engine, SessionLocal, get_db
│       │   ├── models/
│       │   │   ├── __init__.py           # exports all models for Alembic
│       │   │   ├── project.py
│       │   │   ├── session.py
│       │   │   ├── message.py
│       │   │   ├── run.py
│       │   │   ├── run_event.py
│       │   │   ├── plan.py
│       │   │   ├── plan_step.py
│       │   │   ├── file_change.py
│       │   │   ├── command.py
│       │   │   ├── error.py
│       │   │   ├── git_operation.py
│       │   │   ├── memory.py
│       │   │   ├── architecture_decision.py
│       │   │   └── setting.py
│       │   └── schema.sql                # exists — kept as reference; Alembic is source of truth
│       │
│       ├── schemas/                      # Pydantic v2 (API layer)
│       │   ├── __init__.py
│       │   ├── common.py                 # PaginatedResponse, ErrorResponse, TimestampMixin
│       │   ├── project.py
│       │   ├── session.py
│       │   ├── message.py
│       │   ├── run.py
│       │   ├── event.py                  # AgentEvent SSE payloads
│       │   └── settings.py
│       │
│       ├── services/
│       │   ├── __init__.py
│       │   ├── project_service.py
│       │   ├── session_service.py
│       │   ├── run_service.py
│       │   └── event_service.py          # Persist + publish run_events
│       │
│       ├── agents/
│       │   ├── __init__.py
│       │   ├── base.py                   # BaseAgent protocol, AgentContext
│       │   ├── registry.py               # AgentRegistry singleton
│       │   ├── types.py                  # AgentName enum, AgentMetadata
│       │   ├── planner.py                # (stub) register only
│       │   ├── coder.py                  # (stub)
│       │   ├── terminal.py               # (stub)
│       │   ├── debug.py                  # (stub)
│       │   ├── github.py                 # (stub)
│       │   └── memory.py                 # (stub)
│       │
│       ├── graph/
│       │   ├── __init__.py
│       │   ├── state.py                  # GraphState TypedDict + reducers
│       │   ├── nodes.py                  # supervisor_node, stub_node per agent
│       │   ├── edges.py                  # route_from_supervisor (Phase 0: always END)
│       │   ├── supervisor.py             # Routing rules (minimal Phase 0)
│       │   ├── checkpointer.py           # SqliteSaver factory
│       │   └── build.py                  # build_graph() → CompiledGraph
│       │
│       └── di/
│           ├── __init__.py
│           └── container.py              # AppContainer, lifespan wiring
│
└── frontend/
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── tailwind.config.ts
    ├── postcss.config.mjs
    ├── .eslintrc.json
    │
    └── src/
        ├── app/
        │   ├── globals.css
        │   ├── layout.tsx                # Root layout, fonts, providers
        │   ├── page.tsx                  # Home: project list + create form
        │   ├── projects/
        │   │   └── [id]/
        │   │       └── page.tsx          # Project detail + chat placeholder
        │   └── settings/
        │       └── page.tsx              # Static placeholder
        │
        ├── components/
        │   ├── chat/
        │   │   ├── ChatPanel.tsx         # Message list + input (no real agent yet)
        │   │   ├── MessageList.tsx
        │   │   ├── MessageInput.tsx
        │   │   └── EventLog.tsx          # SSE events sidebar (stub stream)
        │   ├── project/
        │   │   ├── ProjectCard.tsx
        │   │   └── CreateProjectForm.tsx
        │   └── ui/
        │       ├── Button.tsx
        │       ├── Input.tsx
        │       └── Card.tsx
        │
        ├── hooks/
        │   ├── useProjects.ts
        │   ├── useSession.ts
        │   └── useRunStream.ts           # EventSource wrapper for SSE
        │
        ├── lib/
        │   ├── api.ts                    # fetch wrapper, base URL from env
        │   ├── sse.ts                    # parse SSE JSON events
        │   └── utils.ts                  # cn() for Tailwind
        │
        └── types/
            └── index.ts                  # Mirror backend Pydantic schemas
```

**File count:** ~85 files (including tests and Alembic boilerplate).

---

## 2. SQLAlchemy Models

### 2.1 Base Conventions

```python
# db/base.py — design spec

class Base(DeclarativeBase): ...

class TimestampMixin:
    created_at: Mapped[datetime]   # server_default=func.now(), timezone-aware UTC
    updated_at: Mapped[datetime]   # onupdate=func.now() where applicable

# All primary keys: String(36) UUID via uuid4()
# JSON columns: Mapped[dict | list | None] with JSON serializer
# SQLite: use TypeDecorator or sqlalchemy.JSON
# Enums: Python StrEnum stored as String; CHECK constraints via __table_args__
```

### 2.2 Model Definitions

#### `Project` — `db/models/project.py`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `String(36)` | PK |
| `slug` | `String(128)` | UNIQUE, NOT NULL, indexed |
| `name` | `String(256)` | NOT NULL |
| `description` | `Text` | nullable |
| `workspace_path` | `String(1024)` | NOT NULL — absolute resolved path |
| `tech_stack` | `JSON` | nullable — `dict[str, str]` |
| `status` | `String(20)` | NOT NULL, default `active`, CHECK enum |
| `github_repo_url` | `String(512)` | nullable |
| `created_at` | `DateTime(tz)` | NOT NULL |
| `updated_at` | `DateTime(tz)` | NOT NULL |

**Relationships:** `sessions` (1:N), `runs` (1:N), `plans` (1:N), `file_changes` (1:N), `git_operations` (1:N), `memory_entries` (1:N), `architecture_decisions` (1:N)

#### `Session` — `db/models/session.py`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `String(36)` | PK |
| `project_id` | `String(36)` | FK → projects.id, CASCADE, indexed |
| `title` | `String(256)` | nullable |
| `status` | `String(20)` | NOT NULL, default `open`, CHECK enum |
| `created_at` | `DateTime(tz)` | NOT NULL |
| `updated_at` | `DateTime(tz)` | NOT NULL |

**Relationships:** `project` (N:1), `messages` (1:N), `runs` (1:N)

#### `Message` — `db/models/message.py`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `String(36)` | PK |
| `session_id` | `String(36)` | FK → sessions.id, CASCADE, indexed |
| `role` | `String(20)` | NOT NULL, CHECK: user/assistant/system |
| `content` | `Text` | NOT NULL |
| `metadata` | `JSON` | nullable |
| `created_at` | `DateTime(tz)` | NOT NULL, indexed with session_id |

**Relationships:** `session` (N:1), `triggered_runs` (1:N via runs.trigger_message_id)

#### `Run` — `db/models/run.py`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `String(36)` | PK |
| `session_id` | `String(36)` | FK → sessions.id, CASCADE, indexed |
| `project_id` | `String(36)` | FK → projects.id, CASCADE |
| `trigger_message_id` | `String(36)` | FK → messages.id, SET NULL |
| `status` | `String(20)` | NOT NULL, default `running`, CHECK enum |
| `current_agent` | `String(32)` | nullable |
| `current_step` | `Integer` | default 0 |
| `retry_count` | `Integer` | default 0 |
| `error_summary` | `Text` | nullable |
| `started_at` | `DateTime(tz)` | NOT NULL |
| `completed_at` | `DateTime(tz)` | nullable |
| `graph_state` | `JSON` | nullable — denormalized snapshot |

**Relationships:** `session`, `project`, `trigger_message`, `events` (1:N), `plan` (1:1), `file_changes`, `commands`, `errors`, `git_operations`

#### `RunEvent` — `db/models/run_event.py`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `Integer` | PK, autoincrement |
| `run_id` | `String(36)` | FK → runs.id, CASCADE |
| `seq` | `Integer` | NOT NULL, UNIQUE(run_id, seq) |
| `event_type` | `String(64)` | NOT NULL |
| `agent` | `String(32)` | nullable |
| `payload` | `JSON` | NOT NULL |
| `created_at` | `DateTime(tz)` | NOT NULL |

**Index:** `(run_id, seq)` for ordered replay.

#### `Plan` — `db/models/plan.py`

| Column | Type | Notes |
|--------|------|-------|
| `id` | PK UUID | |
| `run_id` | FK runs | CASCADE |
| `project_id` | FK projects | CASCADE |
| `title`, `summary`, `architecture_notes` | Text | |
| `tech_stack`, `folder_structure` | JSON | |
| `version` | Integer | default 1 |
| `status` | String | CHECK enum |
| `created_at` | DateTime | |

**Relationships:** `steps` (1:N ordered by step_order), `architecture_decisions`

#### `PlanStep` — `db/models/plan_step.py`

All columns per `schema.sql`. Relationship: `plan` (N:1), optional back-ref from `file_changes.plan_step_id`.

#### `FileChange` — `db/models/file_change.py`

Per `schema.sql`. Relationships: `run`, `project`, `plan_step` (optional).

#### `CommandExecuted` — `db/models/command.py`

Table name: `commands_executed`. Per `schema.sql`.

#### `ErrorRecord` — `db/models/error.py`

Table name: `errors`. `resolved` as `Boolean`. Per `schema.sql`.

#### `GitOperation` — `db/models/git_operation.py`

Table name: `git_operations`. `success` as `Boolean`.

#### `MemoryEntry` — `db/models/memory.py`

Table name: `memory_entries`. `project_id` nullable (global memory). `importance` Integer 1–10.

#### `ArchitectureDecision` — `db/models/architecture_decision.py`

Table name: `architecture_decisions`. Per `schema.sql`.

#### `Setting` — `db/models/setting.py`

Table name: `settings`. `key` PK, `value` JSON text, `updated_at`.

### 2.3 Enum Definitions (`core/enums.py`)

```python
class ProjectStatus(StrEnum): ACTIVE = "active"; ARCHIVED = "archived"; FAILED = "failed"
class SessionStatus(StrEnum): OPEN = "open"; RUNNING = "running"; COMPLETED = "completed"; FAILED = "failed"; CANCELLED = "cancelled"
class MessageRole(StrEnum): USER = "user"; ASSISTANT = "assistant"; SYSTEM = "system"
class RunStatus(StrEnum): RUNNING = "running"; SUCCESS = "success"; FAILED = "failed"; CANCELLED = "cancelled"
class PlanStatus(StrEnum): DRAFT = "draft"; APPROVED = "approved"; IN_PROGRESS = "in_progress"; COMPLETE = "complete"
class PlanStepType(StrEnum): SCAFFOLD = "scaffold"; FILE = "file"; COMMAND = "command"; VERIFY = "verify"; GIT = "git"
class PlanStepStatus(StrEnum): PENDING = "pending"; IN_PROGRESS = "in_progress"; COMPLETE = "complete"; FAILED = "failed"; SKIPPED = "skipped"
class FileChangeAction(StrEnum): CREATE = "create"; EDIT = "edit"; DELETE = "delete"
class GitOperationType(StrEnum): INIT = "init"; ADD = "add"; COMMIT = "commit"; PUSH = "push"; CREATE_REPO = "create_repo"
class MemoryType(StrEnum): ARCHITECTURE = "architecture"; CONVENTION = "convention"; DEPENDENCY = "dependency"; FAILURE = "failure"; PREFERENCE = "preference"
class AdrStatus(StrEnum): PROPOSED = "proposed"; ACCEPTED = "accepted"; SUPERSEDED = "superseded"
class EventType(StrEnum): AGENT_START = "agent_start"; AGENT_THOUGHT = "agent_thought"; TOOL_CALL = "tool_call"; TOOL_RESULT = "tool_result"; PLAN_UPDATED = "plan_updated"; FILE_CHANGED = "file_changed"; TERMINAL_OUTPUT = "terminal_output"; ERROR = "error"; RUN_COMPLETE = "run_complete"; HEARTBEAT = "heartbeat"
```

---

## 3. API Endpoints

**Base path:** `/api/v1`  
**OpenAPI:** Auto-generated at `/api/v1/docs` (dev only; disable in production via `BEINGAI_ENV=production`).

### 3.1 Health

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/health` | Liveness | `{"status":"ok","version":"0.1.0"}` |
| `GET` | `/ready` | Readiness (DB ping) | `{"status":"ready","db":"connected"}` or 503 |

### 3.2 Projects

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects` | Create project + workspace directory |
| `GET` | `/projects` | List projects (paginated, filter by status) |
| `GET` | `/projects/{project_id}` | Get project by ID |
| `PATCH` | `/projects/{project_id}` | Update name, description, status |
| `DELETE` | `/projects/{project_id}` | Soft-delete → status `archived`; optional hard delete |

**Create side effects:**
1. Generate UUID + slug from name (dedupe with numeric suffix)
2. `mkdir -p {workspace_root}/{slug}`
3. Insert `projects` row with resolved absolute `workspace_path`

### 3.3 Sessions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects/{project_id}/sessions` | Create session |
| `GET` | `/projects/{project_id}/sessions` | List sessions for project |
| `GET` | `/sessions/{session_id}` | Get session |
| `PATCH` | `/sessions/{session_id}` | Update title, status |

### 3.4 Messages

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sessions/{session_id}/messages` | Add user message |
| `GET` | `/sessions/{session_id}/messages` | List messages (ordered asc, paginated) |

### 3.5 Runs (Agent execution + SSE)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sessions/{session_id}/runs` | Start run (invokes stub graph) |
| `GET` | `/runs/{run_id}` | Get run status |
| `GET` | `/runs/{run_id}/events` | List persisted events (JSON, for replay) |
| `GET` | `/runs/{run_id}/stream` | **SSE** — live event stream |

**`POST /sessions/{session_id}/runs` body:**

```json
{
  "trigger_message_id": "uuid-optional",
  "user_request": "Build a Flutter expense tracker"
}
```

**SSE stream (`GET /runs/{run_id}/stream`):**
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- Events: `id: {seq}\ndata: {json}\n\n`
- Phase 0 emits: `heartbeat`, `agent_start`, `run_complete` (stub)
- Supports `Last-Event-ID` header for reconnect replay from `run_events`

### 3.6 Settings (read-only Phase 0)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings` | All settings merged with env overrides |

### 3.7 Error Response Shape (all endpoints)

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project abc123 not found",
    "details": {}
  },
  "request_id": "req-uuid"
}
```

HTTP status mapping defined in §9.

---

## 4. Pydantic Schemas

Located in `app/schemas/`. Naming: `{Entity}Create`, `{Entity}Update`, `{Entity}Response`, `{Entity}ListResponse`.

### 4.1 Common (`schemas/common.py`)

```python
class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = {}

class ErrorResponse(BaseModel):
    error: ErrorDetail
    request_id: str

class PaginationParams(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    has_more: bool
```

### 4.2 Project (`schemas/project.py`)

```python
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str | None = None
    slug: str | None = None          # auto-generated if omitted; regex ^[a-z0-9-]+$

class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: ProjectStatus | None = None

class ProjectResponse(BaseModel):
    id: str
    slug: str
    name: str
    description: str | None
    workspace_path: str
    tech_stack: dict[str, str] | None
    status: ProjectStatus
    github_repo_url: str | None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
```

### 4.3 Session (`schemas/session.py`)

```python
class SessionCreate(BaseModel):
    title: str | None = None

class SessionUpdate(BaseModel):
    title: str | None = None
    status: SessionStatus | None = None

class SessionResponse(BaseModel):
    id: str
    project_id: str
    title: str | None
    status: SessionStatus
    created_at: datetime
    updated_at: datetime
    message_count: int = 0           # computed in service layer
```

### 4.4 Message (`schemas/message.py`)

```python
class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=32_000)
    role: MessageRole = MessageRole.USER

class MessageResponse(BaseModel):
    id: str
    session_id: str
    role: MessageRole
    content: str
    metadata: dict[str, Any] | None
    created_at: datetime
```

### 4.5 Run (`schemas/run.py`)

```python
class RunCreate(BaseModel):
    user_request: str = Field(..., min_length=1)
    trigger_message_id: str | None = None

class RunResponse(BaseModel):
    id: str
    session_id: str
    project_id: str
    status: RunStatus
    current_agent: str | None
    current_step: int
    retry_count: int
    error_summary: str | None
    started_at: datetime
    completed_at: datetime | None

class RunEventResponse(BaseModel):
    seq: int
    event_type: EventType
    agent: str | None
    payload: dict[str, Any]
    created_at: datetime
```

### 4.6 Event (`schemas/event.py`) — SSE payloads

```python
class AgentStartEvent(BaseModel):
    type: Literal["agent_start"] = "agent_start"
    agent: str

class RunCompleteEvent(BaseModel):
    type: Literal["run_complete"] = "run_complete"
    status: RunStatus
    summary: str

class HeartbeatEvent(BaseModel):
    type: Literal["heartbeat"] = "heartbeat"
    ts: datetime

# Union: AgentEvent = Annotated[Union[...], Field(discriminator="type")]
```

### 4.7 Settings (`schemas/settings.py`)

```python
class SettingsResponse(BaseModel):
    llm_model: str
    llm_provider: str
    auto_push_github: bool
    max_debug_retries: int
    milestone_commits: bool
    command_allowlist_enabled: bool
    workspace_root: str
```

---

## 5. Database Relationships

### 5.1 ER Diagram (SQLAlchemy mapping)

```
Project 1 ──────< Session
    │                │
    │                ├──────< Message
    │                │
    │                └──────< Run ──────< RunEvent
    │                         │
    ├─────────────────────────┤
    │                         │
    │                         ├──────< Plan ──────< PlanStep
    │                         │
    │                         ├──────< FileChange >── PlanStep (optional)
    │                         ├──────< CommandExecuted
    │                         ├──────< ErrorRecord
    │                         └──────< GitOperation
    │
    ├──────< MemoryEntry (project_id nullable)
    └──────< ArchitectureDecision >── Plan (optional)

Message 1 ──────< Run (trigger_message_id, optional)

Setting — standalone key-value (no FK)
```

### 5.2 Relationship Configuration

```python
# project.py
sessions: Mapped[list["Session"]] = relationship(back_populates="project", cascade="all, delete-orphan")
runs: Mapped[list["Run"]] = relationship(back_populates="project")
memory_entries: Mapped[list["MemoryEntry"]] = relationship(back_populates="project")

# session.py
project: Mapped["Project"] = relationship(back_populates="sessions")
messages: Mapped[list["Message"]] = relationship(back_populates="session", order_by="Message.created_at")
runs: Mapped[list["Run"]] = relationship(back_populates="session")

# run.py
events: Mapped[list["RunEvent"]] = relationship(back_populates="run", order_by="RunEvent.seq")
plan: Mapped["Plan | None"] = relationship(back_populates="run", uselist=False)
trigger_message: Mapped["Message | None"] = relationship(back_populates="triggered_runs")

# plan.py
steps: Mapped[list["PlanStep"]] = relationship(back_populates="plan", order_by="PlanStep.step_order", cascade="all, delete-orphan")
```

### 5.3 Cascade Rules

| Parent deleted | Child behavior |
|----------------|----------------|
| Project | CASCADE sessions, runs, plans, file_changes, git_ops, ADRs |
| Session | CASCADE messages, runs |
| Run | CASCADE events, plans, file_changes, commands, errors, git_ops |
| Plan | CASCADE plan_steps |
| MemoryEntry.project | SET NULL (preserve global learnings) |

### 5.4 Alembic Strategy

1. `alembic init alembic` from `backend/`
2. `env.py` imports `Base.metadata` from `app.db.models`
3. Initial revision `001_initial_schema` autogenerated, hand-reviewed against `schema.sql`
4. Seed data for `settings` table in migration `001` (not raw SQL file)
5. `scripts/init_db.py` becomes thin wrapper: `alembic upgrade head`

---

## 6. LangGraph State Definition

### 6.1 Phase 0 Graph — Minimal Runnable

Phase 0 compiles a real LangGraph instance to validate checkpointer, state serialization, and run lifecycle. Agent nodes are **stubs** that emit events and return immediately.

```
ENTRY → supervisor → stub_planner → supervisor → END
```

Full multi-agent routing is wired in `supervisor.py` but Phase 0 forces `END` after stub planner.

### 6.2 `GraphState` (`graph/state.py`)

```python
class AgentMessage(TypedDict):
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    agent: str | None
    timestamp: str                          # ISO 8601

class GraphState(TypedDict, total=False):
    # Required on invoke
    project_id: str
    session_id: str
    run_id: str
    user_request: str
    workspace_path: str

    # Planning (Phase 0: always None)
    project_type: str | None
    plan: dict | None                       # serialized Plan; Pydantic in Phase 1
    current_step_index: int
    plan_status: Literal["pending", "in_progress", "complete", "failed"]

    # Execution (Phase 0: empty defaults)
    files_touched: Annotated[list[str], operator.add]
    last_command: dict | None
    last_error: dict | None
    retry_count: int

    # Coordination
    next_agent: str | None
    messages: Annotated[list[AgentMessage], operator.add]
    tool_results: Annotated[list[dict], operator.add]

    # Control
    awaiting_user: bool
    status: Literal["running", "success", "failed", "cancelled"]
    summary: str | None
```

**Reducers:** Use `Annotated[list, operator.add]` for append-only fields per LangGraph convention.

### 6.3 Checkpointer (`graph/checkpointer.py`)

```python
def get_checkpointer(db_path: Path) -> SqliteSaver:
    # langgraph.checkpoint.sqlite.SqliteSaver.from_conn_string(f"sqlite:///{db_path}")
    # Shares beingai.db; creates checkpoint_* tables
```

### 6.4 Stub Node Contract

Each registered agent has a stub node in `graph/nodes.py`:

1. Emit `agent_start` event via `EventService`
2. Log at INFO
3. Return `{}` (no state mutation) or minimal `{summary: "...", status: "success"}`
4. Phase 0 `stub_planner` sets `summary = f"Phase 0 stub received: {user_request[:100]}"`

### 6.5 `build_graph()` Output

```python
def build_graph(checkpointer: BaseCheckpointSaver) -> CompiledGraph:
    # Returns compiled graph singleton (built once in lifespan)
```

Invoked from `RunService.start_run()` via `asyncio.create_task` — graph runs in background; events flow to SSE subscribers.

---

## 7. Dependency Injection Structure

### 7.1 Layering

```
HTTP Request
    → api/deps.py (FastAPI Depends)
        → services/* (business logic)
            → db/database.py (Session)
            → graph/build.py (CompiledGraph)
            → agents/registry.py (AgentRegistry)
            → core/events.py (EventBus)
```

**Rule:** Routers never touch SQLAlchemy sessions directly. Services never import FastAPI.

### 7.2 `AppContainer` (`di/container.py`)

```python
@dataclass
class AppContainer:
    settings: Settings
    engine: Engine
    session_factory: sessionmaker[Session]
    graph: CompiledGraph
    agent_registry: AgentRegistry
    event_bus: EventBus

    @classmethod
    def create(cls, settings: Settings) -> "AppContainer": ...

    def close(self) -> None: ...
```

### 7.3 Lifespan (`main.py`)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings)
    container = AppContainer.create(settings)
    app.state.container = container
    register_agents(container.agent_registry)   # stub agents
    yield
    container.close()
```

### 7.4 FastAPI Depends (`api/deps.py`)

```python
def get_container(request: Request) -> AppContainer:
    return request.app.state.container

def get_db(container: AppContainer = Depends(get_container)) -> Generator[Session, None, None]:
    db = container.session_factory()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def get_project_service(db: Session = Depends(get_db), container: AppContainer = Depends(get_container)) -> ProjectService:
    return ProjectService(db=db, settings=container.settings)

def get_run_service(...) -> RunService:
    return RunService(db=db, graph=container.graph, event_bus=container.event_bus, ...)
```

### 7.5 Test Overrides (`tests/conftest.py`)

```python
@pytest.fixture
def app():
    # SQLite :memory: engine
    # Override get_db, get_container
    # yield TestClient
```

### 7.6 Agent Registry (`agents/registry.py`)

```python
@dataclass(frozen=True)
class AgentMetadata:
    name: AgentName
    description: str
    version: str = "0.0.0-stub"
    tools: list[str] = field(default_factory=list)   # empty Phase 0

class AgentRegistry:
    def register(self, meta: AgentMetadata, node_fn: Callable) -> None: ...
    def get(self, name: AgentName) -> AgentMetadata: ...
    def all(self) -> list[AgentMetadata]: ...
    def node_for(self, name: AgentName) -> Callable: ...

def register_default_agents(registry: AgentRegistry) -> None:
    # Registers planner, coder, terminal, debug, github, memory as stubs
```

`GET /api/v1/agents` (optional Phase 0 endpoint) lists registered agents for UI/debug.

---

## 8. Logging System

### 8.1 Goals

- Structured, grep-friendly logs on disk
- Human-readable console in development
- `request_id` propagated through HTTP → service → graph → tools (Phase 1)
- No secrets in logs (redact API keys, tokens)

### 8.2 Configuration (`core/logging.py`)

```python
def configure_logging(settings: Settings) -> None:
    # LOG_LEVEL from env (default INFO)
    # LOG_FORMAT: "console" | "json" (default console in dev, json optional)
    # LOG_FILE: optional path data/logs/beingai.log with RotatingFileHandler (10MB × 5)
```

### 8.3 Log Format (JSON mode)

```json
{
  "ts": "2026-06-05T12:00:00Z",
  "level": "INFO",
  "logger": "app.services.run_service",
  "message": "Run started",
  "request_id": "req-abc",
  "run_id": "run-xyz",
  "project_id": "proj-123",
  "agent": "planner"
}
```

### 8.4 Logger Naming Convention

| Logger | Scope |
|--------|-------|
| `app.main` | Startup, shutdown |
| `app.api.*` | Request/response (method, path, status, duration) |
| `app.services.*` | Business events |
| `app.graph.*` | Node entry/exit, routing decisions |
| `app.agents.*` | Agent-specific (Phase 1+) |
| `app.db` | Slow query warnings (>100ms) |

### 8.5 Request ID Middleware

```python
# main.py middleware
# Generate uuid4 per request → contextvars.ContextVar
# Attach to response header X-Request-ID
# Include in ErrorResponse.request_id
```

### 8.6 Audit vs Application Logs

| Concern | Destination |
|---------|-------------|
| User-visible agent actions | `run_events` table (durable, replayable) |
| Operational/debug | Python logging |
| HTTP access | `app.api` logger |

Never duplicate full `run_events` payloads in application logs (log `event_type` + `seq` only).

---

## 9. Error Handling Strategy

### 9.1 Exception Hierarchy (`core/exceptions.py`)

```python
class BeingAIError(Exception):
    code: str = "INTERNAL_ERROR"
    status_code: int = 500
    def __init__(self, message: str, details: dict | None = None): ...

class NotFoundError(BeingAIError):
    code = "NOT_FOUND"; status_code = 404

class ProjectNotFoundError(NotFoundError):
    code = "PROJECT_NOT_FOUND"

class SessionNotFoundError(NotFoundError):
    code = "SESSION_NOT_FOUND"

class RunNotFoundError(NotFoundError):
    code = "RUN_NOT_FOUND"

class ConflictError(BeingAIError):
    code = "CONFLICT"; status_code = 409

class SlugConflictError(ConflictError):
    code = "SLUG_ALREADY_EXISTS"

class ValidationError(BeingAIError):
    code = "VALIDATION_ERROR"; status_code = 422

class WorkspaceError(BeingAIError):
    code = "WORKSPACE_ERROR"; status_code = 500

class GraphExecutionError(BeingAIError):
    code = "GRAPH_EXECUTION_ERROR"; status_code = 500

class StreamError(BeingAIError):
    code = "STREAM_ERROR"; status_code = 500
```

### 9.2 Handler Registration (`core/handlers.py`)

| Exception | HTTP | Response code |
|-----------|------|---------------|
| `BeingAIError` | `e.status_code` | `e.code` |
| `pydantic.ValidationError` | 422 | `VALIDATION_ERROR` |
| `sqlalchemy.exc.IntegrityError` | 409 | `INTEGRITY_ERROR` (map slug unique) |
| `Exception` (unhandled) | 500 | `INTERNAL_ERROR` (no stack trace to client) |

```python
async def beingai_exception_handler(request, exc: BeingAIError) -> JSONResponse:
    logger.warning(exc.message, extra={...})
    return JSONResponse(status_code=exc.status_code, content=ErrorResponse(...).model_dump())
```

### 9.3 Service Layer Rules

1. Raise typed `BeingAIError` subclasses — never return error tuples
2. DB not-found: raise `ProjectNotFoundError(id)` after query returns None
3. Filesystem failures on project create: raise `WorkspaceError` with details; no partial DB row (use transaction)
4. Graph failures: catch in `RunService`, set `run.status = failed`, emit `error` + `run_complete` events, persist `error_summary`

### 9.4 SSE Error Handling

- Stream stays open during run; terminal event `run_complete` signals end
- On catastrophic failure: send `event: error\ndata: {...}\n\n` then close
- Client `useRunStream` hook: auto-reconnect with `Last-Event-ID` on disconnect

### 9.5 Transaction Boundaries

| Operation | Transaction scope |
|-----------|-------------------|
| Create project | DB insert + mkdir (mkdir first; rollback DB on mkdir failure) |
| Create message | Single insert |
| Start run | Insert run + commit before graph invoke; graph updates async |
| Persist event | Individual insert per event (visible to SSE immediately) |

---

## 10. Development Order

Strict sequence — each step is independently testable before proceeding.

### Step 1: Backend skeleton (Day 1)

1. `config.py` — `Settings` with pydantic-settings, load `.env`
2. `core/logging.py`, `core/exceptions.py`, `core/handlers.py`, `core/enums.py`, `core/ids.py`
3. `main.py` — FastAPI app, CORS, request-id middleware, lifespan stub
4. `api/health.py` — `/health`, `/ready`
5. `requirements.txt` + `requirements-dev.txt` update
6. **Verify:** `uvicorn app.main:app` → health 200

### Step 2: Database layer (Day 1–2)

1. `db/base.py`, `db/database.py`
2. All 14 models in `db/models/` (one file per entity)
3. `alembic init` + `env.py` + `001_initial_schema.py`
4. Seed `settings` in migration
5. `tests/conftest.py` with in-memory SQLite
6. **Verify:** `alembic upgrade head` → tables exist; model import no circular deps

### Step 3: Pydantic schemas + Project CRUD (Day 2)

1. `schemas/common.py`, `schemas/project.py`
2. `services/project_service.py` — create (slug gen, mkdir), list, get, update, archive
3. `api/deps.py`, `api/projects.py`, `api/router.py`
4. `tests/test_projects_api.py`
5. **Verify:** CRUD via curl/httpx; workspace dir created on disk

### Step 4: Sessions + Messages (Day 2–3)

1. `schemas/session.py`, `schemas/message.py`
2. `services/session_service.py`
3. `api/sessions.py` — nested under projects + message endpoints
4. `tests/test_sessions_api.py`
5. **Verify:** Create project → session → message chain

### Step 5: Event infrastructure (Day 3)

1. `core/events.py` — `EventBus` (asyncio.Queue per run_id), `RunEventEmitter`
2. `services/event_service.py` — append to `run_events`, publish to bus
3. `schemas/event.py`, `schemas/run.py`
4. **Verify:** Unit test publish → subscriber receives event

### Step 6: LangGraph stub + Agent registry (Day 3–4)

1. `graph/state.py` — GraphState with reducers
2. `agents/types.py`, `agents/base.py`, `agents/registry.py`
3. Stub files for all 6 agents + `register_default_agents()`
4. `graph/supervisor.py`, `graph/nodes.py`, `graph/edges.py` — Phase 0 minimal route
5. `graph/checkpointer.py`, `graph/build.py`
6. `di/container.py` — wire graph + registry in lifespan
7. `tests/test_graph_stub.py`
8. **Verify:** Graph invoke reaches END; checkpoint tables created

### Step 7: Runs API + SSE (Day 4)

1. `services/run_service.py` — create run, background graph task, event emission
2. `api/runs.py` — POST create, GET status, GET events, GET stream (SSE)
3. `tests/test_runs_sse.py` — httpx async client, read SSE chunks
4. **Verify:** POST run → SSE stream receives heartbeat + agent_start + run_complete

### Step 8: Settings endpoint (Day 4)

1. `schemas/settings.py`, `api/settings.py`
2. Merge DB settings with env overrides (env wins)
3. **Verify:** GET /settings returns defaults from migration seed

### Step 9: Frontend shell (Day 5)

1. `npx create-next-app@latest frontend` — TypeScript, Tailwind, App Router, src/
2. `lib/api.ts`, `types/index.ts`
3. `components/ui/*` — minimal Button, Input, Card
4. `app/page.tsx` — project list + `CreateProjectForm`
5. `app/projects/[id]/page.tsx` — session view placeholder
6. `hooks/useProjects.ts`
7. **Verify:** Create project from UI; list refreshes

### Step 10: Chat placeholder + SSE hook (Day 5–6)

1. `components/chat/*` — MessageList, MessageInput, ChatPanel, EventLog
2. `hooks/useSession.ts`, `hooks/useRunStream.ts`, `lib/sse.ts`
3. Wire: send message → POST run → open EventSource → show events in EventLog
4. Stub assistant message on run complete
5. **Verify:** End-to-end UI flow without real LLM

### Step 11: Dev experience + docs (Day 6)

1. Update `scripts/dev.ps1`, add `scripts/dev.sh`
2. Update `README.md` with setup instructions
3. `pyproject.toml` ruff config; run ruff + pytest CI-ready
4. Optional: `GET /api/v1/agents` list endpoint
5. **Verify:** Fresh clone → install → `dev.ps1` → full UI flow

---

## Phase 0 Acceptance Checklist

- [ ] `alembic upgrade head` creates all 14 tables + settings seed
- [ ] `pytest` passes (health, projects, sessions, graph stub, SSE)
- [ ] `POST /projects` creates workspace directory on disk
- [ ] `POST /sessions/{id}/runs` completes stub graph with `status=success`
- [ ] SSE stream delivers ordered events with reconnect via `Last-Event-ID`
- [ ] All 6 agents registered in `AgentRegistry`
- [ ] Frontend: create project, open project, send message, see event log
- [ ] Logs include `request_id`; errors return structured JSON
- [ ] No LLM API key required to run Phase 0

---

## Dependencies (Phase 0 `requirements.txt` additions)

```
# Existing
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
pydantic>=2.9.0
pydantic-settings>=2.6.0
sqlalchemy>=2.0.36
alembic>=1.14.0
langgraph>=0.2.0
langchain-core>=0.3.0
python-dotenv>=1.0.1

# Add for Phase 0
langgraph-checkpoint-sqlite>=2.0.0   # SqliteSaver
sse-starlette>=2.1.0                  # SSE response helper (optional; can use StreamingResponse)
python-json-logger>=2.0.7             # JSON log formatter (optional)
httpx>=0.27.0                         # dev/test client

# requirements-dev.txt
pytest>=8.0
pytest-asyncio>=0.24
ruff>=0.8
mypy>=1.13
```

---

## Risks & Mitigations (Phase 0 specific)

| Risk | Mitigation |
|------|------------|
| Alembic + existing `schema.sql` drift | Single source: models → autogenerate; diff against schema.sql in review |
| SSE connection drops on Windows | `Last-Event-ID` replay; heartbeat every 15s |
| LangGraph version API changes | Pin `langgraph>=0.2,<0.3`; smoke test in CI |
| SQLite concurrent writes (SSE + graph) | WAL mode: `PRAGMA journal_mode=WAL` in `database.py` |
| Circular imports models ↔ services | Models never import services; schemas separate from ORM |

---

## Next Action

When approved, begin **Step 1** (backend skeleton). Each step maps to a focused PR for reviewability per `ROADMAP.md` PR-1 scope.
