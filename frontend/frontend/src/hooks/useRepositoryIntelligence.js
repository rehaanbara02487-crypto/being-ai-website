import { useCallback, useEffect, useState } from "react";

import { getProjectIntelligence, rebuildProjectIndex } from "../lib/api";

export function useRepositoryIntelligence(projectName) {
  const [intelligence, setIntelligence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!projectName) {
      setIntelligence(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [intel] = await Promise.all([
        getProjectIntelligence(projectName),
        rebuildProjectIndex(projectName).catch(() => null),
      ]);
      setIntelligence(intel);
    } catch (loadError) {
      setError(loadError.message);
      setIntelligence(null);
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    intelligence,
    loading,
    error,
    refresh,
  };
}
