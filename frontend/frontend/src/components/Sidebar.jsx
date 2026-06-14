const NAV_ITEMS = [
  { id: "new-chat", icon: "✦", label: "New Chat" },
  { id: "search", icon: "⌕", label: "Search" },
  { id: "projects", icon: "▤", label: "Projects" },
  { id: "history", icon: "☰", label: "Chat History" },
  { id: "agent", icon: "◎", label: "Agent Tasks" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

export default function Sidebar({
  activeView,
  expanded,
  onToggleExpanded,
  onNavigate,
  projects,
  selectedProject,
  onSelectProject,
  chatSessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  agentTask,
  chatSettings,
  onChatSettingsChange,
  selectedProjectLabel,
}) {
  function renderPanelBody() {
    switch (activeView) {
      case "new-chat":
        return (
          <>
            <div className="ws-greenfield-hint">
              Start a new conversation or describe a project to scaffold with Agent Mode.
            </div>
            <button className="ws-btn ws-btn-primary" onClick={onNewChat} type="button" style={{ width: "100%" }}>
              Start New Chat
            </button>
          </>
        );

      case "search":
        return (
          <>
            <input
              className="ws-search-input"
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search projects, files, chats..."
              value={searchQuery}
            />
            {searchResults.length ? (
              searchResults.map((result) => (
                <button
                  key={result.key}
                  className="ws-list-item"
                  onClick={result.onSelect}
                  type="button"
                >
                  <div>{result.label}</div>
                  <div style={{ color: "var(--ws-muted)", fontSize: "0.72rem" }}>{result.meta}</div>
                </button>
              ))
            ) : (
              <div style={{ color: "var(--ws-muted)", fontSize: "0.82rem" }}>No matches.</div>
            )}
          </>
        );

      case "projects":
        return (
          <>
            <div className="ws-greenfield-hint">
              Select a project or ask AI: &quot;Build a modern React Todo App&quot;
            </div>
            {projects.map((project) => (
              <button
                key={project}
                className={`ws-list-item ${project === selectedProject ? "active" : ""}`}
                onClick={() => onSelectProject(project)}
                type="button"
              >
                {project}
              </button>
            ))}
            {!projects.length && (
              <div style={{ color: "var(--ws-muted)", fontSize: "0.82rem" }}>No projects yet.</div>
            )}
          </>
        );

      case "history":
        return chatSessions.length ? (
          chatSessions.map((session) => (
            <div key={session.id} style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
              <button
                className={`ws-list-item ${session.id === activeSessionId ? "active" : ""}`}
                onClick={() => onSelectSession(session.id)}
                style={{ flex: 1 }}
                type="button"
              >
                {session.title}
              </button>
              <button
                className="ws-btn ws-btn-ghost"
                onClick={() => onDeleteSession(session.id)}
                type="button"
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <div style={{ color: "var(--ws-muted)", fontSize: "0.82rem" }}>No saved chats yet.</div>
        );

      case "agent":
        return agentTask ? (
          <div className="ws-agent-task-card">
            <strong>{agentTask.status}</strong>
            <span>{agentTask.current_step}</span>
            <div style={{ marginTop: "8px" }}>
              Iteration {agentTask.iteration} / {agentTask.max_iterations}
            </div>
          </div>
        ) : (
          <div style={{ color: "var(--ws-muted)", fontSize: "0.82rem" }}>
            No active agent tasks. Enable Agent Mode + Autonomous Loop in chat.
          </div>
        );

      case "settings":
        return (
          <>
            <label className="ws-settings-row">
              <input
                checked={chatSettings.agentMode}
                onChange={(event) =>
                  onChatSettingsChange({ agentMode: event.target.checked })
                }
                type="checkbox"
              />
              Agent Mode
            </label>
            <label className="ws-settings-row">
              <input
                checked={chatSettings.autonomousMode}
                disabled={!chatSettings.agentMode || !selectedProject}
                onChange={(event) =>
                  onChatSettingsChange({ autonomousMode: event.target.checked })
                }
                type="checkbox"
              />
              Autonomous Loop
            </label>
            <label className="ws-settings-row">
              <input
                checked={chatSettings.useWorkspaceContext}
                disabled={!selectedProject}
                onChange={(event) =>
                  onChatSettingsChange({ useWorkspaceContext: event.target.checked })
                }
                type="checkbox"
              />
              Use Workspace Context
            </label>
            <input
              className="ws-search-input"
              onChange={(event) => onChatSettingsChange({ model: event.target.value })}
              placeholder="Model override (optional)"
              value={chatSettings.model}
            />
            <div style={{ color: "var(--ws-muted)", fontSize: "0.78rem" }}>
              Active project: {selectedProjectLabel || "None"}
            </div>
          </>
        );

      default:
        return null;
    }
  }

  const activeLabel = NAV_ITEMS.find((item) => item.id === activeView)?.label || "Navigation";

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <div className="ws-sidebar-rail">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`ws-sidebar-nav-btn ${activeView === item.id ? "active" : ""}`}
            onClick={() => onNavigate(item.id)}
            title={item.label}
            type="button"
          >
            {item.icon}
          </button>
        ))}
        <button
          className="ws-sidebar-nav-btn"
          onClick={onToggleExpanded}
          style={{ marginTop: "auto" }}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          type="button"
        >
          {expanded ? "‹" : "›"}
        </button>
      </div>

      {expanded && (
        <div className="ws-sidebar-expanded" style={{ width: 184 }}>
          <div className="ws-sidebar-panel">
            <div className="ws-sidebar-panel-header">{activeLabel}</div>
            <div className="ws-sidebar-panel-body">{renderPanelBody()}</div>
          </div>
        </div>
      )}
    </div>
  );
}
