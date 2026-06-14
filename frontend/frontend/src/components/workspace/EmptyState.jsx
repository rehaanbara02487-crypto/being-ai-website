export default function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="ws-empty-state">
      {icon && <div className="ws-empty-state-icon">{icon}</div>}
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {actionLabel && onAction && (
        <button className="ws-btn ws-btn-primary" onClick={onAction} type="button">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
