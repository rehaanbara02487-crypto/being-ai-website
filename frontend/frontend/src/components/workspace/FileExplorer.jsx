export default function FileExplorer({
  selectedProject,
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
}) {
  if (!selectedProject) {
    return (
      <div style={{ color: "var(--ws-muted)", fontSize: "0.85rem", padding: "8px" }}>
        Select a project to browse files.
      </div>
    );
  }

  return (
    <div>
      <div className="ws-file-explorer-actions">
        <button className="ws-btn" onClick={onCreateFile} type="button">
          + File
        </button>
        <button className="ws-btn" onClick={onCreateFolder} type="button">
          + Folder
        </button>
        <button className="ws-btn" onClick={onRename} type="button">
          Rename
        </button>
        <button className="ws-btn" onClick={onDelete} type="button">
          Delete
        </button>
      </div>

      {folders.map((folder) => (
        <button
          key={folder}
          className={`ws-file-item ${folder === selectedFolder ? "active" : ""}`}
          onClick={() => onSelectFolder(folder)}
          type="button"
        >
          {folder}/
        </button>
      ))}

      {files.map((file) => (
        <button
          key={file}
          className={`ws-file-item ${file === selectedFile ? "active" : ""}`}
          onClick={() => onOpenFile(file)}
          type="button"
        >
          {file}
        </button>
      ))}

      {!files.length && !folders.length && (
        <div style={{ color: "var(--ws-muted)", fontSize: "0.82rem", padding: "8px" }}>
          Empty project. Create files or ask AI to scaffold one.
        </div>
      )}
    </div>
  );
}
