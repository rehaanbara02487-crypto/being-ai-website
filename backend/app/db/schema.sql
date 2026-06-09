-- BeingAI canonical schema
-- See docs/DATABASE.md for full documentation

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    description     TEXT,
    workspace_path  TEXT NOT NULL,
    tech_stack      TEXT,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived', 'failed')),
    github_repo_url TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title           TEXT,
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'running', 'completed', 'failed', 'cancelled')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    metadata        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

-- ---------------------------------------------------------------------------
-- runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS runs (
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
    graph_state     TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

-- ---------------------------------------------------------------------------
-- run_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS run_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    seq             INTEGER NOT NULL,
    event_type      TEXT NOT NULL,
    agent           TEXT,
    payload         TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, seq);

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    summary         TEXT,
    architecture_notes TEXT,
    tech_stack      TEXT,
    folder_structure TEXT,
    version         INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'approved', 'in_progress', 'complete')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plans_run ON plans(run_id);

-- ---------------------------------------------------------------------------
-- plan_steps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_steps (
    id              TEXT PRIMARY KEY,
    plan_id         TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    step_order      INTEGER NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    step_type       TEXT NOT NULL
                    CHECK (step_type IN ('scaffold', 'file', 'command', 'verify', 'git')),
    files_spec      TEXT,
    commands        TEXT,
    success_criteria TEXT,
    depends_on      TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'complete', 'failed', 'skipped')),
    completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_steps_plan ON plan_steps(plan_id, step_order);

-- ---------------------------------------------------------------------------
-- file_changes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_changes (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plan_step_id    TEXT REFERENCES plan_steps(id),
    file_path       TEXT NOT NULL,
    action          TEXT NOT NULL CHECK (action IN ('create', 'edit', 'delete')),
    diff            TEXT,
    agent           TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_file_changes_run ON file_changes(run_id);
CREATE INDEX IF NOT EXISTS idx_file_changes_project ON file_changes(project_id, file_path);

-- ---------------------------------------------------------------------------
-- commands_executed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commands_executed (
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

CREATE INDEX IF NOT EXISTS idx_commands_run ON commands_executed(run_id);

-- ---------------------------------------------------------------------------
-- errors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS errors (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    command_id      TEXT REFERENCES commands_executed(id),
    error_type      TEXT,
    message         TEXT NOT NULL,
    stack_trace     TEXT,
    context_files   TEXT,
    resolved        INTEGER NOT NULL DEFAULT 0,
    fix_summary     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_errors_run ON errors(run_id);

-- ---------------------------------------------------------------------------
-- git_operations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS git_operations (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    operation       TEXT NOT NULL
                    CHECK (operation IN ('init', 'add', 'commit', 'push', 'create_repo')),
    commit_hash     TEXT,
    commit_message  TEXT,
    remote_url      TEXT,
    success         INTEGER NOT NULL,
    details         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_git_ops_project ON git_operations(project_id);

-- ---------------------------------------------------------------------------
-- memory_entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_entries (
    id              TEXT PRIMARY KEY,
    project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
    memory_type     TEXT NOT NULL
                    CHECK (memory_type IN ('architecture', 'convention', 'dependency', 'failure', 'preference')),
    key             TEXT NOT NULL,
    content         TEXT NOT NULL,
    source_run_id   TEXT REFERENCES runs(id),
    importance      INTEGER NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memory_project ON memory_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_entries(memory_type);
CREATE INDEX IF NOT EXISTS idx_memory_key ON memory_entries(key);

-- ---------------------------------------------------------------------------
-- architecture_decisions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS architecture_decisions (
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

CREATE INDEX IF NOT EXISTS idx_adr_project ON architecture_decisions(project_id);

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('llm_model', '"gpt-4o"'),
    ('auto_push_github', 'false'),
    ('max_debug_retries', '5'),
    ('milestone_commits', 'true'),
    ('command_allowlist_enabled', 'false');
