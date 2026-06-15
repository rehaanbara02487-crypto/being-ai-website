import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";

import ActivityPanel from "./ActivityPanel";
import ChatWorkspace, { DEFAULT_WELCOME } from "./ChatWorkspace";
import Sidebar, { PRIMARY_NAV } from "./Sidebar";
import { useChatSessions } from "../hooks/useChatSessions";
import { useOllamaStatus } from "../hooks/useOllamaStatus";
import { useRepositoryIntelligence } from "../hooks/useRepositoryIntelligence";
import { useProjectRunner } from "../hooks/useProjectRunner";
import { useSidebarState } from "../hooks/useSidebarState";
import { useWorkspaceProject } from "../hooks/useWorkspaceProject";
import { logGeneration, recordGenerationStep, GENERATION_TAGS } from "../lib/agentDebug";
import "./workspace/workspace.css";

const SIDEBAR_TO_ACTIVITY = {
  explorer: "explorer",
  terminal: "terminal",
  git: "git",
};

export default function Workspace({ onClose }) {
  const [activityView, setActivityView] = useState("explorer");
  const [searchQuery, setSearchQuery] = useState("");
  const [agentTask, setAgentTask] = useState(null);
  const [focusedNavIndex, setFocusedNavIndex] = useState(0);
  const navButtonRefs = useRef([]);
  const [chatSettings, setChatSettings] = useState({
    agentMode: false,
    autonomousMode: false,
    useWorkspaceContext: false,
    model: "",
    greenfieldTarget: "default",
    greenfieldTargetPath: "",
  });

  const { sidebarView, setSidebarView, sidebarExpanded, setSidebarExpanded } = useSidebarState();

  const runner = useProjectRunner();

  const project = useWorkspaceProject({
    onRunnerReset: runner.resetRunner,
    onProjectOpened: runner.refreshRunStatus,
  });

  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    updateSession,
    renameSession,
    pinSession,
    deleteSession,
    downloadSessionMarkdown,
    searchSessions,
    getActiveSession,
  } = useChatSessions(project.selectedProject);

  const ollama = useOllamaStatus(chatSettings.model);
  useRepositoryIntelligence(project.selectedProject);

  useEffect(() => {
    if (project.workspaceKind !== "external" || !project.selectedProject) {
      return;
    }

    setChatSettings((current) => ({
      ...current,
      agentMode: true,
      useWorkspaceContext: true,
      greenfieldTarget: "in_place",
    }));
  }, [project.selectedProject, project.workspaceKind]);

  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [fixPrompt, setFixPrompt] = useState("");
  const activeSession = getActiveSession();
  const sessionMessages = activeSession?.messages || [DEFAULT_WELCOME];
  const visibleChatSessions = chatSearchQuery.trim()
    ? searchSessions(chatSearchQuery)
    : sessions;

  useEffect(() => {
    if (!project.selectedProject) return;
    if (activeSessionId) return;
    if (sessions.length === 0) {
      createSession("New Chat");
      return;
    }
    setActiveSessionId(sessions[0].id);
  }, [activeSessionId, createSession, project.selectedProject, sessions, setActiveSessionId]);

  const handleChatSettingsChange = useCallback(async (patch) => {
    if (patch.pickCustomTarget) {
      const result = await project.openFolderDialog();
      if (result?.path) {
        setChatSettings((current) => ({
          ...current,
          greenfieldTarget: "custom",
          greenfieldTargetPath: result.path,
        }));
      }
      return;
    }

    setChatSettings((current) => {
      const next = { ...current, ...patch };
      delete next.pickCustomTarget;
      if (patch.agentMode === false) {
        next.autonomousMode = false;
      }
      if (patch.agentMode === true) {
        next.useWorkspaceContext = true;
      }
      return next;
    });
  }, [project]);

  const handleNewChat = useCallback(() => {
    createSession("New Chat");
    setSidebarView("chat");
    setSidebarExpanded(true);
  }, [createSession, setSidebarExpanded, setSidebarView]);

  const handleSelectSession = useCallback(
    (sessionId) => {
      setActiveSessionId(sessionId);
      setSidebarView("chat");
      setSidebarExpanded(true);
    },
    [setActiveSessionId, setSidebarExpanded, setSidebarView]
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

  const handleActivityViewChange = useCallback(
    (viewId) => {
      setActivityView(viewId);
      if (viewId === "explorer" || viewId === "terminal" || viewId === "git") {
        setSidebarView(viewId);
      }
    },
    [setSidebarView]
  );

  const handleSidebarNavigate = useCallback(
    (viewId) => {
      if (sidebarView === viewId && sidebarExpanded) {
        setSidebarExpanded(false);
        return;
      }

      setSidebarView(viewId);
      setSidebarExpanded(true);

      if (SIDEBAR_TO_ACTIVITY[viewId]) {
        setActivityView(SIDEBAR_TO_ACTIVITY[viewId]);
      }
    },
    [sidebarExpanded, sidebarView, setSidebarExpanded, setSidebarView]
  );

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
          onSelect: () => {
            project.openProject(projectName);
            setActivityView("explorer");
            setSidebarView("explorer");
          },
        });
      }
    });

    project.files.forEach((filePath) => {
      if (filePath.toLowerCase().includes(query)) {
        results.push({
          key: `file-${filePath}`,
          label: filePath,
          meta: "File",
          onSelect: () => {
            setActivityView("editor");
            project.openFile(filePath);
          },
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
  }, [handleSelectSession, project, sessions, searchQuery, setSidebarView]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.target.matches("input, textarea, select") && !event.ctrlKey && !event.altKey) {
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarExpanded((current) => !current);
        return;
      }

      if (event.altKey && event.key === ",") {
        event.preventDefault();
        handleSidebarNavigate("settings");
        return;
      }

      const navIndex = PRIMARY_NAV.findIndex((item) => {
        const digit = item.shortcut.replace("Alt+", "");
        return event.altKey && event.key === digit;
      });

      if (navIndex >= 0) {
        event.preventDefault();
        handleSidebarNavigate(PRIMARY_NAV[navIndex].id);
        navButtonRefs.current[navIndex]?.focus();
        return;
      }

      if (event.target.closest(".ws-sidebar-rail") && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        const nextIndex =
          event.key === "ArrowDown"
            ? (focusedNavIndex + 1) % PRIMARY_NAV.length
            : (focusedNavIndex - 1 + PRIMARY_NAV.length) % PRIMARY_NAV.length;
        setFocusedNavIndex(nextIndex);
        navButtonRefs.current[nextIndex]?.focus();
        return;
      }

      if (event.target.closest(".ws-sidebar-rail") && event.key === "Enter") {
        event.preventDefault();
        handleSidebarNavigate(PRIMARY_NAV[focusedNavIndex].id);
      }

      if (event.key === "Escape" && sidebarExpanded) {
        setSidebarExpanded(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedNavIndex, handleSidebarNavigate, setSidebarExpanded, sidebarExpanded]);

  async function handleProjectCreated(projectName) {
    await project.reloadProjects();
    await project.openProject(projectName);
    setActivityView("explorer");
    setSidebarView("explorer");
    setSidebarExpanded(true);
  }

  async function handleGenerationComplete({
    projectName,
    createdFiles,
    workspacePath,
    inPlace,
  }) {
    logGeneration("explorer", { projectName, inPlace, workspacePath });
    recordGenerationStep(GENERATION_TAGS.explorerRefresh, {
      projectName,
      inPlace,
      workspacePath,
      createdFiles,
    });

    await project.reloadProjects();
    await project.refreshProjectFiles(
      projectName,
      inPlace
        ? `Success: ${createdFiles.length} file(s) written to ${workspacePath || "workspace"}.`
        : `Project ${projectName} created with ${createdFiles.length} file(s).`
    );

    setActivityView("explorer");
    setSidebarView("explorer");
    setSidebarExpanded(true);

    const firstFile =
      createdFiles.find((filePath) => filePath && /\.[a-z0-9]+$/i.test(filePath)) ||
      createdFiles[0];

    if (firstFile) {
      setActivityView("editor");
      await project.openFile(firstFile);
      logGeneration("opened", { projectName, firstFile, workspacePath });
    } else {
      logGeneration("opened", { projectName, workspacePath });
    }
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

  function handleFixTerminalIssue(prompt) {
    setFixPrompt(prompt);
    setSidebarView("chat");
    setSidebarExpanded(true);
    handleChatSettingsChange({ agentMode: true, useWorkspaceContext: true });
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
          <div aria-hidden="true" className="ws-logo-mark">
            AI
          </div>
          <div className="ws-header-titles">
            <strong>BEING AI</strong>
            <span>Workspace IDE</span>
          </div>
          <div className="ws-header-workspace">
            <span className="ws-header-project">
              {project.selectedProject || "No project selected"}
            </span>
            {project.workspacePath && (
              <span className="ws-header-path" title={project.workspacePath}>
                {project.workspacePath}
              </span>
            )}
          </div>
        </div>

        <div className="ws-header-actions">
          <span
            className={
              ollama.status.online && ollama.status.model_available
                ? "ws-status ws-status-running"
                : "ws-status ws-status-error"
            }
            title={
              ollama.status.models?.length
                ? `Models: ${ollama.status.models.join(", ")}`
                : ollama.status.message
            }
          >
            {ollama.checking
              ? "Checking Ollama…"
              : ollama.status.online && ollama.status.model_available
                ? "Ollama connected"
                : "Ollama unavailable"}
          </span>
          <span
            className={runner.projectRunning ? "ws-status ws-status-running" : "ws-status"}
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
                setSidebarView("terminal");
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
        <Sidebar
          activeSessionId={activeSessionId}
          activeView={sidebarView}
          agentTask={agentTask}
          chatSessions={visibleChatSessions}
          chatSearchQuery={chatSearchQuery}
          onChatSearchQueryChange={setChatSearchQuery}
          onDownloadSession={downloadSessionMarkdown}
          onPinSession={pinSession}
          onRenameSession={renameSession}
          ollamaStatus={ollama.status}
          chatSettings={chatSettings}
          expanded={sidebarExpanded}
          files={project.files}
          folders={project.folders}
          navButtonRefs={navButtonRefs}
          onChatSettingsChange={handleChatSettingsChange}
          onCreateFile={project.createFile}
          onCreateFolder={project.createFolder}
          onDelete={project.deleteSelectedPath}
          onDeleteSession={deleteSession}
          onFocusNav={setFocusedNavIndex}
          onNavigate={handleSidebarNavigate}
          onNewChat={handleNewChat}
          onOpenFolder={project.openFolderDialog}
          onOpenFile={(filePath) => {
            setActivityView("editor");
            project.openFile(filePath);
          }}
          onOpenGit={() => {
            setActivityView("git");
            setSidebarView("git");
            setSidebarExpanded(true);
          }}
          onOpenTerminal={() => {
            setActivityView("terminal");
            setSidebarView("terminal");
            setSidebarExpanded(true);
          }}
          onRename={project.renameSelectedPath}
          onRunProject={() => {
            setActivityView("terminal");
            runner.runProject(project.selectedProject, project.setError);
          }}
          onSearchQueryChange={setSearchQuery}
          onSelectFolder={project.setSelectedFolder}
          onSelectProject={(projectName) => {
            project.openProject(projectName);
            setActivityView("explorer");
          }}
          onSelectSession={handleSelectSession}
          onToggleExpanded={() => setSidebarExpanded((current) => !current)}
          projectRunning={runner.projectRunning}
          projects={project.projects}
          recentWorkspaces={project.recentWorkspaces}
          runStatus={runner.runStatus}
          searchQuery={searchQuery}
          searchResults={searchResults}
          selectedFile={project.selectedFile}
          selectedFolder={project.selectedFolder}
          selectedProject={project.selectedProject}
          workspaces={project.workspaces}
        />

        <div className="ws-workspace-body">
          <Group
            className="ws-panel-group"
            defaultLayout={defaultLayout}
            id="beingai-workspace-layout"
            onLayoutChanged={onLayoutChanged}
            orientation="horizontal"
          >
            <Panel className="ws-panel" defaultSize={58} id="chat" minSize={35}>
              <ChatWorkspace
                key={chatSessionKey}
                chatSettings={chatSettings}
                initialMessages={sessionMessages}
                ollamaStatus={ollama.status}
                onAgentTaskChange={setAgentTask}
                onChatSettingsChange={handleChatSettingsChange}
                onFilesChanged={handleFilesChanged}
                fixPrompt={fixPrompt}
                onFixPromptConsumed={() => setFixPrompt("")}
                onGenerationComplete={handleGenerationComplete}
                onMessagesChange={handleMessagesChange}
                onOpenFile={handleOpenFileFromChat}
                onProjectCreated={handleProjectCreated}
                onSessionTitleChange={handleSessionTitleChange}
                selectedProject={project.selectedProject}
                sessionId={chatSessionKey}
                workspaceKind={project.workspaceKind}
                workspacePath={project.workspacePath}
              />
            </Panel>

            <Separator className="ws-resize-handle ws-resize-handle-horizontal" />

            <Panel className="ws-panel" defaultSize={42} id="activity" minSize={25}>
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
                onFixIssue={handleFixTerminalIssue}
                onRun={() => runner.runProject(project.selectedProject, project.setError)}
                onSave={project.saveFile}
                onSelectFolder={project.setSelectedFolder}
                onStop={() => runner.stopProject(project.selectedProject, project.setError)}
                onViewChange={handleActivityViewChange}
                onWorkspaceChanged={handleWorkspaceChanged}
                projectRunning={runner.projectRunning}
                runStatus={runner.runStatus}
                saving={project.saving}
                selectedFile={project.selectedFile}
                selectedFolder={project.selectedFolder}
                selectedProject={project.selectedProject}
                terminalAnalysis={runner.terminalAnalysis}
                terminalLogs={runner.terminalLogs}
                terminalRef={runner.terminalRef}
              />
            </Panel>
          </Group>
        </div>
      </div>
    </div>
  );
}
