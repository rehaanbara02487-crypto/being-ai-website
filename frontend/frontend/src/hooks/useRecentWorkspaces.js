const STORAGE_KEY = "beingai.recentWorkspaces.v1";
const MAX_RECENTS = 10;

function readRecents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeRecents(recents) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)));
}

export function useRecentWorkspaces() {
  function rememberWorkspace(workspace) {
    if (!workspace?.slug) return;

    const entry = {
      slug: workspace.slug,
      name: workspace.name || workspace.slug,
      path: workspace.path || "",
      kind: workspace.kind || "managed",
      lastOpenedAt: Date.now(),
    };

    const recents = readRecents().filter((item) => item.slug !== entry.slug);
    writeRecents([entry, ...recents]);
  }

  function getRecents() {
    return readRecents();
  }

  function getLastWorkspaceSlug() {
    const recents = readRecents();
    return recents[0]?.slug || "";
  }

  return {
    rememberWorkspace,
    getRecents,
    getLastWorkspaceSlug,
  };
}

export function getStoredActiveWorkspaceSlug() {
  try {
    return localStorage.getItem("beingai.activeWorkspaceSlug") || "";
  } catch {
    return "";
  }
}

export function setStoredActiveWorkspaceSlug(slug) {
  try {
    if (slug) {
      localStorage.setItem("beingai.activeWorkspaceSlug", slug);
    } else {
      localStorage.removeItem("beingai.activeWorkspaceSlug");
    }
  } catch {
    // ignore storage failures
  }
}
