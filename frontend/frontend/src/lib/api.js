const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const AGENT_ENDPOINTS = new Set([
  "/agent/projects/plan",
  "/agent/file-actions/plan",
  "/agent/file-actions/apply",
]);

function formatApiError(data, status) {
  if (data?.error) {
    return data.error;
  }

  if (typeof data?.detail === "string") {
    return data.detail;
  }

  if (data?.detail && typeof data.detail === "object") {
    try {
      return JSON.stringify(data.detail, null, 2);
    } catch {
      return String(data.detail);
    }
  }

  if (Array.isArray(data?.detail)) {
    return data.detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .join("; ");
  }

  if (data?.detail) {
    return String(data.detail);
  }

  return `Request failed with status ${status}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  const rawBody = await response.text();
  let data = {};

  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      throw new Error(rawBody || `Request failed with status ${response.status}`);
    }
  }

  if (AGENT_ENDPOINTS.has(path) || path.startsWith("/agent/reviews/")) {
    console.info(`[BEING AI Agent] api ${options.method || "GET"} ${path}`, {
      ok: response.ok,
      status: response.status,
    });
  }

  if (!response.ok || data.error) {
    throw new Error(formatApiError(data, response.status));
  }

  return data;
}

export function listProjects() {
  return request("/projects");
}

export function listWorkspaces() {
  return request("/workspaces");
}

export function openWorkspace({ path, name }) {
  return request("/workspaces/open", {
    method: "POST",
    body: JSON.stringify({
      path,
      name: name || undefined,
    }),
  });
}

export function pickWorkspaceFolder() {
  return request("/workspaces/pick-folder", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getOllamaStatus(model) {
  const params = model ? `?model=${encodeURIComponent(model)}` : "";
  return request(`/ollama/status${params}`);
}

export function getProject(projectName) {
  return request(`/projects/${encodeURIComponent(projectName)}`);
}

export function getProjectIntelligence(projectName) {
  return request(`/projects/${encodeURIComponent(projectName)}/intelligence`);
}

export function rebuildProjectIndex(projectName) {
  return request(`/projects/${encodeURIComponent(projectName)}/index/rebuild`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function searchProjectIndex(projectName, query, limit = 25) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return request(`/projects/${encodeURIComponent(projectName)}/index/search?${params}`);
}

export function analyzeTerminalLogs(projectName, logs) {
  return request(`/projects/${encodeURIComponent(projectName)}/terminal/analyze`, {
    method: "POST",
    body: JSON.stringify({ logs }),
  });
}

export function suggestGitCommitMessage(projectName, { diff, changes }) {
  return request(`/projects/${encodeURIComponent(projectName)}/git/suggest-commit`, {
    method: "POST",
    body: JSON.stringify({ diff, changes }),
  });
}

export function summarizeGitDiff(projectName, diff) {
  return request(`/projects/${encodeURIComponent(projectName)}/git/summarize-diff`, {
    method: "POST",
    body: JSON.stringify({ diff }),
  });
}

export function getProjectFile(projectName, filePath) {
  const params = new URLSearchParams({ path: filePath });
  return request(`/projects/${encodeURIComponent(projectName)}/file?${params}`);
}

export function saveProjectFile(projectName, filePath, content) {
  return request("/edit-file", {
    method: "POST",
    body: JSON.stringify({
      project_name: projectName,
      filename: filePath,
      content,
    }),
  });
}

export function createProjectFile(projectName, filePath, content = "") {
  return request(`/projects/${encodeURIComponent(projectName)}/file`, {
    method: "POST",
    body: JSON.stringify({
      path: filePath,
      content,
    }),
  });
}

export function createProjectFolder(projectName, folderPath) {
  return request(`/projects/${encodeURIComponent(projectName)}/folder`, {
    method: "POST",
    body: JSON.stringify({
      path: folderPath,
    }),
  });
}

export function renameProjectPath(projectName, path, newPath) {
  return request(`/projects/${encodeURIComponent(projectName)}/path`, {
    method: "PATCH",
    body: JSON.stringify({
      path,
      new_path: newPath,
    }),
  });
}

export function deleteProjectPath(projectName, path) {
  const params = new URLSearchParams({ path });
  return request(`/projects/${encodeURIComponent(projectName)}/path?${params}`, {
    method: "DELETE",
  });
}

export function startProjectRun(projectName) {
  return request(`/projects/${encodeURIComponent(projectName)}/run`, {
    method: "POST",
  });
}

export function getProjectRunStatus(projectName) {
  return request(`/projects/${encodeURIComponent(projectName)}/run`);
}

export function stopProjectRun(projectName) {
  return request(`/projects/${encodeURIComponent(projectName)}/stop`, {
    method: "POST",
  });
}

export function getProjectRunStreamUrl(projectName) {
  return `${API_BASE_URL}/projects/${encodeURIComponent(projectName)}/run/stream`;
}

export async function streamOllamaChat({
  prompt,
  model,
  projectName,
  useWorkspaceContext,
  openedFile,
  selectedFolder,
  maxContextChars,
  onEvent,
}) {
  const response = await fetch(`${API_BASE_URL}/ollama/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      model: model || undefined,
      project_name: projectName || undefined,
      use_workspace_context: Boolean(useWorkspaceContext),
      opened_file: openedFile || undefined,
      selected_folder: selectedFolder || undefined,
      max_context_chars: maxContextChars || undefined,
    }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || data.detail || `Request failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      const dataLine = event
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!dataLine) continue;

      onEvent(JSON.parse(dataLine.slice(6)));
    }
  }

  if (buffer.startsWith("data: ")) {
    onEvent(JSON.parse(buffer.slice(6)));
  }
}

export function planAgentFileActions({
  projectName,
  prompt,
  model,
  useWorkspaceContext,
  openedFile,
  selectedFolder,
  maxContextChars,
  autoApply = false,
}) {
  return request("/agent/file-actions/plan", {
    method: "POST",
    body: JSON.stringify({
      project_name: projectName,
      prompt,
      model: model || undefined,
      use_workspace_context: Boolean(useWorkspaceContext),
      opened_file: openedFile || undefined,
      selected_folder: selectedFolder || undefined,
      max_context_chars: maxContextChars || undefined,
      auto_apply: Boolean(autoApply),
    }),
  });
}

export function planNewProject({
  prompt,
  projectName,
  model,
  stack,
  target = "default",
  targetPath,
  currentWorkspace,
  autoApply = false,
}) {
  return request("/agent/projects/plan", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      project_name: projectName || undefined,
      model: model || undefined,
      stack: stack || undefined,
      target,
      target_path: targetPath || undefined,
      current_workspace: currentWorkspace || undefined,
      auto_apply: autoApply,
    }),
  });
}

export function applyAgentFileActions({ projectName, actions, prompt }) {
  return request("/agent/file-actions/apply", {
    method: "POST",
    body: JSON.stringify({
      project_name: projectName,
      actions,
      prompt,
    }),
  });
}

export function applyReviewActions({ reviewId, actionIds }) {
  return request(`/agent/reviews/${encodeURIComponent(reviewId)}/apply`, {
    method: "POST",
    body: JSON.stringify({
      action_ids: actionIds,
    }),
  });
}

export function rejectReview({ reviewId, reason }) {
  return request(`/agent/reviews/${encodeURIComponent(reviewId)}/reject`, {
    method: "POST",
    body: JSON.stringify({
      reason,
    }),
  });
}

export function startAutonomousAgentTask({
  projectName,
  prompt,
  model,
  maxIterations = 3,
  maxContextChars,
  openedFile,
  selectedFolder,
  autoApply = true,
}) {
  return request("/agent/tasks", {
    method: "POST",
    body: JSON.stringify({
      project_name: projectName,
      prompt,
      model: model || undefined,
      max_iterations: maxIterations,
      max_context_chars: maxContextChars || undefined,
      opened_file: openedFile || undefined,
      selected_folder: selectedFolder || undefined,
      auto_apply: Boolean(autoApply),
    }),
  });
}

export function getAutonomousAgentTask(taskId) {
  return request(`/agent/tasks/${encodeURIComponent(taskId)}`);
}

export function stopAutonomousAgentTask(taskId) {
  return request(`/agent/tasks/${encodeURIComponent(taskId)}/stop`, {
    method: "POST",
  });
}

export function getGitBranch(projectName) {
  return request(`/projects/${encodeURIComponent(projectName)}/git/branch`);
}

export function getGitStatus(projectName) {
  return request(`/projects/${encodeURIComponent(projectName)}/git/status`);
}

export function getGitDiff(projectName, filePath) {
  const params = filePath ? `?${new URLSearchParams({ path: filePath })}` : "";
  return request(`/projects/${encodeURIComponent(projectName)}/git/diff${params}`);
}

export function getGitHistory(projectName) {
  return request(`/projects/${encodeURIComponent(projectName)}/git/history`);
}

export function createGitBranch(projectName, name, checkout = true) {
  return request(`/projects/${encodeURIComponent(projectName)}/git/branches`, {
    method: "POST",
    body: JSON.stringify({
      name,
      checkout,
    }),
  });
}

export function switchGitBranch(projectName, name) {
  return request(`/projects/${encodeURIComponent(projectName)}/git/checkout`, {
    method: "POST",
    body: JSON.stringify({
      name,
    }),
  });
}

export function commitGitChanges(projectName, message, files) {
  return request(`/projects/${encodeURIComponent(projectName)}/git/commit`, {
    method: "POST",
    body: JSON.stringify({
      message,
      files,
      create_snapshot: true,
    }),
  });
}

export function getGitSnapshots(projectName) {
  return request(`/projects/${encodeURIComponent(projectName)}/git/snapshots`);
}

export function createGitSnapshot(projectName, name) {
  return request(`/projects/${encodeURIComponent(projectName)}/git/snapshots`, {
    method: "POST",
    body: JSON.stringify({
      name: name || undefined,
    }),
  });
}

export function restoreGitRef(projectName, ref, path) {
  return request(`/projects/${encodeURIComponent(projectName)}/git/restore`, {
    method: "POST",
    body: JSON.stringify({
      ref,
      path: path || undefined,
    }),
  });
}

export function revertGitCommit(projectName, commitHash) {
  return request(`/projects/${encodeURIComponent(projectName)}/git/revert`, {
    method: "POST",
    body: JSON.stringify({
      commit_hash: commitHash,
    }),
  });
}
