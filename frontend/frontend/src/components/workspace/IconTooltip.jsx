export default function IconTooltip({ label, shortcut, children }) {
  return (
    <span className="ws-icon-tooltip-wrap">
      {children}
      <span className="ws-icon-tooltip" role="tooltip">
        {label}
        {shortcut ? <kbd>{shortcut}</kbd> : null}
      </span>
    </span>
  );
}
