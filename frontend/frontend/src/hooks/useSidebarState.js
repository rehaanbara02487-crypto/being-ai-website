import { useCallback, useEffect, useReducer } from "react";

const STORAGE_KEY = "beingai.sidebarState.v2";

const DEFAULT_STATE = {
  view: "explorer",
  expanded: true,
};

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return {
      view: parsed.view ?? DEFAULT_STATE.view,
      expanded: parsed.expanded ?? DEFAULT_STATE.expanded,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function sidebarReducer(state, action) {
  switch (action.type) {
    case "NAVIGATE": {
      if (state.view === action.viewId && state.expanded) {
        return { view: null, expanded: false };
      }
      return { view: action.viewId, expanded: true };
    }
    case "OPEN": {
      return { view: action.viewId, expanded: true };
    }
    case "TOGGLE_EXPANDED": {
      return { ...state, expanded: !state.expanded };
    }
    case "CLOSE_PANEL": {
      return { ...state, expanded: false };
    }
    default:
      return state;
  }
}

export function useSidebarState() {
  const [state, dispatch] = useReducer(sidebarReducer, undefined, readState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const navigateSidebar = useCallback((viewId) => {
    dispatch({ type: "NAVIGATE", viewId });
  }, []);

  const openSidebarView = useCallback((viewId) => {
    dispatch({ type: "OPEN", viewId });
  }, []);

  const toggleSidebarExpanded = useCallback(() => {
    dispatch({ type: "TOGGLE_EXPANDED" });
  }, []);

  const closeSidebarPanel = useCallback(() => {
    dispatch({ type: "CLOSE_PANEL" });
  }, []);

  return {
    sidebarView: state.view,
    sidebarExpanded: state.expanded,
    navigateSidebar,
    openSidebarView,
    toggleSidebarExpanded,
    closeSidebarPanel,
  };
}
