import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  getProject,
  getProjectFile,
  listProjects,
  saveProjectFile,
} from "../lib/api";

const buttonBase = {
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: "12px",
  color: "white",
  cursor: "pointer",
  fontSize: "0.95rem",
  padding: "10px 12px",
  textAlign: "left",
  width: "100%",
};

const extensionLanguages = {
  css: "css",
  html: "html",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  py: "python",
  ts: "typescript",
  tsx: "typescript",
  txt: "plaintext",
  yml: "yaml",
  yaml: "yaml",
};

function languageForPath(filePath) {
  const extension = filePath.split(".").pop()?.toLowerCase();
  return extensionLanguages[extension] || "plaintext";
}

export default function Workspace({ onClose }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Loading projects...");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        setError("");
        const data = await listProjects();
        if (cancelled) return;

        const projectNames = data.projects || [];
        setProjects(projectNames);
        setMessage(
          projectNames.length
            ? "Select a project to load its files."
            : "No projects found in the backend workspace."
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
          setMessage("Unable to load projects.");
        }
      }
    }

    loadProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  async function openProject(projectName) {
    setSelectedProject(projectName);
    setSelectedFile("");
    setFiles([]);
    setContent("");
    setIsDirty(false);
    setLoading(true);
    setError("");
    setMessage(`Loading ${projectName}...`);

    try {
      const data = await getProject(projectName);
      const projectFiles = data.files || [];
      setFiles(projectFiles);
      setMessage(
        projectFiles.length
          ? "Choose a file to open it in the editor."
          : "This project has no files yet."
      );
    } catch (loadError) {
      setError(loadError.message);
      setMessage("Unable to load project files.");
    } finally {
      setLoading(false);
    }
  }

  async function openFile(filePath) {
    if (!selectedProject) return;

    setSelectedFile(filePath);
    setLoading(true);
    setError("");
    setMessage(`Opening ${filePath}...`);

    try {
      const data = await getProjectFile(selectedProject, filePath);
      setContent(data.content || "");
      setIsDirty(false);
      setMessage(`Opened ${filePath}.`);
    } catch (loadError) {
      setContent("");
      setError(loadError.message);
      setMessage("Unable to open file.");
    } finally {
      setLoading(false);
    }
  }

  async function saveFile() {
    if (!selectedProject || !selectedFile) return;

    setSaving(true);
    setError("");
    setMessage(`Saving ${selectedFile}...`);

    try {
      await saveProjectFile(selectedProject, selectedFile, content);
      setIsDirty(false);
      setMessage(`Saved ${selectedFile}.`);
    } catch (saveError) {
      setError(saveError.message);
      setMessage("Unable to save file.");
    } finally {
      setSaving(false);
    }
  }

  const editorLanguage = useMemo(
    () => (selectedFile ? languageForPath(selectedFile) : "plaintext"),
    [selectedFile]
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(18px)",
        color: "white",
        padding: "36px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
          marginBottom: "24px",
        }}
      >
        <div>
          <p
            style={{
              color: "#00ffff",
              letterSpacing: "6px",
              margin: "0 0 8px",
              textTransform: "uppercase",
            }}
          >
            IDE Workspace
          </p>
          <h2 style={{ fontSize: "2.6rem", margin: 0 }}>Project Editor</h2>
        </div>

        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "999px",
            color: "white",
            cursor: "pointer",
            padding: "12px 20px",
          }}
        >
          Close
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 320px minmax(0, 1fr)",
          gap: "18px",
          height: "calc(100vh - 154px)",
          minHeight: 0,
        }}
      >
        <aside
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "22px",
            padding: "18px",
            overflow: "auto",
          }}
        >
          <h3 style={{ color: "#00ffff", marginTop: 0 }}>Projects</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {projects.map((project) => (
              <button
                key={project}
                onClick={() => openProject(project)}
                style={{
                  ...buttonBase,
                  background:
                    project === selectedProject
                      ? "rgba(0,255,255,0.22)"
                      : "rgba(255,255,255,0.06)",
                }}
              >
                {project}
              </button>
            ))}
          </div>
        </aside>

        <aside
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "22px",
            padding: "18px",
            overflow: "auto",
          }}
        >
          <h3 style={{ color: "#00ffff", marginTop: 0 }}>Files</h3>
          {selectedProject ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {files.map((file) => (
                <button
                  key={file}
                  onClick={() => openFile(file)}
                  style={{
                    ...buttonBase,
                    background:
                      file === selectedFile
                        ? "rgba(0,255,255,0.22)"
                        : "rgba(255,255,255,0.06)",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    overflowWrap: "anywhere",
                  }}
                >
                  {file}
                </button>
              ))}
            </div>
          ) : (
            <p style={{ opacity: 0.72 }}>Select a project first.</p>
          )}
        </aside>

        <main
          style={{
            background: "rgba(10,10,20,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "22px",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              alignItems: "center",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              gap: "16px",
              justifyContent: "space-between",
              padding: "14px 18px",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <strong
                style={{
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {selectedFile || "No file selected"}
                {isDirty ? " *" : ""}
              </strong>
              <span style={{ color: error ? "#ff8585" : "rgba(255,255,255,0.65)" }}>
                {error || message}
              </span>
            </div>

            <button
              disabled={!selectedFile || saving}
              onClick={saveFile}
              style={{
                background:
                  !selectedFile || saving ? "rgba(255,255,255,0.18)" : "#00ffff",
                border: "none",
                borderRadius: "999px",
                color: "black",
                cursor: !selectedFile || saving ? "not-allowed" : "pointer",
                fontWeight: "bold",
                padding: "12px 22px",
              }}
            >
              {saving ? "Saving..." : "Save File"}
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            {selectedFile ? (
              <Editor
                height="100%"
                language={editorLanguage}
                onChange={(value) => {
                  setContent(value || "");
                  setIsDirty(true);
                }}
                options={{
                  automaticLayout: true,
                  fontSize: 14,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                }}
                theme="vs-dark"
                value={content}
              />
            ) : (
              <div
                style={{
                  alignItems: "center",
                  color: "rgba(255,255,255,0.64)",
                  display: "flex",
                  height: "100%",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {loading ? "Loading..." : "Select a file to open it in Monaco Editor."}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
