# BeingAI — Database Schema

## 1. Overview

- **Engine:** SQLite 3
- **ORM:** SQLAlchemy 2.x
- **Migrations:** Alembic
- **Path:** `data/beingai.db` (configurable via `BEINGAI_DB_PATH`)

SQLite is sufficient for single-user local use. Schema is designed for auditability (every agent action traceable) and memory retrieval (project history survives restarts).

## 2. Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  projects   │──1:N──│  sessions   │──1:N──│  messages   │
└──────┬──────┘       └──────┬──────┘       └─────────────┘
       │                     │
       │                ┌────▼────┐
       │                │  runs   │ (agent graph executions)
       │                └────┬────┘
       │                     │
       ├──────────────┬──────┼──────┬──────────────┐
       ▼              ▼      ▼      ▼              ▼
   ┌───────┐    ┌─────────┐ ┌──────────┐   ┌────────────┐
   │ plans │    │  file   │ │ commands │   │ git_ops    │
   └───┬───┘    │ changes │ └──────────┘   └────────────┘
       │        └─────────┘
       ▼
  ┌──────────┐
  │plan_steps│
  └──────────┘

┌─────────────┐       ┌──────────────────┐
│   memory    │       │ architecture_    │
│  entries    │       │ decisions        │
└─────────────┘       └──────────────────┘

┌─────────────┐
│ run_events  │  (fine-grained event log for SSE replay)
└─────────────┘
```

## 3. Table Definitions

### 3.1 `projects`

Top-level unit — one generated codebase per project.

```sql
CREATE TABLE projects (
    id              TEXT PRIMARY KEY,          -- UUID
    slug            TEXT NOT NULL UNIQUE,      -- filesystem-safe name
    name            TEXT NOT NULL,
    description     TEXT,
    workspace_path  TEXT NOT NULL,             -- absolute path under workspaces/
    tech_stack      TEXT,                      -- JSON: {"frontend":"flutter", ...}
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived', 'failed')),
    github_repo_url TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_projects_slug ON projects(slug);
CREATE INDEX idx_projects_status ON projects(status);
```

### 3.2 `sessions`

A conversation / build attempt within a project.

```sql
CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title           TEXT,
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'running', 'completed', 'failed', 'cancelled')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_project ON sessions(project_id);
```

### 3.3 `messages`

User and assistant messages in a session.

```sql
CREATE TABLE messages (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    metadata        TEXT,                      -- JSON: tokens, model, etc.
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);
```

### 3.4 `runs`

One LangGraph execution (may span many agent steps).

```sql
CREATE TABLE runs (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    trigger_message_id TEXT REFERENCES messages(id),
    status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'success', 'failed', 'cancelled')),
    current_agent   TEXT,
    current_step    INTEGER DEFAULT 0,
    retry_count     INTEGER DEFAULT 0,
    error_summary   TEXT,
    started_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT,
    graph_state     TEXT                       -- JSON snapshot for recovery
);

CREATE INDEX idx_runs_session ON runs(session_id);
CREATE INDEX idx_runs_status ON runs(status);
```

### 3.5 `run_events`

Append-only event log for UI streaming and replay.

```sql
CREATE TABLE run_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    seq             INTEGER NOT NULL,
    event_type      TEXT NOT NULL,             -- agent_start, tool_call, terminal_output, ...
    agent           TEXT,
    payload         TEXT NOT NULL,             -- JSON
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (run_id, seq)
);

CREATE INDEX idx_run_events_run ON run_events(run_id, seq);
```

### 3.6 `plans`

Structured implementation plan from Planner Agent.

```sql
CREATE TABLE plans (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    summary         TEXT,
    architecture_notes TEXT,
    tech_stack      TEXT,                      -- JSON
    folder_structure TEXT,                     -- JSON array of paths
    version         INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'approved', 'in_progress', 'complete')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_plans_run ON plans(run_id);
```

### 3.7 `plan_steps`

Individual steps within a plan.

```sql
CREATE TABLE plan_steps (
    id              TEXT PRIMARY KEY,
    plan_id         TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    step_order      INTEGER NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    step_type       TEXT NOT NULL
                    CHECK (step_type IN ('scaffold', 'file', 'command', 'verify', 'git')),
    files_spec      TEXT,                      -- JSON: FileSpec[]
    commands        TEXT,                      -- JSON: string[]
    success_criteria TEXT,
    depends_on      TEXT,                      -- JSON: step id[]
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'complete', 'failed', 'skipped')),
    completed_at    TEXT
);

