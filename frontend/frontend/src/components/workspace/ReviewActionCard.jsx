export default function ReviewActionCard({
  action,
  applying,
  onApprove,
  onOpenFile,
}) {
  return (
    <div className="ws-review-card">
      <div className="ws-review-card-header">
        <strong style={{ color: action.valid ? "inherit" : "var(--ws-error)" }}>
          {action.summary}
        </strong>
        {action.status && (
          <span style={{ color: "var(--ws-muted)", fontSize: "0.75rem" }}>
            {action.status}
          </span>
        )}
      </div>

      {action.valid && (
        <div style={{ color: "var(--ws-muted)", fontSize: "0.75rem", padding: "0 12px 8px" }}>
          +{action.lines_added || 0} / -{action.lines_removed || 0} / ~{action.lines_modified || 0}
        </div>
      )}

      {action.error && (
        <div style={{ color: "var(--ws-error)", fontSize: "0.82rem", padding: "0 12px 8px" }}>
          {action.error}
        </div>
      )}

      <pre className="ws-review-diff">{action.diff || "No textual diff available."}</pre>

      <div style={{ display: "flex", gap: "8px", padding: "10px 12px" }}>
        {(action.new_path || action.path) && onOpenFile && (
          <button
            className="ws-btn"
            onClick={() => onOpenFile(action.new_path || action.path)}
            type="button"
          >
            Open File
          </button>
        )}
        <button
          className="ws-btn ws-btn-primary"
          disabled={applying || !action.valid || action.status === "applied"}
          onClick={() => onApprove(action)}
          type="button"
        >
          {action.status === "applied" ? "Applied" : "Approve File"}
        </button>
      </div>
    </div>
  );
}

export function ReviewPlanPanel({
  plannedActions,
  changeSummary,
  applying,
  hasInvalidPlannedActions,
  onApprovePlan,
  onRejectPlan,
  onApproveAction,
  onOpenFile,
}) {
  if (!plannedActions.length) return null;

  return (
    <div className="ws-message ws-message-assistant" style={{ maxWidth: "100%" }}>
      <div className="ws-message-label">Review Required</div>
      <div className="ws-message-bubble">
        <div className="ws-review-stats">
          <div className="ws-review-stat">
            <div className="ws-review-stat-label">Files</div>
            <strong>
              {changeSummary?.files_changed ??
                plannedActions.filter((action) => action.valid).length}
            </strong>
          </div>
          <div className="ws-review-stat">
            <div className="ws-review-stat-label">Added</div>
            <strong style={{ color: "var(--ws-success)" }}>
              +{changeSummary?.lines_added ?? 0}
            </strong>
          </div>
          <div className="ws-review-stat">
            <div className="ws-review-stat-label">Removed</div>
            <strong style={{ color: "var(--ws-error)" }}>
              -{changeSummary?.lines_removed ?? 0}
            </strong>
          </div>
          <div className="ws-review-stat">
            <div className="ws-review-stat-label">Modified</div>
            <strong style={{ color: "#ffd37a" }}>
              ~{changeSummary?.lines_modified ?? 0}
            </strong>
          </div>
        </div>

        {plannedActions.map((action) => (
          <ReviewActionCard
            key={action.id}
            action={action}
            applying={applying}
            onApprove={onApproveAction}
            onOpenFile={onOpenFile}
          />
        ))}

        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          <button
            className="ws-btn ws-btn-primary"
            disabled={applying || hasInvalidPlannedActions}
            onClick={onApprovePlan}
            type="button"
          >
            {applying ? "Applying..." : "Approve & Apply All"}
          </button>
          <button
            className="ws-btn"
            disabled={applying}
            onClick={onRejectPlan}
            type="button"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
