import Editor from "@monaco-editor/react";

import { languageForPath } from "../../lib/languageForPath";
import EmptyState from "./EmptyState";

export default function EditorPane({
  selectedProject,
  selectedFile,
  content,
  isDirty,
  loading,
  onChange,
  onSave,
  saving,
  message,
  error,
}) {
  const language = selectedFile ? languageForPath(selectedFile) : "plaintext";

  return (
    <div className="ws-activity-main">
      <div className="ws-editor-toolbar">
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
            {selectedFile || (selectedProject ? "Editor" : "Workspace")}
            {isDirty ? " *" : ""}
          </strong>
          <span style={{ color: error ? "var(--ws-error)" : "var(--ws-muted)", fontSize: "0.75rem" }}>
            {error || message}
          </span>
        </div>
        <button
          className="ws-btn ws-btn-primary"
          disabled={!selectedFile || saving}
          onClick={onSave}
          type="button"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {selectedFile ? (
          <Editor
            height="100%"
            language={language}
            onChange={(value) => onChange(value || "")}
            options={{
              automaticLayout: true,
              fontSize: 13,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
            }}
            theme="vs-dark"
            value={content}
          />
        ) : loading ? (
          <div className="ws-editor-empty">Loading file...</div>
        ) : !selectedProject ? (
          <EmptyState
            description="Open a folder from the left Explorer sidebar to browse and edit files."
            icon="{ }"
            title="Open a folder to begin"
          />
        ) : (
          <EmptyState
            description="Choose a file from Explorer to open it here."
            icon="{ }"
            title="Select a file from Explorer"
          />
        )}
      </div>
    </div>
  );
}