CREATE INDEX idx_plan_steps_plan ON plan_steps(plan_id, step_order);
```

### 3.8 `file_changes`

Audit trail for every file mutation.

```sql
CREATE TABLE file_changes (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plan_step_id    TEXT REFERENCES plan_steps(id),
    file_path       TEXT NOT NULL,             -- relative to workspace
    action          TEXT NOT NULL CHECK (action IN ('create', 'edit', 'delete')),
    diff            TEXT,                      -- unified diff or full content hash
    agent           TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_file_changes_run ON file_changes(run_id);
CREATE INDEX idx_file_changes_project ON file_changes(project_id, file_path);
```

### 3.9 `commands_executed`

Shell commands run by Terminal Agent.

```sql
CREATE TABLE commands_executed (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    plan_step_id    TEXT REFERENCES plan_steps(id),
    command         TEXT NOT NULL,
    cwd             TEXT NOT NULL,
    exit_code       INTEGER,
    stdout          TEXT,
    stderr          TEXT,
    duration_ms     INTEGER,
    agent           TEXT NOT NULL DEFAULT 'terminal',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_commands_run ON commands_executed(run_id);
```

### 3.10 `errors`

Captured errors for Debug Agent context.

```sql
CREATE TABLE errors (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    command_id      TEXT REFERENCES commands_executed(id),
    error_type      TEXT,                      -- compile, runtime, test, lint, network
    message         TEXT NOT NULL,
    stack_trace     TEXT,
    context_files   TEXT,                      -- JSON: relevant file paths
    resolved        INTEGER NOT NULL DEFAULT 0,
    fix_summary     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_errors_run ON errors(run_id);
```

### 3.11 `git_operations`

Git and GitHub actions.

```sql
CREATE TABLE git_operations (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    operation       TEXT NOT NULL
                    CHECK (operation IN ('init', 'add', 'commit', 'push', 'create_repo')),
    commit_hash     TEXT,
    commit_message  TEXT,
    remote_url      TEXT,
    success         INTEGER NOT NULL,
    details         TEXT,                      -- JSON
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_git_ops_project ON git_operations(project_id);
```

### 3.12 `memory_entries`

Long-term project memory (Memory Agent).

```sql
CREATE TABLE memory_entries (
    id              TEXT PRIMARY KEY,
    project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,  -- NULL = global
    memory_type     TEXT NOT NULL
                    CHECK (memory_type IN ('architecture', 'convention', 'dependency', 'failure', 'preference')),
    key             TEXT NOT NULL,             -- e.g. "state_management", "test_framework"
    content         TEXT NOT NULL,
    source_run_id   TEXT REFERENCES runs(id),
    importance      INTEGER NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_memory_project ON memory_entries(project_id);
CREATE INDEX idx_memory_type ON memory_entries(memory_type);
CREATE INDEX idx_memory_key ON memory_entries(key);
```

### 3.13 `architecture_decisions`

Explicit ADR-style records linked to plans.

```sql
CREATE TABLE architecture_decisions (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plan_id         TEXT REFERENCES plans(id),
    title           TEXT NOT NULL,
    context         TEXT NOT NULL,
    decision        TEXT NOT NULL,
    consequences    TEXT,
    status          TEXT NOT NULL DEFAULT 'accepted'
                    CHECK (status IN ('proposed', 'accepted', 'superseded')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_adr_project ON architecture_decisions(project_id);
```

### 3.14 `settings`

User preferences (key-value).

```sql
CREATE TABLE settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,             -- JSON
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Default settings:**

```json
{
  "llm_model": "gpt-4o",
  "auto_push_github": false,
  "max_debug_retries": 5,
  "milestone_commits": true,
  "command_allowlist_enabled": false
}
```

## 4. LangGraph Checkpointer

LangGraph maintains its own checkpoint tables for graph state recovery. Options:

| Approach | Pros | Cons |
|----------|------|------|
| `langgraph.checkpoint.sqlite.SqliteSaver` | Same DB file, simple | Separate tables |
| Custom checkpointer wrapping `runs.graph_state` | Unified model | More work |

**Recommendation:** Use `SqliteSaver` pointing at `beingai.db` with prefix `checkpoint_` tables. Sync `runs.graph_state` on node completion for UI inspection.

## 5. Query Patterns

| Use case | Query |
|----------|-------|
| Load project context for Planner | `memory_entries` + `architecture_decisions` + latest `plans` |
| UI file history | `file_changes` ordered by `created_at` |
| Debug context | Latest `errors` + `commands_executed` + related `file_changes` |
| Replay session | `run_events` by `run_id, seq` |
| Resume failed run | `runs.graph_state` where `status = 'failed'` |

## 6. Retention Policy (Configurable)

| Data | Default retention |
|------|-------------------|
| `run_events` | 90 days (archive to JSON files) |
| `commands_executed.stdout` | Truncate to 50KB per row |
| `file_changes.diff` | Keep full diff for 30 days, then hash only |
| `memory_entries` | Indefinite |

## 7. Canonical DDL File

The executable schema lives at:

```
backend/app/db/schema.sql
```

Bootstrap via `scripts/init_db.py` or Alembic `upgrade head`.
