const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || data.detail || `Request failed with status ${response.status}`);
  }

  return data;
}

export function listProjects() {
  return request("/projects");
}

export function getProject(projectName) {
  return request(`/projects/${encodeURIComponent(projectName)}`);
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
