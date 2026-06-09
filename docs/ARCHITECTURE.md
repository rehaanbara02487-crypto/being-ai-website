# BeingAI — System Architecture

## 1. Design Principles

| Principle | Implication |
|-----------|-------------|
| **Local-first** | No multi-tenancy, no cloud auth. Single user, single machine. |
| **Autonomous loops** | Agents run until success criteria met or user interrupts. |
| **Inspectable** | Every file write, command, and decision is logged to SQLite. |
| **Recoverable** | Git commits at milestones; memory survives restarts. |
| **Bounded tools** | Tools enforce workspace roots, command allowlists, and confirmation gates. |

## 2. High-Level Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        User (Browser)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP / WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                   Frontend (Next.js)                              │
│  Chat UI · Project dashboard · Live terminal stream · Settings    │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST + SSE/WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                   Backend (FastAPI)                               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ API Layer   │  │ Orchestrator │  │ Tool Registry           │ │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬─────────────┘ │
│         │                │                       │               │
│         │         ┌──────▼───────┐               │               │
│         │         │  LangGraph   │◄──────────────┘               │
│         │         │  StateGraph  │                               │
│         │         └──────┬───────┘                               │
│         │    ┌───────────┼───────────┐                           │
│         │    ▼           ▼           ▼                           │
│         │ Planner    Coder      Terminal                         │
│         │    │           │           │                           │
│         │    └─────► Debug ◄──── GitHub ◄──► Memory               │
│         │                                                        │
│  ┌──────▼──────────────────────────────────────────────────────┐ │
│  │ SQLite (beingai.db) + Project Workspaces (data/workspaces/) │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   Filesystem           Terminal              Git / GitHub API
   VS Code (optional)   subprocess            gh / REST
```

## 3. Folder Structure

```
being-ai/
├── README.md
├── .env.example                    # API keys, workspace root, model config
├── .gitignore
│
├── docs/                           # Architecture & design (you are here)
│   ├── ARCHITECTURE.md
│   ├── AGENTS.md
│   ├── DATABASE.md
│   ├── TOOLS.md
│   └── ROADMAP.md
│
├── frontend/                       # Next.js + Tailwind + TypeScript
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   └── src/
│       ├── app/                    # App Router pages
│       │   ├── layout.tsx
│       │   ├── page.tsx            # Home / new project
│       │   ├── projects/
│       │   │   └── [id]/
│       │   │       └── page.tsx    # Project workspace view
│       │   └── settings/
│       │       └── page.tsx
│       ├── components/
│       │   ├── chat/               # Message list, input, streaming
│       │   ├── project/            # File tree, plan viewer
│       │   ├── terminal/           # Live command output
│       │   └── ui/                 # Shared primitives (shadcn-style)
│       ├── lib/
│       │   ├── api.ts              # Backend client
│       │   └── websocket.ts        # Real-time agent events
│       └── types/
│           └── index.ts            # Shared TS types (mirror backend schemas)
│
├── backend/                        # FastAPI + LangGraph
│   ├── requirements.txt
│   ├── pyproject.toml              # Optional: ruff, pytest config
│   └── app/
│       ├── main.py                 # FastAPI entry, CORS, lifespan
│       ├── config.py               # Settings from env
│       │
│       ├── api/                    # HTTP routes
│       │   ├── router.py
│       │   ├── projects.py
│       │   ├── sessions.py
│       │   ├── agents.py           # Start/stop/stream runs
│       │   └── health.py
│       │
│       ├── core/                   # Cross-cutting concerns
│       │   ├── events.py           # Event bus for SSE/WebSocket
│       │   ├── exceptions.py
│       │   └── security.py         # Path sandboxing, command policy
│       │
│       ├── db/                     # Persistence layer
│       │   ├── database.py         # SQLAlchemy engine + session
│       │   ├── models.py           # ORM models
│       │   ├── schema.sql          # Canonical DDL (see DATABASE.md)
│       │   └── migrations/         # Alembic revisions
│       │
│       ├── agents/                 # Agent definitions (prompts + logic)
│       │   ├── base.py             # BaseAgent, shared LLM config
│       │   ├── planner.py
│       │   ├── coder.py
│       │   ├── terminal.py
│       │   ├── debug.py
│       │   ├── github.py
│       │   └── memory.py
│       │
│       ├── graph/                  # LangGraph orchestration
│       │   ├── state.py            # GraphState TypedDict
│       │   ├── nodes.py            # Node functions per agent
│       │   ├── edges.py            # Conditional routing
│       │   ├── supervisor.py       # Route to next agent
│       │   └── build.py            # compile() → CompiledGraph
│       │
│       ├── tools/                  # Tool implementations
│       │   ├── registry.py         # Register + dispatch tools
│       │   ├── base.py             # BaseTool protocol
│       │   ├── filesystem.py
│       │   ├── terminal.py
│       │   ├── git.py
│       │   ├── github_api.py
│       │   ├── vscode.py
│       │   └── memory_store.py
│       │
│       ├── models/                 # Pydantic schemas (API + agent I/O)
│       │   ├── project.py
│       │   ├── session.py
│       │   ├── plan.py
│       │   ├── message.py
│       │   └── agent_run.py
│       │
│       └── services/               # Business logic (thin layer over db + graph)
│           ├── project_service.py
│           ├── agent_service.py
│           └── memory_service.py
│
├── data/                           # Runtime data (gitignored)
│   ├── beingai.db                  # SQLite database
│   └── workspaces/                 # Generated project roots
│       └── {project-slug}/
│
└── scripts/
    ├── init_db.py                  # Bootstrap schema
    └── dev.sh / dev.ps1            # Start frontend + backend
