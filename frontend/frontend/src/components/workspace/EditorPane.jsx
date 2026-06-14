import Editor from "@monaco-editor/react";

import { languageForPath } from "../../lib/languageForPath";

export default function EditorPane({
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
        ) : (
          <div className="ws-editor-empty">
            {loading ? "Loading..." : "Select a file from Explorer to edit."}
          </div>
        )}
      </div>
    </div>
  );
}
