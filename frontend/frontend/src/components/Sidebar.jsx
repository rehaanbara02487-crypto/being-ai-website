import FileExplorer from "./workspace/FileExplorer";
import IconTooltip from "./workspace/IconTooltip";

const PRIMARY_NAV = [
  { id: "explorer", icon: "▤", label: "Explorer", shortcut: "Alt+1" },
  { id: "chat", icon: "✦", label: "Chat", shortcut: "Alt+2" },
  { id: "search", icon: "⌕", label: "Search", shortcut: "Alt+3" },
  { id: "terminal", icon: "▣", label: "Terminal", shortcut: "Alt+4" },
  { id: "git", icon: "⎇", label: "Source Control", shortcut: "Alt+5" },
];

export default function Sidebar({
  activeView,
  expanded,
  onNavigate,
  onToggleExpanded,
  onFocusNav,
  navButtonRefs,
  projects,
  selectedProject,
  onSelectProject,
  files,
  folders,
  selectedFile,
  selectedFolder,
  onSelectFolder,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
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
  runStatus,
  projectRunning,
  onRunProject,
  onOpenTerminal,
  onOpenGit,
}) {
  function renderPanelBody() {
    switch (activeView) {
      case "explorer":
        return (
          <>
            <div className="ws-sidebar-section-label">Projects</div>
            {projects.length ? (
              projects.map((project) => (
                <button
                  key={project}
                  className={`ws-list-item ${project === selectedProject ? "active" : ""}`}
                  onClick={() => onSelectProject(project)}
                  type="button"
                >
                  {project}
                </button>
              ))
            ) : (
              <div className="ws-empty-inline">No projects yet. Use Chat to scaffold one.</div>
            )}

            <div className="ws-sidebar-section-label">Files</div>
            <FileExplorer
              files={files}
              folders={folders}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onDelete={onDelete}
              onOpenFile={onOpenFile}
              onRename={onRename}
              onSelectFolder={onSelectFolder}
              selectedFile={selectedFile}
              selectedFolder={selectedFolder}
              selectedProject={selectedProject}
            />
          </>
        );

      case "chat":
        return (
          <>
            <button className="ws-btn ws-btn-primary ws-full-width" onClick={onNewChat} type="button">
              New Chat
            </button>
            <div className="ws-sidebar-section-label">History</div>
            {chatSessions.length ? (
              chatSessions.map((session) => (
                <div key={session.id} className="ws-history-row">
                  <button
                    className={`ws-list-item ${session.id === activeSessionId ? "active" : ""}`}
                    onClick={() => onSelectSession(session.id)}
                    type="button"
                  >
                    {session.title}
                  </button>
                  <button
                    aria-label={`Delete ${session.title}`}
                    className="ws-btn ws-btn-ghost"
                    onClick={() => onDeleteSession(session.id)}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="ws-empty-inline">No saved chats yet.</div>
            )}

            {agentTask && (
              <>
                <div className="ws-sidebar-section-label">Agent Task</div>
                <div className="ws-agent-task-card">
                  <strong>{agentTask.status}</strong>
                  <span>{agentTask.current_step}</span>
                </div>
              </>
            )}
          </>
        );

      case "search":
        return (
          <>
            <input
              aria-label="Search projects, files, and chats"
              autoFocus
              className="ws-search-input"
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search projects, files, chats..."
              value={searchQuery}
            />
            {searchQuery.trim() ? (
              searchResults.length ? (
                searchResults.map((result) => (
                  <button
                    key={result.key}
                    className="ws-list-item"
                    onClick={result.onSelect}
                    type="button"
                  >
                    <div>{result.label}</div>
                    <div className="ws-list-item-meta">{result.meta}</div>
                  </button>
                ))
              ) : (
                <div className="ws-empty-inline">No matches found.</div>
              )
            ) : (
              <div className="ws-empty-inline">Type to search across projects, files, and chat history.</div>
            )}
          </>
        );

      case "terminal":
        return (
          <div className="ws-sidebar-context-card">
            <strong>Terminal</strong>
            <p className="ws-muted-copy">
              Run output appears in the editor panel terminal dock.
            </p>
            <div className="ws-status-row">
              <span>Status:</span>
              <span className={projectRunning ? "ws-status ws-status-running" : "ws-status"}>
                {runStatus}
              </span>
            </div>
            <button className="ws-btn ws-full-width" onClick={onOpenTerminal} type="button">
              Open Terminal Panel
            </button>
            <button
              className="ws-btn ws-btn-primary ws-full-width"
              disabled={!selectedProject || projectRunning}
              onClick={onRunProject}
              type="button"
            >
              Run Project
            </button>
          </div>
        );

      case "git":
        return (
          <div className="ws-sidebar-context-card">
            <strong>Source Control</strong>
            <p className="ws-muted-copy">
              Review changes, commit, and restore from the Git panel on the right.
            </p>
            <button className="ws-btn ws-btn-primary ws-full-width" onClick={onOpenGit} type="button">
              Open Source Control
            </button>
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
          </>
        );

      default:
        return null;
    }
  }

  const activeLabel =
    PRIMARY_NAV.find((item) => item.id === activeView)?.label ||
    (activeView === "settings" ? "Settings" : "Navigation");

  return (
    <aside
      aria-label="Workspace navigation"
      className={`ws-sidebar-shell ${expanded ? "expanded" : "collapsed"}`}
    >
      <div className="ws-sidebar-rail" role="toolbar">
        {PRIMARY_NAV.map((item, index) => (
          <IconTooltip key={item.id} label={item.label} shortcut={item.shortcut}>
            <button
              ref={(node) => {
                navButtonRefs.current[index] = node;
              }}
              aria-current={activeView === item.id ? "page" : undefined}
              aria-label={item.label}
              className={`ws-sidebar-nav-btn ${activeView === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
              onFocus={() => onFocusNav?.(index)}
              type="button"
            >
              {item.icon}
            </button>
          </IconTooltip>
        ))}

        <div className="ws-sidebar-rail-footer">
          <IconTooltip label="Settings" shortcut="Alt+,">
            <button
              aria-current={activeView === "settings" ? "page" : undefined}
              aria-label="Settings"
              className={`ws-sidebar-nav-btn ${activeView === "settings" ? "active" : ""}`}
              onClick={() => onNavigate("settings")}
              type="button"
            >
              ⚙
            </button>
          </IconTooltip>
          <IconTooltip label={expanded ? "Collapse sidebar" : "Expand sidebar"} shortcut="Ctrl+B">
            <button
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
              className="ws-sidebar-nav-btn"
              onClick={onToggleExpanded}
              type="button"
            >
              {expanded ? "‹" : "›"}
            </button>
          </IconTooltip>
        </div>
      </div>

      <div
        aria-hidden={!expanded}
        className={`ws-sidebar-expanded-panel ${expanded ? "open" : ""}`}
      >
        <div className="ws-sidebar-panel">
          <div className="ws-sidebar-panel-header">{activeLabel}</div>
          <div className="ws-sidebar-panel-body">{renderPanelBody()}</div>
        </div>
      </div>
    </aside>
  );
}

export { PRIMARY_NAV };
