import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "beingai.sidebarState";

const DEFAULT_STATE = {
  view: "explorer",
  expanded: true,
};

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

export function useSidebarState() {
  const [sidebarView, setSidebarView] = useState(() => readState().view);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => readState().expanded);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ view: sidebarView, expanded: sidebarExpanded })
    );
  }, [sidebarExpanded, sidebarView]);

  return {
    sidebarView,
    setSidebarView,
    sidebarExpanded,
    setSidebarExpanded,
  };
}
