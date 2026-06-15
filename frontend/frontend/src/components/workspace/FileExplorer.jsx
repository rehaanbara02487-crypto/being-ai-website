import { useMemo, useState } from "react";

import EmptyState from "./EmptyState";

const PAGE_SIZE = 150;

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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleFolders = useMemo(
    () => folders.slice(0, visibleCount),
    [folders, visibleCount]
  );
  const visibleFiles = useMemo(() => {
    const remaining = Math.max(visibleCount - visibleFolders.length, 0);
    return files.slice(0, remaining);
  }, [files, visibleCount, visibleFolders.length]);

  const totalEntries = folders.length + files.length;
  const hasMore = totalEntries > visibleCount;

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

      {totalEntries > PAGE_SIZE && (
        <div className="ws-muted-copy" style={{ fontSize: "0.78rem", marginBottom: "8px" }}>
          Showing {Math.min(visibleCount, totalEntries)} of {totalEntries} entries
        </div>
      )}

      <div className="ws-file-explorer-list">
        {visibleFolders.map((folder) => (
          <button
            key={folder}
            className={`ws-file-item ${folder === selectedFolder ? "active" : ""}`}
            onClick={() => onSelectFolder(folder)}
            type="button"
          >
            {folder}/
          </button>
        ))}

        {visibleFiles.map((file) => (
          <button
            key={file}
            className={`ws-file-item ${file === selectedFile ? "active" : ""}`}
            onClick={() => onOpenFile(file)}
            type="button"
          >
            {file}
          </button>
        ))}
      </div>

      {hasMore && (
        <button
          className="ws-btn ws-full-width"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          style={{ marginTop: "8px" }}
          type="button"
        >
          Show more
        </button>
      )}

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
