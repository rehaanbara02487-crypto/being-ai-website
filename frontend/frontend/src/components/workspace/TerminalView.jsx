export default function TerminalView({
  terminalRef,
  terminalLogs,
  selectedProject,
  projectRunning,
  runStatus,
  onRun,
  onStop,
}) {
  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
      <div className="ws-activity-sidebar-header">
        <span>Terminal</span>
        <div style={{ alignItems: "center", display: "flex", gap: "8px" }}>
          <span
            className={projectRunning ? "ws-status ws-status-running" : "ws-status"}
            style={{ fontWeight: "normal", textTransform: "none" }}
          >
            {runStatus}
          </span>
          {projectRunning ? (
            <button className="ws-btn ws-btn-danger" disabled={!selectedProject} onClick={onStop} type="button">
              Stop
            </button>
          ) : (
            <button className="ws-btn ws-btn-primary" disabled={!selectedProject} onClick={onRun} type="button">
              Run
            </button>
          )}
        </div>
      </div>

      <pre ref={terminalRef} className="ws-terminal">
        {terminalLogs.length ? (
          terminalLogs.map((log, index) => (
            <span
              key={`${index}-${log.stream}`}
              style={{
                color:
                  log.stream === "stderr"
                    ? "var(--ws-error)"
                    : log.stream === "system"
                      ? "var(--ws-accent)"
                      : "inherit",
              }}
            >
              {log.message}
            </span>
          ))
        ) : (
          <span className="ws-terminal-empty">
            Run a project to see stdout and stderr here.
          </span>
        )}
      </pre>
    </div>
  );
}
