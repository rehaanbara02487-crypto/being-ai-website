import { Group, Panel, Separator } from "react-resizable-panels";

import SourceControlPanel from "./SourceControlPanel";
import EditorPane from "./workspace/EditorPane";
import FileExplorer from "./workspace/FileExplorer";
import IconTooltip from "./workspace/IconTooltip";
import TerminalView from "./workspace/TerminalView";

const ACTIVITY_ITEMS = [
  { id: "explorer", icon: "▤", label: "Explorer", shortcut: "Ctrl+Shift+E" },
  { id: "editor", icon: "{ }", label: "Editor", shortcut: "Ctrl+Shift+D" },
  { id: "terminal", icon: "▣", label: "Terminal", shortcut: "Ctrl+`" },
  { id: "git", icon: "⎇", label: "Source Control", shortcut: "Ctrl+Shift+G" },
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
              selectedProject={selectedProject}
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
              selectedProject={selectedProject}
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
              selectedProject={selectedProject}
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
        selectedProject={selectedProject}
      />
    );
  }

  return (
    <div className="ws-activity-panel">
      <div className="ws-activity-content">
        <div className="ws-activity-viewport" key={activeView}>
          {renderMainContent()}
        </div>
      </div>
      <div aria-label="Editor views" className="ws-activity-bar" role="toolbar">
        {ACTIVITY_ITEMS.map((item) => (
          <IconTooltip key={item.id} label={item.label} shortcut={item.shortcut}>
            <button
              aria-current={activeView === item.id ? "page" : undefined}
              aria-label={item.label}
              className={`ws-activity-btn ${activeView === item.id ? "active" : ""}`}
              onClick={() => onViewChange(item.id)}
              type="button"
            >
              {item.icon}
            </button>
          </IconTooltip>
        ))}
      </div>
    </div>
  );
}
