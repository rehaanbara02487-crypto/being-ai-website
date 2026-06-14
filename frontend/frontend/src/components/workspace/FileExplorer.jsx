import EmptyState from "./EmptyState";

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
      <EmptyState
        description="Choose a project from the list above, or ask BEING AI in Chat to build one."
        icon="▤"
        title="No project selected"
      />
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
        <EmptyState
          actionLabel="Create File"
          description="This project is empty. Add a file or use Agent Mode to scaffold."
          icon="📄"
          onAction={onCreateFile}
          title="No files yet"
        />
      )}
    </div>
  );
}
