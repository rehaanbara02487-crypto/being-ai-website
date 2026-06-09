# BeingAI

A local, single-user AI software engineer. Describe software in natural language; BeingAI plans, builds, debugs, commits, and remembers projects autonomously.

**Not a SaaS product** — runs on your machine, one user, full filesystem and terminal access.

## Quick Start (coming in Phase 1)

```bash
# Backend
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System overview, data flow, deployment model |
| [Agents](docs/AGENTS.md) | LangGraph agent design, state, routing |
| [Database](docs/DATABASE.md) | SQLite schema, migrations |
| [Tools](docs/TOOLS.md) | Tool interfaces and safety boundaries |
| [Roadmap](docs/ROADMAP.md) | Phased development plan |

## Tech Stack

- **Frontend:** Next.js, Tailwind CSS, TypeScript
- **Backend:** FastAPI, Python, LangGraph
- **Database:** SQLite (local)
- **Integrations:** Git, GitHub API, VS Code, Terminal

## License

Private — personal use.
