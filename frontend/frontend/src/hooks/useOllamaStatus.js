import { useCallback, useEffect, useState } from "react";

import { getOllamaStatus } from "../lib/api";

export function useOllamaStatus(model = "") {
  const [status, setStatus] = useState({
    online: false,
    message: "Checking Ollama…",
    base_url: "",
    model: "",
    model_available: false,
    models: [],
  });
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const next = await getOllamaStatus(model.trim() || undefined);
      setStatus(next);
    } catch (error) {
      setStatus((current) => ({
        ...current,
        online: false,
        message: error.message || "Unable to check Ollama status.",
      }));
    } finally {
      setChecking(false);
    }
  }, [model]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    status,
    checking,
    refresh,
  };
}
