const GENERATION_TAGS = {
  chatReceived: "CHAT RECEIVED",
  generationDetected: "GENERATION DETECTED",
  plannerStart: "PLANNER START",
  ollamaRequest: "OLLAMA REQUEST",
  ollamaResponse: "OLLAMA RESPONSE",
  reviewCreated: "REVIEW CREATED",
  applyStart: "APPLY START",
  fileWrite: "FILE WRITE",
  fileWriteSuccess: "FILE WRITE SUCCESS",
  explorerRefresh: "EXPLORER REFRESH",
  generationComplete: "GENERATION COMPLETE",
  generationFailed: "GENERATION FAILED",
};

const diagnostics = [];
const listeners = new Set();
const MAX_DIAGNOSTICS = 200;

function notifyDiagnostics() {
  const snapshot = [...diagnostics];
  listeners.forEach((listener) => listener(snapshot));
}

export function subscribeGenerationDiagnostics(listener) {
  listeners.add(listener);
  listener([...diagnostics]);
  return () => listeners.delete(listener);
}

export function getGenerationDiagnostics() {
  return [...diagnostics];
}

export function clearGenerationDiagnostics() {
  diagnostics.length = 0;
  notifyDiagnostics();
}

export function recordGenerationStep(tag, payload = {}, { level = "info", message = "" } = {}) {
  const entry = {
    tag,
    level,
    message,
    payload,
    timestamp: new Date().toISOString(),
  };

  diagnostics.push(entry);
  if (diagnostics.length > MAX_DIAGNOSTICS) {
    diagnostics.splice(0, diagnostics.length - MAX_DIAGNOSTICS);
  }

  notifyDiagnostics();

  if (level === "error") {
    console.error(`[${tag}]`, message || payload);
  } else {
    console.info(`[${tag}]`, message || payload);
  }

  return entry;
}

export function logAgentDebug(stage, payload = {}) {
  if (import.meta.env.PROD && localStorage.getItem("beingai.agentDebug") !== "1") {
    return;
  }

  console.info(`[BEING AI Agent] ${stage}`, payload);
}

export function logGeneration(stage, payload = {}) {
  const tag = GENERATION_TAGS[stage] || stage.toUpperCase();
  recordGenerationStep(tag, payload);
}

export function extractCreatedFiles(results = []) {
  return results
    .filter((entry) => entry?.tool === "create_file" || entry?.tool === "edit_file")
    .map((entry) => entry.path || entry.new_path)
    .filter(Boolean);
}

export { GENERATION_TAGS };
