import { useCallback, useEffect, useState } from "react";

const WIDTH_KEY = "beingai.editorPanelWidth";
const DEFAULT_WIDTH = 42;

function readPanelWidth() {
  try {
    const value = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(value) && value >= 20 && value <= 70) {
      return value;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_WIDTH;
}

export function useActivityPanel({ selectedProject, selectedFile }) {
  const hasWorkspaceContent = Boolean(selectedProject) || Boolean(selectedFile);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(readPanelWidth);

  useEffect(() => {
    if (!hasWorkspaceContent) {
      setPanelOpen(false);
    }
  }, [hasWorkspaceContent]);

  useEffect(() => {
    if (selectedProject) {
      setPanelOpen(true);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (selectedFile) {
      setPanelOpen(true);
    }
  }, [selectedFile]);

  const openPanel = useCallback(() => {
    if (!hasWorkspaceContent) return;
    setPanelOpen(true);
  }, [hasWorkspaceContent]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const togglePanel = useCallback(() => {
    if (!hasWorkspaceContent) return;
    setPanelOpen((current) => !current);
  }, [hasWorkspaceContent]);

  const savePanelWidth = useCallback((layout) => {
    const nextWidth = layout?.activity;
    if (typeof nextWidth !== "number") return;
    const rounded = Math.round(nextWidth);
    setPanelWidth(rounded);
    localStorage.setItem(WIDTH_KEY, String(rounded));
  }, []);

  return {
    panelOpen: hasWorkspaceContent && panelOpen,
    panelWidth,
    hasWorkspaceContent,
    openPanel,
    closePanel,
    togglePanel,
    savePanelWidth,
  };
}
