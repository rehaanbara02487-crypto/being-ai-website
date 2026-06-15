import { useCallback, useEffect, useState } from "react";

import {
  createProjectFile,
  createProjectFolder,
  deleteProjectPath,
  getProject,
  getProjectFile,
  listProjects,
  listWorkspaces,
  openWorkspace,
  pickWorkspaceFolder,
  renameProjectPath,
  saveProjectFile,
} from "../lib/api";
import {
  getStoredActiveWorkspaceSlug,
  setStoredActiveWorkspaceSlug,
  useRecentWorkspaces,
} from "./useRecentWorkspaces";

export function useWorkspaceProject({ onProjectOpened, onRunnerReset }) {
  const { rememberWorkspace, getRecents } = useRecentWorkspaces();
  const [projects, setProjects] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [recentWorkspaces, setRecentWorkspaces] = useState(() => getRecents());
  const [selectedProject, setSelectedProject] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [workspaceKind, setWorkspaceKind] = useState("managed");
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Loading projects...");
  const [error, setError] = useState("");

  const syncWorkspaceLists = useCallback(async () => {
    const [projectsData, workspacesData] = await Promise.all([
      listProjects(),
      listWorkspaces(),
    ]);
    const projectNames = projectsData.projects || [];
    setProjects(projectNames);
    setWorkspaces(workspacesData.workspaces || []);
    return { projectNames, workspaces: workspacesData.workspaces || [] };
  }, []);

  const openProject = useCallback(
    async (projectName, workspaceMeta = null) => {
      setSelectedProject(projectName);
      setSelectedFile("");
      setSelectedFolder("");
      setFiles([]);
      setFolders([]);
      setContent("");
      setIsDirty(false);
      onRunnerReset?.();
      setLoading(true);
      setError("");
      setMessage(`Loading ${projectName}...`);

      try {
        const data = await getProject(projectName);
        const projectFiles = data.files || [];
        const projectFolders = data.folders || [];

        setFiles(projectFiles);
        setFolders(projectFolders);
        setWorkspacePath(data.path || workspaceMeta?.path || "");
        setWorkspaceKind(workspaceMeta?.kind || data.kind || "managed");
        setMessage(
          projectFiles.length || projectFolders.length
            ? "Choose a file to open it in the editor."
            : "This project has no files yet."
        );

        const workspaceRecord = workspaceMeta || {
          slug: projectName,
          name: projectName,
          path: data.path || "",
          kind: data.kind || "managed",
        };

        setWorkspaceKind(workspaceRecord.kind || data.kind || "managed");

        rememberWorkspace(workspaceRecord);
        setRecentWorkspaces(getRecents());
        setStoredActiveWorkspaceSlug(projectName);

        await onProjectOpened?.(projectName);
      } catch (loadError) {
        setError(loadError.message);
        setMessage("Unable to load project files.");
      } finally {
        setLoading(false);
      }
    },
    [onProjectOpened, onRunnerReset, getRecents, rememberWorkspace]
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setError("");
        const { projectNames, workspaces } = await syncWorkspaceLists();
        if (cancelled) return;

        if (projectNames.length) {
          setMessage("Select a project or open a folder.");
          const lastSlug = getStoredActiveWorkspaceSlug();
          if (lastSlug && projectNames.includes(lastSlug)) {
            const workspaceMeta = workspaces.find((entry) => entry.slug === lastSlug) || null;
            await openProject(lastSlug, workspaceMeta);
          }
        } else {
          setMessage("No projects found. Open a folder or scaffold one from Chat.");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
          setMessage("Unable to load projects.");
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshProjectFiles = useCallback(async (projectName, successMessage) => {
    const data = await getProject(projectName);
    const projectFiles = data.files || [];
    const projectFolders = data.folders || [];

    setFiles(projectFiles);
    setFolders(projectFolders);
    setWorkspacePath(data.path || "");
    setMessage(
      successMessage ||
        (projectFiles.length || projectFolders.length
          ? "Choose a file to open it in the editor."
          : "This project has no files yet.")
    );

    return data;
  }, []);

  const openFile = useCallback(
    async (filePath) => {
      if (!selectedProject) return;

      setSelectedFile(filePath);
      setSelectedFolder("");
      setLoading(true);
      setError("");
      setMessage(`Opening ${filePath}...`);

      try {
        const data = await getProjectFile(selectedProject, filePath);
        setContent(data.content || "");
        setIsDirty(false);
        setMessage(`Opened ${filePath}.`);
      } catch (loadError) {
        setContent("");
        setError(loadError.message);
        setMessage("Unable to open file.");
      } finally {
        setLoading(false);
      }
    },
    [selectedProject]
  );

  const saveFile = useCallback(async () => {
    if (!selectedProject || !selectedFile) return;

    setSaving(true);
    setError("");
    setMessage(`Saving ${selectedFile}...`);

    try {
      await saveProjectFile(selectedProject, selectedFile, content);
      setIsDirty(false);
      setMessage(`Saved ${selectedFile}.`);
    } catch (saveError) {
      setError(saveError.message);
      setMessage("Unable to save file.");
    } finally {
      setSaving(false);
    }
  }, [content, selectedFile, selectedProject]);

  const createFile = useCallback(async () => {
    if (!selectedProject) return;

    const filePath = window.prompt("New file path");
    if (!filePath) return;

    setLoading(true);
    setError("");
    setMessage(`Creating ${filePath}...`);

    try {
      await createProjectFile(selectedProject, filePath);
      await refreshProjectFiles(selectedProject, `Created file ${filePath}.`);
    } catch (createError) {
      setError(createError.message);
      setMessage("Unable to create file.");
    } finally {
      setLoading(false);
    }
  }, [refreshProjectFiles, selectedProject]);

  const createFolder = useCallback(async () => {
    if (!selectedProject) return;

    const folderPath = window.prompt("New folder path");
    if (!folderPath) return;

    setLoading(true);
    setError("");
    setMessage(`Creating ${folderPath}...`);

    try {
      await createProjectFolder(selectedProject, folderPath);
      await refreshProjectFiles(selectedProject, `Created folder ${folderPath}.`);
    } catch (createError) {
      setError(createError.message);
      setMessage("Unable to create folder.");
    } finally {
      setLoading(false);
    }
  }, [refreshProjectFiles, selectedProject]);

  const renameSelectedPath = useCallback(async () => {
    if (!selectedProject) return;

    const currentPath = selectedFolder || selectedFile;
    if (!currentPath) {
      setMessage("Select a file or folder to rename.");
      return;
    }

    const newPath = window.prompt("Rename to", currentPath);
    if (!newPath || newPath === currentPath) return;

    setLoading(true);
    setError("");
    setMessage(`Renaming ${currentPath}...`);

    try {
      await renameProjectPath(selectedProject, currentPath, newPath);

      if (selectedFile === currentPath || selectedFile.startsWith(`${currentPath}/`)) {
        setSelectedFile("");
        setContent("");
        setIsDirty(false);
      }

      if (selectedFolder === currentPath || selectedFolder.startsWith(`${currentPath}/`)) {
        setSelectedFolder("");
      }

      await refreshProjectFiles(selectedProject, `Renamed ${currentPath} to ${newPath}.`);
    } catch (renameError) {
      setError(renameError.message);
      setMessage("Unable to rename path.");
    } finally {
      setLoading(false);
    }
  }, [refreshProjectFiles, selectedFile, selectedFolder, selectedProject]);

  const deleteSelectedPath = useCallback(async () => {
    if (!selectedProject) return;

    const currentPath = selectedFolder || selectedFile;
    if (!currentPath) {
      setMessage("Select a file or folder to delete.");
      return;
    }

    if (!window.confirm(`Delete ${currentPath}?`)) return;

    setLoading(true);
    setError("");
    setMessage(`Deleting ${currentPath}...`);

    try {
      await deleteProjectPath(selectedProject, currentPath);

      if (selectedFile === currentPath || selectedFile.startsWith(`${currentPath}/`)) {
        setSelectedFile("");
        setContent("");
        setIsDirty(false);
      }

      if (selectedFolder === currentPath || selectedFolder.startsWith(`${currentPath}/`)) {
        setSelectedFolder("");
      }

      await refreshProjectFiles(selectedProject, `Deleted ${currentPath}.`);
    } catch (deleteError) {
      setError(deleteError.message);
      setMessage("Unable to delete path.");
    } finally {
      setLoading(false);
    }
  }, [refreshProjectFiles, selectedFile, selectedFolder, selectedProject]);

  const reloadProjects = useCallback(async () => {
    const { projectNames } = await syncWorkspaceLists();
    return projectNames;
  }, [syncWorkspaceLists]);

  const openFolderDialog = useCallback(async () => {
    setError("");
    setMessage("Waiting for folder selection…");

    try {
      const result = await pickWorkspaceFolder();
      if (result.cancelled) {
        setMessage("Folder selection cancelled.");
        return null;
      }

      await syncWorkspaceLists();
      await openProject(result.slug, result);
      return result;
    } catch (pickError) {
      setError(pickError.message);
      setMessage("Unable to open folder.");
      return null;
    }
  }, [openProject, syncWorkspaceLists]);

  const openFolderPath = useCallback(
    async (path, name) => {
      setError("");
      setMessage("Opening folder…");

      try {
        const result = await openWorkspace({ path, name });
        await syncWorkspaceLists();
        await openProject(result.slug, result);
        return result;
      } catch (openError) {
        setError(openError.message);
        setMessage("Unable to open folder.");
        return null;
      }
    },
    [openProject, syncWorkspaceLists]
  );

  return {
    projects,
    workspaces,
    recentWorkspaces,
    selectedProject,
    workspacePath,
    workspaceKind,
    files,
    folders,
    selectedFile,
    selectedFolder,
    setSelectedFolder,
    content,
    setContent,
    isDirty,
    setIsDirty,
    loading,
    saving,
    message,
    error,
    setError,
    setMessage,
    refreshProjectFiles,
    openProject,
    openFile,
    openFolderDialog,
    openFolderPath,
    saveFile,
    createFile,
    createFolder,
    renameSelectedPath,
    deleteSelectedPath,
    reloadProjects,
  };
}
