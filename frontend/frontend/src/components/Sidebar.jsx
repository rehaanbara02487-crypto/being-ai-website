import FileExplorer from "./workspace/FileExplorer";
import IconTooltip from "./workspace/IconTooltip";

const PRIMARY_NAV = [
  { id: "explorer", icon: "▤", label: "Explorer", shortcut: "Ctrl+Shift+E" },
  { id: "chat", icon: "✦", label: "Chat", shortcut: "Alt+2" },
  { id: "search", icon: "⌕", label: "Search", shortcut: "Alt+3" },
  { id: "agent", icon: "◎", label: "Agent", shortcut: "Alt+4" },
  { id: "settings", icon: "⚙", label: "Settings", shortcut: "Ctrl+," },
];

export default function Sidebar({
  activeView,
  expanded,
  onNavigate,
  onFocusNav,
  navButtonRefs,
  projects,
  workspaces,
  recentWorkspaces,
  selectedProject,
  onSelectProject,
  onOpenFolder,
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
  chatSearchQuery,
  onChatSearchQueryChange,
  onRenameSession,
  onPinSession,
  onDownloadSession,
  ollamaStatus,
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
}) {
  function renderPanelBody() {
    switch (activeView) {
      case "explorer":
        return (
          <>
            <button
              className="ws-btn ws-btn-primary ws-full-width"
              onClick={onOpenFolder}
              type="button"
            >
              Open Folder…
            </button>

            {recentWorkspaces.length > 0 && (
              <>
                <div className="ws-sidebar-section-label">Recent Folders</div>
                {recentWorkspaces.map((workspace) => (
                  <button
                    key={`recent-${workspace.slug}`}
                    className={`ws-list-item ${workspace.slug === selectedProject ? "active" : ""}`}
                    onClick={() => onSelectProject(workspace.slug)}
                    title={workspace.path}
                    type="button"
                  >
                    <div>{workspace.name || workspace.slug}</div>
                    <div className="ws-list-item-meta">{workspace.path}</div>
                  </button>
                ))}
              </>
            )}

            <div className="ws-sidebar-section-label">Projects</div>
            {projects.length ? (
              projects.map((project) => {
                const workspace = workspaces.find((item) => item.slug === project);
                return (
                  <button
                    key={project}
                    className={`ws-list-item ${project === selectedProject ? "active" : ""}`}
                    onClick={() => onSelectProject(project)}
                    title={workspace?.path || project}
                    type="button"
                  >
                    <div>{workspace?.name || project}</div>
                    {workspace?.path && (
                      <div className="ws-list-item-meta">{workspace.path}</div>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="ws-empty-inline">No projects yet. Open a folder or scaffold one from Chat.</div>
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
            <input
              aria-label="Search chat history"
              className="ws-search-input"
              onChange={(event) => onChatSearchQueryChange?.(event.target.value)}
              placeholder="Search chats..."
              value={chatSearchQuery || ""}
            />
            <div className="ws-sidebar-section-label">History</div>
            {chatSessions.length ? (
              chatSessions.map((session) => (
                <div key={session.id} className="ws-history-row">
                  <button
                    className={`ws-list-item ${session.id === activeSessionId ? "active" : ""}`}
                    onClick={() => onSelectSession(session.id)}
                    onDoubleClick={() => {
                      const nextTitle = window.prompt("Rename chat", session.title);
                      if (nextTitle) onRenameSession?.(session.id, nextTitle);
                    }}
                    type="button"
                  >
                    {session.pinned ? "📌 " : ""}
                    {session.title}
                  </button>
                  <button
                    aria-label={`Pin ${session.title}`}
                    className="ws-btn ws-btn-ghost"
                    onClick={() => onPinSession?.(session.id, !session.pinned)}
                    type="button"
                  >
                    ☆
                  </button>
                  <button
                    aria-label={`Export ${session.title}`}
                    className="ws-btn ws-btn-ghost"
                    onClick={() => onDownloadSession?.(session.id)}
                    type="button"
                  >
                    ↓
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
              <div className="ws-empty-inline">No saved chats for this workspace yet.</div>
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

      case "agent":
        return (
          <>
            <div className="ws-sidebar-section-label">Agent Tasks</div>
            {agentTask ? (
              <div className="ws-agent-task-card">
                <strong>{agentTask.status}</strong>
                <span>{agentTask.current_step}</span>
                {agentTask.iteration ? <span>Iteration {agentTask.iteration}</span> : null}
              </div>
            ) : (
              <div className="ws-empty-inline">
                Enable Agent Mode in Settings, then send an edit prompt from Chat to start a task.
              </div>
            )}
            <div className="ws-sidebar-context-card" style={{ marginTop: "12px" }}>
              <strong>Autonomous edits</strong>
              <p className="ws-muted-copy">
                Prompts like “Add dark mode”, “Fix build errors”, or “Add pagination” analyze the
                repository, plan multi-file edits, and apply them automatically.
              </p>
            </div>
          </>
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
            {ollamaStatus?.models?.length > 0 && (
              <select
                className="ws-search-input"
                onChange={(event) => onChatSettingsChange({ model: event.target.value })}
                value={chatSettings.model || ollamaStatus.model}
              >
                {ollamaStatus.models.map((modelName) => (
                  <option key={modelName} value={modelName}>
                    {modelName}
                  </option>
                ))}
              </select>
            )}
            {ollamaStatus && (
              <div className="ws-muted-copy" style={{ fontSize: "0.78rem", marginTop: "8px" }}>
                {ollamaStatus.message}
                {ollamaStatus.context_window_chars
                  ? ` · Context ${ollamaStatus.context_window_chars} chars`
                  : ""}
              </div>
            )}

            <div className="ws-sidebar-section-label">Project Generation Target</div>
            <label className="ws-settings-row">
              <input
                checked={chatSettings.greenfieldTarget === "default"}
                name="greenfield-target"
                onChange={() => onChatSettingsChange({ greenfieldTarget: "default" })}
                type="radio"
              />
              Default workspace folder
            </label>
            <label className="ws-settings-row">
              <input
                checked={chatSettings.greenfieldTarget === "current"}
                disabled={!selectedProject}
                name="greenfield-target"
                onChange={() => onChatSettingsChange({ greenfieldTarget: "current" })}
                type="radio"
              />
              Current workspace folder
            </label>
            <label className="ws-settings-row">
              <input
                checked={chatSettings.greenfieldTarget === "custom"}
                name="greenfield-target"
                onChange={() => onChatSettingsChange({ greenfieldTarget: "custom" })}
                type="radio"
              />
              Custom folder
            </label>
            {chatSettings.greenfieldTarget === "custom" && (
              <div className="ws-muted-copy" style={{ fontSize: "0.82rem", marginTop: "6px" }}>
                {chatSettings.greenfieldTargetPath || "Use Open Folder before generating, or pick below."}
              </div>
            )}
            {chatSettings.greenfieldTarget === "custom" && (
              <button
                className="ws-btn ws-full-width"
                onClick={() => onChatSettingsChange({ pickCustomTarget: true })}
                type="button"
              >
                Choose Target Folder…
              </button>
            )}
          </>
        );

      default:
        return null;
    }
  }

  const activeLabel = PRIMARY_NAV.find((item) => item.id === activeView)?.label || "Navigation";
  const panelOpen = expanded && Boolean(activeView);

  return (
    <aside
      aria-label="Workspace navigation"
      className={`ws-sidebar-shell ${panelOpen ? "expanded" : "collapsed"}`}
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
              aria-pressed={activeView === item.id}
              className={`ws-sidebar-nav-btn ${activeView === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
              onFocus={() => onFocusNav?.(index)}
              type="button"
            >
              {item.icon}
            </button>
          </IconTooltip>
        ))}
      </div>

      <div
        aria-hidden={!panelOpen}
        className={`ws-sidebar-expanded-panel ${panelOpen ? "open" : ""}`}
      >
        <div className="ws-sidebar-panel">
          <div className="ws-sidebar-panel-header">
            {activeView === "settings" && (
              <button
                className="ws-sidebar-back-btn"
                onClick={() => onNavigate("explorer")}
                type="button"
              >
                ← Back to Explorer
              </button>
            )}
            <span>{activeLabel}</span>
          </div>
          <div className="ws-sidebar-panel-body">{renderPanelBody()}</div>
        </div>
      </div>
    </aside>
  );
}

export { PRIMARY_NAV };
