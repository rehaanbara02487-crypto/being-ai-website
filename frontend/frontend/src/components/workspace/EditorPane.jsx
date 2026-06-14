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
            {selectedFile || "No file selected"}
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
            description="Open Explorer and select a project to browse and edit files."
            icon="{ }"
            title="No project selected"
          />
        ) : (
          <EmptyState
            description="Pick a file from Explorer to open it in the editor."
            icon="{ }"
            title="No file open"
          />
        )}
      </div>
    </div>
  );
}
