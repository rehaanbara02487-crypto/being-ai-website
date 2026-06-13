import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

import ChatPanel from "./ChatPanel";
import {
  createProjectFile,
  createProjectFolder,
  deleteProjectPath,
  getProject,
  getProjectFile,
  getProjectRunStatus,
  getProjectRunStreamUrl,
  listProjects,
  renameProjectPath,
  saveProjectFile,
  startProjectRun,
  stopProjectRun,
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
  const [folders, setFolders] = useState([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Loading projects...");
  const [error, setError] = useState("");
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [projectRunning, setProjectRunning] = useState(false);
  const [runStatus, setRunStatus] = useState("Idle");
  const eventSourceRef = useRef(null);
  const terminalRef = useRef(null);

  function closeRunStream() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }

  function appendTerminalLog(stream, message) {
    setTerminalLogs((logs) => [
      ...logs,
      {
        stream,
        message,
      },
    ]);
  }

  function openRunStream(projectName) {
    closeRunStream();

    const eventSource = new EventSource(getProjectRunStreamUrl(projectName));
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      appendTerminalLog(payload.stream, payload.message);
      setProjectRunning(payload.running);

      if (payload.running) {
        setRunStatus("Running");
      } else {
        setRunStatus(
          payload.returncode === null
            ? "Idle"
            : `Exited (${payload.returncode})`
        );
        closeRunStream();
      }
    };

    eventSource.onerror = () => {
      appendTerminalLog("system", "Log stream disconnected\n");
      setProjectRunning(false);
      setRunStatus("Disconnected");
      closeRunStream();
    };
  }

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

  useEffect(() => {
    return () => {
      closeRunStream();
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  async function refreshProjectFiles(projectName, successMessage) {
    const data = await getProject(projectName);
    const projectFiles = data.files || [];
    const projectFolders = data.folders || [];

    setFiles(projectFiles);
    setFolders(projectFolders);
    setMessage(
      successMessage ||
        (projectFiles.length || projectFolders.length
          ? "Choose a file to open it in the editor."
          : "This project has no files yet.")
    );

    return data;
  }

  async function refreshRunStatus(projectName) {
    try {
      const status = await getProjectRunStatus(projectName);

      setProjectRunning(status.running);
      setRunStatus(status.running ? "Running" : "Idle");

      if (status.running) {
        openRunStream(projectName);
      } else {
        closeRunStream();
      }
    } catch (statusError) {
      setProjectRunning(false);
      setRunStatus("Unavailable");
      appendTerminalLog("system", `${statusError.message}\n`);
    }
  }

  async function openProject(projectName) {
    setSelectedProject(projectName);
    setSelectedFile("");
    setSelectedFolder("");
    setFiles([]);
    setFolders([]);
    setContent("");
    setIsDirty(false);
    setTerminalLogs([]);
    setProjectRunning(false);
    setRunStatus("Idle");
    closeRunStream();
    setLoading(true);
    setError("");
    setMessage(`Loading ${projectName}...`);

    try {
      await refreshProjectFiles(projectName);
      await refreshRunStatus(projectName);
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
    setSelectedFolder("");
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

  async function runProject() {
    if (!selectedProject) return;

    setError("");
    setTerminalLogs([]);
    setRunStatus("Starting");
    appendTerminalLog("system", `Starting ${selectedProject}...\n`);

    try {
      const status = await startProjectRun(selectedProject);
      setProjectRunning(status.running);
      setRunStatus(status.running ? "Running" : "Idle");
      openRunStream(selectedProject);
    } catch (runError) {
      setProjectRunning(false);
      setRunStatus("Failed");
      setError(runError.message);
      appendTerminalLog("stderr", `${runError.message}\n`);
    }
  }

  async function stopProject() {
    if (!selectedProject) return;

    setError("");
    setRunStatus("Stopping");
    appendTerminalLog("system", `Stopping ${selectedProject}...\n`);

    try {
      const status = await stopProjectRun(selectedProject);
      setProjectRunning(status.running);
      setRunStatus(status.running ? "Running" : "Stopped");
    } catch (stopError) {
      setError(stopError.message);
      appendTerminalLog("stderr", `${stopError.message}\n`);
    }
  }

  async function createFile() {
    if (!selectedProject) return;

    const filePath = window.prompt("New file path");
    if (!filePath) return;

    setLoading(true);
    setError("");
    setMessage(`Creating ${filePath}...`);

    try {
      await createProjectFile(selectedProject, filePath);
      await refreshProjectFiles(selectedProject, `Created file ${filePath}.`);
    } catch (createError) {
      setError(createError.message);
      setMessage("Unable to create file.");
    } finally {
      setLoading(false);
    }
  }

  async function createFolder() {
    if (!selectedProject) return;

    const folderPath = window.prompt("New folder path");
    if (!folderPath) return;

    setLoading(true);
    setError("");
    setMessage(`Creating ${folderPath}...`);

    try {
      await createProjectFolder(selectedProject, folderPath);
      await refreshProjectFiles(selectedProject, `Created folder ${folderPath}.`);
    } catch (createError) {
      setError(createError.message);
      setMessage("Unable to create folder.");
    } finally {
      setLoading(false);
    }
  }

  async function renameSelectedPath() {
    if (!selectedProject) return;

    const currentPath = selectedFolder || selectedFile;
    if (!currentPath) {
      setMessage("Select a file or folder to rename.");
      return;
    }

    const newPath = window.prompt("Rename to", currentPath);
    if (!newPath || newPath === currentPath) return;

    setLoading(true);
    setError("");
    setMessage(`Renaming ${currentPath}...`);

    try {
      await renameProjectPath(selectedProject, currentPath, newPath);

      if (selectedFile === currentPath || selectedFile.startsWith(`${currentPath}/`)) {
        setSelectedFile("");
        setContent("");
        setIsDirty(false);
      }

      if (selectedFolder === currentPath || selectedFolder.startsWith(`${currentPath}/`)) {
        setSelectedFolder("");
      }

      await refreshProjectFiles(selectedProject, `Renamed ${currentPath} to ${newPath}.`);
    } catch (renameError) {
      setError(renameError.message);
      setMessage("Unable to rename path.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteSelectedPath() {
    if (!selectedProject) return;

    const currentPath = selectedFolder || selectedFile;
    if (!currentPath) {
      setMessage("Select a file or folder to delete.");
      return;
    }

    if (!window.confirm(`Delete ${currentPath}?`)) return;

    setLoading(true);
    setError("");
    setMessage(`Deleting ${currentPath}...`);

    try {
      await deleteProjectPath(selectedProject, currentPath);

      if (selectedFile === currentPath || selectedFile.startsWith(`${currentPath}/`)) {
        setSelectedFile("");
        setContent("");
        setIsDirty(false);
      }

      if (selectedFolder === currentPath || selectedFolder.startsWith(`${currentPath}/`)) {
        setSelectedFolder("");
      }

      await refreshProjectFiles(selectedProject, `Deleted ${currentPath}.`);
    } catch (deleteError) {
      setError(deleteError.message);
      setMessage("Unable to delete path.");
    } finally {
      setLoading(false);
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
          gridTemplateColumns: "240px 300px minmax(0, 1fr) 340px",
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
            <>
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  gridTemplateColumns: "1fr 1fr",
                  marginBottom: "14px",
                }}
              >
                <button onClick={createFile} style={buttonBase}>
                  + File
                </button>
                <button onClick={createFolder} style={buttonBase}>
                  + Folder
                </button>
                <button onClick={renameSelectedPath} style={buttonBase}>
                  Rename
                </button>
                <button onClick={deleteSelectedPath} style={buttonBase}>
                  Delete
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {folders.map((folder) => (
                  <button
                    key={folder}
                    onClick={() => {
                      setSelectedFolder(folder);
                      setSelectedFile("");
                    }}
                    style={{
                      ...buttonBase,
                      background:
                        folder === selectedFolder
                          ? "rgba(0,255,255,0.22)"
                          : "rgba(255,255,255,0.06)",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {folder}/
                  </button>
                ))}

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
            </>
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

            <div
              style={{
                alignItems: "center",
                display: "flex",
                gap: "10px",
              }}
            >
              <span
                style={{
                  color: projectRunning ? "#00ffff" : "rgba(255,255,255,0.65)",
                  fontSize: "0.9rem",
                  whiteSpace: "nowrap",
                }}
              >
                {runStatus}
              </span>

              {projectRunning ? (
                <button
                  disabled={!selectedProject}
                  onClick={stopProject}
                  style={{
                    background: "#ff8585",
                    border: "none",
                    borderRadius: "999px",
                    color: "black",
                    cursor: !selectedProject ? "not-allowed" : "pointer",
                    fontWeight: "bold",
                    padding: "12px 22px",
                  }}
                >
                  Stop
                </button>
              ) : (
                <button
                  disabled={!selectedProject}
                  onClick={runProject}
                  style={{
                    background: !selectedProject ? "rgba(255,255,255,0.18)" : "#00ffff",
                    border: "none",
                    borderRadius: "999px",
                    color: "black",
                    cursor: !selectedProject ? "not-allowed" : "pointer",
                    fontWeight: "bold",
                    padding: "12px 22px",
                  }}
                >
                  Run
                </button>
              )}

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

          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(0,0,0,0.48)",
              height: "190px",
              minHeight: "190px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                alignItems: "center",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                color: "#00ffff",
                display: "flex",
                fontWeight: "bold",
                justifyContent: "space-between",
                padding: "10px 14px",
              }}
            >
              <span>Terminal</span>
              <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: "normal" }}>
                {selectedProject || "No project selected"}
              </span>
            </div>

            <pre
              ref={terminalRef}
              style={{
                color: "rgba(255,255,255,0.86)",
                flex: 1,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: "0.9rem",
                lineHeight: 1.5,
                margin: 0,
                overflow: "auto",
                padding: "12px 14px",
                whiteSpace: "pre-wrap",
              }}
            >
              {terminalLogs.length ? (
                terminalLogs.map((log, index) => (
                  <span
                    key={`${index}-${log.stream}`}
                    style={{
                      color:
                        log.stream === "stderr"
                          ? "#ff8585"
                          : log.stream === "system"
                            ? "#00ffff"
                            : "rgba(255,255,255,0.88)",
                    }}
                  >
                    {log.message}
                  </span>
                ))
              ) : (
                <span style={{ color: "rgba(255,255,255,0.45)" }}>
                  Run a project to see stdout and stderr here.
                </span>
              )}
            </pre>
          </div>
        </main>

        <ChatPanel selectedProject={selectedProject} />
      </div>
    </div>
  );
}
