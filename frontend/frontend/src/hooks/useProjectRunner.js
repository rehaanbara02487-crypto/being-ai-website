import { useCallback, useEffect, useRef, useState } from "react";

import {
  analyzeTerminalLogs,
  getProjectRunStatus,
  getProjectRunStreamUrl,
  startProjectRun,
  stopProjectRun,
} from "../lib/api";

export function useProjectRunner() {
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [projectRunning, setProjectRunning] = useState(false);
  const [runStatus, setRunStatus] = useState("Idle");
  const [terminalAnalysis, setTerminalAnalysis] = useState(null);
  const eventSourceRef = useRef(null);
  const terminalRef = useRef(null);
  const logsRef = useRef([]);

  const closeRunStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const appendTerminalLog = useCallback((stream, message) => {
    setTerminalLogs((logs) => {
      const next = [...logs, { stream, message }];
      logsRef.current = next;
      return next;
    });
  }, []);

  const openRunStream = useCallback(
    (projectName) => {
      closeRunStream();

      const eventSource = new EventSource(getProjectRunStreamUrl(projectName));
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        appendTerminalLog(payload.stream, payload.message);
        setProjectRunning(payload.running);

        if (payload.running) {
          setRunStatus("Running");
        } else {
          setRunStatus(
            payload.returncode === null ? "Idle" : `Exited (${payload.returncode})`
          );
          if (payload.returncode && payload.returncode !== 0) {
            analyzeTerminalLogs(projectName, logsRef.current.slice(-200))
              .then(setTerminalAnalysis)
              .catch(() => setTerminalAnalysis(null));
          } else {
            setTerminalAnalysis(null);
          }
          closeRunStream();
        }
      };

      eventSource.onerror = () => {
        appendTerminalLog("system", "Log stream disconnected\n");
        setProjectRunning(false);
        setRunStatus("Disconnected");
        closeRunStream();
      };
    },
    [appendTerminalLog, closeRunStream]
  );

  const resetRunner = useCallback(() => {
    setTerminalLogs([]);
    setProjectRunning(false);
    setRunStatus("Idle");
    setTerminalAnalysis(null);
    closeRunStream();
  }, [closeRunStream]);

  const refreshRunStatus = useCallback(
    async (projectName) => {
      try {
        const status = await getProjectRunStatus(projectName);
        setProjectRunning(status.running);
        setRunStatus(status.running ? "Running" : "Idle");

        if (status.running) {
          openRunStream(projectName);
        } else {
          closeRunStream();
        }
      } catch (statusError) {
        setProjectRunning(false);
        setRunStatus("Unavailable");
        appendTerminalLog("system", `${statusError.message}\n`);
      }
    },
    [appendTerminalLog, closeRunStream, openRunStream]
  );

  const runProject = useCallback(
    async (projectName, setError) => {
      if (!projectName) return;

      setError?.("");
      setTerminalLogs([]);
      setRunStatus("Starting");
      appendTerminalLog("system", `Starting ${projectName}...\n`);

      try {
        const status = await startProjectRun(projectName);
        setProjectRunning(status.running);
        setRunStatus(status.running ? "Running" : "Idle");
        openRunStream(projectName);
      } catch (runError) {
        setProjectRunning(false);
        setRunStatus("Failed");
        setError?.(runError.message);
        appendTerminalLog("stderr", `${runError.message}\n`);
      }
    },
    [appendTerminalLog, openRunStream]
  );

  const stopProject = useCallback(
    async (projectName, setError) => {
      if (!projectName) return;

      setError?.("");
      setRunStatus("Stopping");
      appendTerminalLog("system", `Stopping ${projectName}...\n`);

      try {
        const status = await stopProjectRun(projectName);
        setProjectRunning(status.running);
        setRunStatus(status.running ? "Running" : "Stopped");
      } catch (stopError) {
        setError?.(stopError.message);
        appendTerminalLog("stderr", `${stopError.message}\n`);
      }
    },
    [appendTerminalLog]
  );

  useEffect(() => {
    return () => closeRunStream();
  }, [closeRunStream]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  return {
    terminalLogs,
    projectRunning,
    runStatus,
    terminalRef,
    resetRunner,
    refreshRunStatus,
    runProject,
    stopProject,
    terminalAnalysis,
    clearTerminalAnalysis: () => setTerminalAnalysis(null),
  };
}
