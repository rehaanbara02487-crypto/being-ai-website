# LangGraph Orchestration

| Module | Purpose |
|--------|---------|
| `state.py` | `GraphState` TypedDict |
| `nodes.py` | Node functions wrapping each agent |
| `edges.py` | Conditional routing helpers |
| `supervisor.py` | Route to next agent |
| `build.py` | `compile()` → runnable graph |

Flow: `supervisor` → specialist → `supervisor` → … → `END`
