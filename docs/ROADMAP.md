# BeingAI — Development Roadmap

## Overview

Phased delivery from skeleton → autonomous builder. Each phase produces a runnable increment. Do not skip Phase 0 (foundation).

```
Phase 0: Foundation          ████░░░░░░  Week 1
Phase 1: Core Loop           ██████░░░░  Weeks 2–3
Phase 2: Autonomous Build    ████████░░  Weeks 4–6
Phase 3: Polish & Memory     ██████████  Weeks 7–8
Phase 4: Advanced (future) ░░░░░░░░░░  Ongoing
```

---

## Phase 0: Foundation (Week 1)

**Goal:** Repo scaffold, DB, API shell, empty UI — no agents yet.

### Tasks

- [ ] Initialize monorepo structure (see `ARCHITECTURE.md`)
- [ ] Backend: FastAPI app with health endpoint, CORS, settings
- [ ] Database: `schema.sql`, SQLAlchemy models, `init_db.py`
- [ ] Frontend: Next.js + Tailwind shell (home, project list placeholder)
- [ ] `.env.example`, `.gitignore`, dev scripts (`dev.ps1`)
- [ ] Tool `BaseTool` protocol + empty registry
- [ ] Graph `GraphState` TypedDict (no nodes yet)

### Deliverable

```bash
./scripts/dev.ps1
# → Frontend at localhost:3000
# → Backend at localhost:8000/health → {"status":"ok"}
# → data/beingai.db created with all tables
```

### Success criteria

- Clean `git clone` → `pip install` + `npm install` → both servers start
- CRUD projects via API (create, list, get)

---

## Phase 1: Core Loop (Weeks 2–3)

**Goal:** Single-agent chat with filesystem + terminal tools; manual driving.

### Tasks

- [ ] Implement filesystem tools (`read`, `write`, `edit`, `list`)
- [ ] Implement terminal tool (`run_command` + streaming)
- [ ] Path sandbox middleware + audit logging
- [ ] **Planner Agent** (standalone endpoint: prompt → plan JSON)
- [ ] **Coder Agent** (plan step → file writes)
- [ ] LangGraph: supervisor + planner + coder nodes (linear flow)
- [ ] API: `POST /sessions/{id}/runs` + SSE event stream
- [ ] Frontend: chat UI + basic event log panel
- [ ] Persist messages, runs, run_events, file_changes

### Deliverable

User describes a simple project (e.g. "Python CLI todo app"); BeingAI produces a plan and creates files. User watches stream. No auto-debug yet.

### Success criteria

- End-to-end: prompt → plan displayed → files appear in `data/workspaces/`
- All tool calls visible in UI
- Session survives page refresh

---

## Phase 2: Autonomous Build (Weeks 4–6)

**Goal:** Full agent loop with terminal execution, debug, and git.

### Tasks

- [ ] **Terminal Agent** node + command step execution
- [ ] **Debug Agent** + retry loop (supervisor routing)
- [ ] Error parsing (npm, pip, flutter, pytest patterns)
- [ ] Plan steps: `command`, `verify` types
- [ ] **GitHub Agent**: git init, commit, `gh repo create`, push
- [ ] Confirmation gates for push and destructive ops
- [ ] Frontend: terminal output panel, file tree, plan step progress
- [ ] WebSocket or SSE for terminal streaming
- [ ] Cancel / interrupt running graph

### Deliverable

*"Build a Flutter expense tracker"* → project scaffolded, deps installed, code generated, `flutter analyze` passes, committed to git, optional push to GitHub.

### Success criteria

- ≥3 project types tested: Python CLI, Next.js app, Flutter app
- Debug agent resolves at least common dependency errors automatically
- Git commit created with sensible message

---

## Phase 3: Polish & Memory (Weeks 7–8)

**Goal:** Production-quality local assistant with persistent memory.

### Tasks

- [ ] **Memory Agent** + `memory_entries` CRUD
- [ ] Planner loads prior project context
- [ ] `architecture_decisions` ADR generation
- [ ] Milestone commits during build
- [ ] Project dashboard (history, files changed, commands run)
- [ ] Settings UI (model, auto-push, retries, workspace root)
- [ ] VS Code integration tools
- [ ] Run recovery from `graph_state` checkpoint
- [ ] Retention policies for large stdout blobs

### Deliverable

Second session on same project: BeingAI remembers stack choices and conventions. UI feels complete for daily use.

### Success criteria

- Memory influences new plans measurably (e.g. remembers "use Provider")
- Failed runs resumable
- Full audit trail browsable in UI

---

## Phase 4: Advanced (Ongoing)

**Goal:** Power-user features — not required for v1.

| Feature | Description |
|---------|-------------|
| Plan approval gate | User edits plan before execution |
| Multi-model routing | Cheap model for terminal, strong for coder |
| Embedding memory search | sqlite-vec for semantic recall |
| Plugin tools | User-defined scripts as tools |
| Test generation agent | Writes tests after coder completes |
| PR workflow | Branch → commit → open PR instead of direct push |
| Docker sandbox | Optional isolated command execution |
| Voice input | Describe projects verbally |

---

## Milestone Checklist (v1.0 Definition of Done)

- [ ] Natural language → complete project on disk
- [ ] Dependencies installed via terminal agent
- [ ] Errors detected and fixed without user intervention (within retry budget)
- [ ] Git commits at completion
- [ ] Optional GitHub push
- [ ] Project memory persists across sessions
- [ ] Full action history in SQLite
- [ ] Runs locally on Windows (primary) and macOS/Linux
- [ ] README with setup instructions

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| LLM writes broken code | Debug loop + verify steps in plan |
| Runaway terminal commands | Timeout, allowlist, max steps |
| Context window overflow | File tree summary, read selective ranges |
| GitHub token exposure | Env only, never written to workspaces |
| SQLite size bloat | Truncate stdout, event retention policy |
| Flutter/mobile SDK missing | Pre-flight check in terminal agent |

---

## Implementation Order (Recommended First PRs)

| PR | Scope | Est. size |
|----|-------|-----------|
| PR-1 | Phase 0 scaffold + DB + project CRUD | Medium |
| PR-2 | Tool base + filesystem tools + tests | Medium |
| PR-3 | Terminal tool + sandbox middleware | Small |
| PR-4 | Planner agent + API + plan persistence | Medium |
| PR-5 | LangGraph supervisor + planner + coder | Large |
| PR-6 | Frontend chat + SSE | Medium |
| PR-7 | Terminal + debug agents + retry loop | Large |
| PR-8 | GitHub agent | Medium |
| PR-9 | Memory agent + settings UI | Medium |
| PR-10 | Dashboard polish + docs | Small |

---

## Next Step

Begin **Phase 0** implementation: scaffold folders, `schema.sql`, FastAPI entry, Next.js shell. Refer to `ARCHITECTURE.md` for exact paths.
