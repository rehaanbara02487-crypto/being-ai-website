export default function RepositorySummaryPanel({ intelligence, loading, error, onOpenFile }) {
  if (loading) {
    return (
      <div className="ws-repo-summary">
        <div className="ws-repo-summary-title">Repository</div>
        <p className="ws-muted">Indexing workspace…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ws-repo-summary">
        <div className="ws-repo-summary-title">Repository</div>
        <p className="ws-repo-summary-error">{error}</p>
      </div>
    );
  }

  if (!intelligence) {
    return null;
  }

  const keyFiles = intelligence.key_files || [];

  return (
    <div className="ws-repo-summary">
      <div className="ws-repo-summary-title">Repository</div>
      <div className="ws-repo-summary-grid">
        <div>
          <span className="ws-repo-label">Project</span>
          <strong>{intelligence.project_name || "Workspace"}</strong>
        </div>
        <div>
          <span className="ws-repo-label">Framework</span>
          <strong>{intelligence.framework || "unknown"}</strong>
        </div>
        <div>
          <span className="ws-repo-label">Files</span>
          <strong>{intelligence.file_count ?? 0}</strong>
        </div>
        <div>
          <span className="ws-repo-label">Components</span>
          <strong>{intelligence.components ?? 0}</strong>
        </div>
        <div>
          <span className="ws-repo-label">Routes</span>
          <strong>{intelligence.routes ?? 0}</strong>
        </div>
        <div>
          <span className="ws-repo-label">Models</span>
          <strong>{intelligence.models ?? 0}</strong>
        </div>
      </div>

      {intelligence.package_manager && intelligence.package_manager !== "unknown" && (
        <p className="ws-muted">
          Package manager: {intelligence.package_manager}
        </p>
      )}

      {keyFiles.length > 0 && (
        <div className="ws-repo-key-files">
          <div className="ws-repo-label">Key files</div>
          <ul>
            {keyFiles.slice(0, 6).map((filePath) => (
              <li key={filePath}>
                <button type="button" onClick={() => onOpenFile?.(filePath)}>
                  {filePath}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