```

## 4. Request Lifecycle

Example: *"Build a Flutter expense tracker"*

```
1. User submits prompt via frontend
2. API creates/loads Project + Session, persists user message
3. AgentService invokes LangGraph with initial GraphState
4. SUPERVISOR → PLANNER
   - Planner produces structured Plan (phases, files, deps, commands)
   - Plan saved to DB; streamed to UI
5. SUPERVISOR → CODER (per plan step)
   - Coder calls filesystem tools: mkdir, write_file, edit_file
   - Each mutation logged as file_change
6. SUPERVISOR → TERMINAL
   - Runs flutter create, pub get, etc.
   - stdout/stderr captured; exit code stored
7. If exit_code ≠ 0 → SUPERVISOR → DEBUG
   - Debug reads error output + relevant files
   - Produces fix actions → back to CODER or TERMINAL
8. Loop until plan complete + verification commands pass
9. SUPERVISOR → GITHUB (if enabled)
   - git init, commit, gh repo create, push
10. SUPERVISOR → MEMORY
    - Summarize architecture decisions, deps, conventions
11. Graph ends; final status streamed; session marked complete
```

## 5. Communication Patterns

| Channel | Use |
|---------|-----|
| **REST** | CRUD projects, sessions, settings; start agent run |
| **SSE or WebSocket** | Stream agent thoughts, tool calls, terminal output, progress |
| **SQLite** | Durable history, memory retrieval, audit trail |

## 6. Configuration Surface

```env
# .env.example
BEINGAI_WORKSPACE_ROOT=./data/workspaces
BEINGAI_DB_PATH=./data/beingai.db
OPENAI_API_KEY=                    # or ANTHROPIC_API_KEY, etc.
BEINGAI_LLM_MODEL=gpt-4o
GITHUB_TOKEN=                      # For GitHub Agent
BEINGAI_AUTO_PUSH=false            # Require explicit user opt-in
BEINGAI_COMMAND_ALLOWLIST=         # Optional restrict shell commands
```

## 7. Security Model (Local Single-User)

- **Workspace sandbox:** All filesystem and terminal operations scoped to `data/workspaces/{project}/` unless user overrides.
- **No remote code execution:** Backend runs locally; LLM only proposes tool calls.
- **Destructive ops:** `rm -rf`, force push, etc. require explicit settings or user confirmation in UI.
- **Secrets:** `.env` never written into generated projects by default; GitHub token stays in BeingAI config.

## 8. Extension Points

| Extension | Hook |
|-----------|------|
| New agent | Add `agents/foo.py` + node in `graph/nodes.py` + supervisor rule |
| New tool | Implement `BaseTool`, register in `tools/registry.py` |
| New LLM provider | Swap `agents/base.py` LLM factory |
| New UI panel | `frontend/src/components/` + API event type |

## 9. Key Dependencies (Planned)

**Backend:** `fastapi`, `uvicorn`, `langgraph`, `langchain-core`, `sqlalchemy`, `alembic`, `pydantic-settings`, `httpx`, `gitpython`, `pygithub`

**Frontend:** `next`, `react`, `tailwindcss`, `@tanstack/react-query`, `zustand` (optional state)
