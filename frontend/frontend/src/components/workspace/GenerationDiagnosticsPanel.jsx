import { useEffect, useState } from "react";

import {
  clearGenerationDiagnostics,
  getGenerationDiagnostics,
  subscribeGenerationDiagnostics,
} from "../../lib/agentDebug";

function formatPayload(payload) {
  if (!payload || Object.keys(payload).length === 0) {
    return "";
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export default function GenerationDiagnosticsPanel() {
  const [steps, setSteps] = useState(() => getGenerationDiagnostics());
  const isDev = import.meta.env.DEV || localStorage.getItem("beingai.agentDebug") === "1";

  useEffect(() => subscribeGenerationDiagnostics(setSteps), []);

  if (!isDev) {
    return null;
  }

  return (
    <details className="ws-generation-diagnostics">
      <summary>Generation Diagnostics ({steps.length})</summary>
      <div className="ws-generation-diagnostics-toolbar">
        <button
          type="button"
          onClick={() => {
            clearGenerationDiagnostics();
            setSteps([]);
          }}
        >
          Clear
        </button>
      </div>
      <div className="ws-generation-diagnostics-list">
        {steps.length === 0 && (
          <p className="ws-muted">No generation steps recorded yet.</p>
        )}
        {steps.map((step, index) => (
          <div
            key={`${step.tag}-${step.timestamp}-${index}`}
            className={`ws-generation-step ${step.level === "error" ? "ws-generation-step-error" : ""}`}
          >
            <div className="ws-generation-step-header">
              <strong>[{step.tag}]</strong>
              <span>{step.timestamp}</span>
            </div>
            {step.message && <pre>{step.message}</pre>}
            {step.payload && Object.keys(step.payload).length > 0 && (
              <pre>{formatPayload(step.payload)}</pre>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
