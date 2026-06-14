import { useCallback, useEffect, useMemo, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";

import ActivityPanel from "./ActivityPanel";
import ChatWorkspace, { DEFAULT_WELCOME } from "./ChatWorkspace";
import Sidebar from "./Sidebar";
import { useChatSessions } from "../hooks/useChatSessions";
import { useProjectRunner } from "../hooks/useProjectRunner";
import { useWorkspaceProject } from "../hooks/useWorkspaceProject";
import "./workspace/workspace.css";

export default function Workspace({ onClose }) {
  const [sidebarView, setSidebarView] = useState("projects");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [activityView, setActivityView] = useState("editor");
  const [searchQuery, setSearchQuery] = useState("");
  const [agentTask, setAgentTask] = useState(null);
  const [chatSettings, setChatSettings] = useState({
    agentMode: false,
    autonomousMode: false,
    useWorkspaceContext: false,
    model: "",
  });

  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    updateSession,
    deleteSession,
    getActiveSession,
  } = useChatSessions();

  const runner = useProjectRunner();

  const project = useWorkspaceProject({
    onRunnerReset: runner.resetRunner,
    onProjectOpened: runner.refreshRunStatus,
  });

  const activeSession = getActiveSession();
  const sessionMessages = activeSession?.messages || [DEFAULT_WELCOME];

  useEffect(() => {
    if (activeSessionId) return;
    if (sessions.length === 0) {
      createSession("New Chat");
      return;
    }
    setActiveSessionId(sessions[0].id);
  }, [activeSessionId, createSession, sessions, setActiveSessionId]);

  const handleChatSettingsChange = useCallback((patch) => {
    setChatSettings((current) => {
      const next = { ...current, ...patch };
      if (patch.agentMode === false) {
        next.autonomousMode = false;
      }
      if (patch.agentMode === true) {
        next.useWorkspaceContext = true;
      }
      return next;
    });
  }, []);

  const handleNewChat = useCallback(() => {
    createSession("New Chat");
    setSidebarView("history");
    setSidebarExpanded(true);
  }, [createSession]);

  const handleSelectSession = useCallback(
    (sessionId) => {
      setActiveSessionId(sessionId);
      setSidebarView("history");
    },
    [setActiveSessionId]
  );

  const handleMessagesChange = useCallback(
    (messages) => {
      if (!activeSessionId) return;
      updateSession(activeSessionId, { messages });
    },
    [activeSessionId, updateSession]
  );

  const handleSessionTitleChange = useCallback(
    (title) => {
      if (!activeSessionId) return;
      updateSession(activeSessionId, { title });
    },
    [activeSessionId, updateSession]
  );

  const handleNavigate = useCallback((viewId) => {
    setSidebarView(viewId);
    setSidebarExpanded(true);
    if (viewId === "new-chat") {
      handleNewChat();
    }
  }, [handleNewChat]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    const results = [];

    project.projects.forEach((projectName) => {
      if (projectName.toLowerCase().includes(query)) {
        results.push({
          key: `project-${projectName}`,
          label: projectName,
          meta: "Project",
          onSelect: () => project.openProject(projectName),
        });
      }
    });

    project.files.forEach((filePath) => {
      if (filePath.toLowerCase().includes(query)) {
        results.push({
          key: `file-${filePath}`,
          label: filePath,
          meta: "File",
          onSelect: () => project.openFile(filePath),
        });
      }
    });

    sessions.forEach((session) => {
      if (session.title.toLowerCase().includes(query)) {
        results.push({
          key: `chat-${session.id}`,
          label: session.title,
          meta: "Chat",
          onSelect: () => handleSelectSession(session.id),
        });
      }
    });

    return results.slice(0, 20);
  }, [handleSelectSession, project.files, project.openFile, project.openProject, project.projects, searchQuery, sessions]);

  async function handleProjectCreated(projectName) {
    await project.reloadProjects();
    await project.openProject(projectName);
    setActivityView("explorer");
    setSidebarView("projects");
  }

  async function handleFilesChanged() {
    if (project.selectedProject) {
      await project.refreshProjectFiles(project.selectedProject, "Workspace updated by AI agent.");
      if (project.selectedFile) {
        await project.openFile(project.selectedFile);
      }
    }
  }

  async function handleWorkspaceChanged() {
    if (project.selectedProject) {
      await project.refreshProjectFiles(project.selectedProject, "Workspace updated from source control.");
      if (project.selectedFile) {
        await project.openFile(project.selectedFile);
      }
    }
  }

  function handleOpenFileFromChat(filePath) {
    if (!filePath) return;
    setActivityView("editor");
    project.openFile(filePath);
  }

  const chatSessionKey = activeSessionId || "default-chat";

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "beingai-workspace-layout",
    storage: localStorage,
  });

  return (
    <div className="workspace-shell" style={{ inset: 0, position: "fixed", zIndex: 1000 }}>
      <header className="ws-header">
        <div className="ws-header-brand">
          <strong>BEING AI</strong>
          <span style={{ color: "var(--ws-muted)", fontSize: "0.82rem" }}>
            {project.selectedProject || "No project selected"}
          </span>
        </div>

        <div className="ws-header-actions">
          <span
            className={
              runner.projectRunning ? "ws-status ws-status-running" : "ws-status"
            }
          >
            {runner.runStatus}
          </span>
          {runner.projectRunning ? (
            <button
              className="ws-btn ws-btn-danger"
              disabled={!project.selectedProject}
              onClick={() => runner.stopProject(project.selectedProject, project.setError)}
              type="button"
            >
              Stop
            </button>
          ) : (
            <button
              className="ws-btn ws-btn-primary"
              disabled={!project.selectedProject}
              onClick={() => {
                setActivityView("terminal");
                runner.runProject(project.selectedProject, project.setError);
              }}
              type="button"
            >
              Run
            </button>
          )}
          <button className="ws-btn" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </header>

      <div className="ws-main-layout">
        <Group
          className="ws-panel-group"
          defaultLayout={defaultLayout}
          id="beingai-workspace-layout"
          onLayoutChanged={onLayoutChanged}
          orientation="horizontal"
        >
          <Panel className="ws-panel" defaultSize={18} id="sidebar" maxSize={28} minSize={12}>
            <Sidebar
              activeSessionId={activeSessionId}
              activeView={sidebarView}
              agentTask={agentTask}
              chatSessions={sessions}
              chatSettings={chatSettings}
              expanded={sidebarExpanded}
              onChatSettingsChange={handleChatSettingsChange}
              onDeleteSession={deleteSession}
              onNavigate={handleNavigate}
              onNewChat={handleNewChat}
              onSearchQueryChange={setSearchQuery}
              onSelectProject={project.openProject}
              onSelectSession={handleSelectSession}
              onToggleExpanded={() => setSidebarExpanded((current) => !current)}
              projects={project.projects}
              searchQuery={searchQuery}
              searchResults={searchResults}
              selectedProject={project.selectedProject}
              selectedProjectLabel={project.selectedProject}
            />
          </Panel>

          <Separator className="ws-resize-handle ws-resize-handle-horizontal" />

          <Panel className="ws-panel" defaultSize={52} id="chat" minSize={35}>
            <ChatWorkspace
              key={chatSessionKey}
              chatSettings={chatSettings}
              initialMessages={sessionMessages}
              onAgentTaskChange={setAgentTask}
              onChatSettingsChange={handleChatSettingsChange}
              onFilesChanged={handleFilesChanged}
              onMessagesChange={handleMessagesChange}
              onOpenFile={handleOpenFileFromChat}
              onProjectCreated={handleProjectCreated}
              onSessionTitleChange={handleSessionTitleChange}
              selectedProject={project.selectedProject}
              sessionId={chatSessionKey}
            />
          </Panel>

          <Separator className="ws-resize-handle ws-resize-handle-horizontal" />

          <Panel className="ws-panel" defaultSize={30} id="activity" minSize={22}>
            <ActivityPanel
              activeView={activityView}
              content={project.content}
              error={project.error}
              files={project.files}
              folders={project.folders}
              isDirty={project.isDirty}
              loading={project.loading}
              message={project.message}
              onContentChange={(value) => {
                project.setContent(value);
                project.setIsDirty(true);
              }}
              onCreateFile={project.createFile}
              onCreateFolder={project.createFolder}
              onDelete={project.deleteSelectedPath}
              onOpenFile={(filePath) => {
                setActivityView("editor");
                project.openFile(filePath);
              }}
              onRename={project.renameSelectedPath}
              onRun={() => runner.runProject(project.selectedProject, project.setError)}
              onSave={project.saveFile}
              onSelectFolder={project.setSelectedFolder}
              onStop={() => runner.stopProject(project.selectedProject, project.setError)}
              onViewChange={setActivityView}
              onWorkspaceChanged={handleWorkspaceChanged}
              projectRunning={runner.projectRunning}
              runStatus={runner.runStatus}
              saving={project.saving}
              selectedFile={project.selectedFile}
              selectedFolder={project.selectedFolder}
              selectedProject={project.selectedProject}
              terminalLogs={runner.terminalLogs}
              terminalRef={runner.terminalRef}
            />
          </Panel>
        </Group>
      </div>
    </div>
  );
}
