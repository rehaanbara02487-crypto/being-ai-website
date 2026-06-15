export default function RepositoryDiagnosticsPanel({ diagnostics, intelligence }) {
  if (!diagnostics && !intelligence?.index) {
    return null;
  }

  const index = intelligence?.index || {};
  const payload = diagnostics || {};

  return (
    <details className="ws-repo-diagnostics">
      <summary>Repository Diagnostics</summary>
      <div className="ws-repo-diagnostics-grid">
        <div>
          <span>Files indexed</span>
          <strong>{payload.files_indexed ?? index.file_count ?? intelligence?.file_count ?? 0}</strong>
        </div>
        <div>
          <span>Symbols indexed</span>
          <strong>{payload.symbols_indexed ?? index.symbol_count ?? intelligence?.symbol_count ?? 0}</strong>
        </div>
        <div>
          <span>Index duration</span>
          <strong>{payload.index_duration_ms ?? index.index_duration_ms ?? intelligence?.index_duration_ms ?? 0} ms</strong>
        </div>
        <div>
          <span>Context chars</span>
          <strong>{payload.context_chars ?? 0}</strong>
        </div>
        <div>
          <span>Context files</span>
          <strong>{payload.context_file_count ?? 0}</strong>
        </div>
        <div>
          <span>Files edited</span>
          <strong>{payload.files_edited ?? 0}</strong>
        </div>
        <div>
          <span>Edit duration</span>
          <strong>{payload.edit_duration_ms ?? 0} ms</strong>
        </div>
        <div>
          <span>Total duration</span>
          <strong>{payload.total_duration_ms ?? 0} ms</strong>
        </div>
      </div>
    </details>
  );
}
