import { useCallback, useEffect, useState } from "react";

import {
  createProjectFile,
  createProjectFolder,
  deleteProjectPath,
  getProject,
  getProjectFile,
  listProjects,
  renameProjectPath,
  saveProjectFile,
} from "../lib/api";

export function useWorkspaceProject({ onProjectOpened, onRunnerReset }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
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

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        setError("");
        const data = await listProjects();
        if (cancelled) return;

        const projectNames = data.projects || [];
        setProjects(projectNames);
        setMessage(
          projectNames.length
            ? "Select a project to load its files."
            : "No projects found in the backend workspace."
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
          setMessage("Unable to load projects.");
        }
      }
    }

    loadProjects();

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
    setMessage(
      successMessage ||
        (projectFiles.length || projectFolders.length
          ? "Choose a file to open it in the editor."
          : "This project has no files yet.")
    );

    return data;
  }, []);

  const openProject = useCallback(
    async (projectName) => {
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
        await refreshProjectFiles(projectName);
        await onProjectOpened?.(projectName);
      } catch (loadError) {
        setError(loadError.message);
        setMessage("Unable to load project files.");
      } finally {
        setLoading(false);
      }
    },
    [onProjectOpened, onRunnerReset, refreshProjectFiles]
  );

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
    const data = await listProjects();
    setProjects(data.projects || []);
    return data.projects || [];
  }, []);

  return {
    projects,
    setProjects,
    selectedProject,
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
    saveFile,
    createFile,
    createFolder,
    renameSelectedPath,
    deleteSelectedPath,
    reloadProjects,
  };
}
