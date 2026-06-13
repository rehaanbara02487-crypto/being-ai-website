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
    throw new Error(data.error || `Request failed with status ${response.status}`);
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
