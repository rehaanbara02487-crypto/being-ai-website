import EmptyState from "./EmptyState";

export default function TerminalView({
  terminalRef,
  terminalLogs,
  selectedProject,
  projectRunning,
  runStatus,
  terminalAnalysis,
  onFixIssue,
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

      {terminalAnalysis?.has_errors && (
        <div className="ws-error-panel" style={{ margin: "8px 12px 0" }}>
          <strong>Run failed</strong>
          <pre>{terminalAnalysis.findings?.map((item) => item.message).join("\n") || terminalAnalysis.excerpt}</pre>
          {onFixIssue && (
            <button
              className="ws-btn ws-btn-primary"
              onClick={() => onFixIssue(terminalAnalysis.suggested_prompt)}
              style={{ marginTop: "8px" }}
              type="button"
            >
              Fix Issue
            </button>
          )}
        </div>
      )}

      <div ref={terminalRef} className="ws-terminal">
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
        ) : !selectedProject ? (
          <EmptyState
            description="Select a project, then click Run to stream stdout and stderr here."
            icon="▣"
            title="No terminal session"
          />
        ) : (
          <EmptyState
            actionLabel="Run Project"
            description={`Ready to run ${selectedProject}. Output from your project will appear here.`}
            icon="▣"
            onAction={onRun}
            title="Terminal idle"
          />
        )}
      </div>
    </div>
  );
}
