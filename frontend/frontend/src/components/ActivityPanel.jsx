import { Group, Panel, Separator } from "react-resizable-panels";

import SourceControlPanel from "./SourceControlPanel";
import EditorPane from "./workspace/EditorPane";
import FileExplorer from "./workspace/FileExplorer";
import TerminalView from "./workspace/TerminalView";

const ACTIVITY_ITEMS = [
  { id: "explorer", icon: "▤", label: "Explorer" },
  { id: "editor", icon: "{ }", label: "Editor" },
  { id: "terminal", icon: "▣", label: "Terminal" },
  { id: "git", icon: "⎇", label: "Source Control" },
];

export default function ActivityPanel({
  activeView,
  onViewChange,
  selectedProject,
  files,
  folders,
  selectedFile,
  selectedFolder,
  onSelectFolder,
  content,
  isDirty,
  loading,
  saving,
  message,
  error,
  onContentChange,
  onOpenFile,
  onSave,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  terminalRef,
  terminalLogs,
  projectRunning,
  runStatus,
  onRun,
  onStop,
  onWorkspaceChanged,
}) {
  function renderMainContent() {
    if (activeView === "explorer") {
      return (
        <Group orientation="horizontal">
          <Panel defaultSize={28} id="explorer-sidebar" maxSize={40} minSize={18}>
            <div className="ws-activity-sidebar">
              <div className="ws-activity-sidebar-header">Explorer</div>
              <div className="ws-sidebar-panel-body">
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
              </div>
            </div>
          </Panel>
          <Separator className="ws-resize-handle ws-resize-handle-horizontal" />
          <Panel defaultSize={72} id="explorer-editor" minSize={40}>
            <EditorPane
              content={content}
              error={error}
              isDirty={isDirty}
              loading={loading}
              message={message}
              onChange={onContentChange}
              onSave={onSave}
              saving={saving}
              selectedFile={selectedFile}
            />
          </Panel>
        </Group>
      );
    }

    if (activeView === "terminal") {
      return (
        <Group orientation="vertical">
          <Panel defaultSize={62} id="terminal-editor" minSize={30}>
            <EditorPane
              content={content}
              error={error}
              isDirty={isDirty}
              loading={loading}
              message={message}
              onChange={onContentChange}
              onSave={onSave}
              saving={saving}
              selectedFile={selectedFile}
            />
          </Panel>
          <Separator className="ws-resize-handle ws-resize-handle-vertical" />
          <Panel defaultSize={38} id="terminal-dock" minSize={18}>
            <TerminalView
              onRun={onRun}
              onStop={onStop}
              projectRunning={projectRunning}
              runStatus={runStatus}
              selectedProject={selectedProject}
              terminalLogs={terminalLogs}
              terminalRef={terminalRef}
            />
          </Panel>
        </Group>
      );
    }

    if (activeView === "git") {
      return (
        <Group orientation="horizontal">
          <Panel defaultSize={34} id="git-sidebar" maxSize={50} minSize={24}>
            <div className="ws-activity-sidebar">
              <SourceControlPanel
                compact
                onWorkspaceChanged={onWorkspaceChanged}
                selectedProject={selectedProject}
              />
            </div>
          </Panel>
          <Separator className="ws-resize-handle ws-resize-handle-horizontal" />
          <Panel defaultSize={66} id="git-editor" minSize={35}>
            <EditorPane
              content={content}
              error={error}
              isDirty={isDirty}
              loading={loading}
              message={message}
              onChange={onContentChange}
              onSave={onSave}
              saving={saving}
              selectedFile={selectedFile}
            />
          </Panel>
        </Group>
      );
    }

    return (
      <EditorPane
        content={content}
        error={error}
        isDirty={isDirty}
        loading={loading}
        message={message}
        onChange={onContentChange}
        onSave={onSave}
        saving={saving}
        selectedFile={selectedFile}
      />
    );
  }

  return (
    <div className="ws-activity-panel">
      <div className="ws-activity-content">{renderMainContent()}</div>
      <div className="ws-activity-bar">
        {ACTIVITY_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`ws-activity-btn ${activeView === item.id ? "active" : ""}`}
            onClick={() => onViewChange(item.id)}
            title={item.label}
            type="button"
          >
            {item.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
