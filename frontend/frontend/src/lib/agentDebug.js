export function logAgentDebug(stage, payload = {}) {
  if (import.meta.env.PROD && localStorage.getItem("beingai.agentDebug") !== "1") {
    return;
  }

  console.info(`[BEING AI Agent] ${stage}`, payload);
}

const GENERATION_LABELS = {
  start: "GENERATION START",
  plan: "PLAN CREATED",
  files: "FILES WRITTEN",
  explorer: "EXPLORER REFRESHED",
  opened: "WORKSPACE OPENED",
  error: "GENERATION FAILED",
};

export function logGeneration(stage, payload = {}) {
  const label = GENERATION_LABELS[stage] || stage.toUpperCase();
  console.info(`[${label}]`, payload);
}

export function extractCreatedFiles(results = []) {
  return results
    .filter((entry) => entry?.tool === "create_file" || entry?.tool === "edit_file")
    .map((entry) => entry.path || entry.new_path)
    .filter(Boolean);
}
