import { useEffect, useRef, useState } from "react";

import {
  applyAgentFileActions,
  applyReviewActions,
  getAutonomousAgentTask,
  planAgentFileActions,
  rejectReview,
  streamOllamaChat,
  startAutonomousAgentTask,
  stopAutonomousAgentTask,
} from "../lib/api";

export default function ChatPanel({ selectedProject, onFilesChanged }) {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      content: "Ask BEING AI to generate code. Example: Create a Flask hello world application.",
    },
  ]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [useWorkspaceContext, setUseWorkspaceContext] = useState(false);
  const [contextStatus, setContextStatus] = useState("Workspace context off");
  const [contextFiles, setContextFiles] = useState([]);
  const [agentMode, setAgentMode] = useState(false);
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [agentTask, setAgentTask] = useState(null);
  const [reviewSession, setReviewSession] = useState(null);
  const [plannedActions, setPlannedActions] = useState([]);
  const [changeSummary, setChangeSummary] = useState(null);
  const [planMessage, setPlanMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const messagesRef = useRef(null);
  const taskPollRef = useRef(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, generating]);

  useEffect(() => {
    return () => {
      if (taskPollRef.current) {
        clearInterval(taskPollRef.current);
      }
    };
  }, []);

  function stopPollingTask() {
    if (taskPollRef.current) {
      clearInterval(taskPollRef.current);
      taskPollRef.current = null;
    }
  }

  function handleTaskUpdate(task, assistantId) {
    setAgentTask(task);

    if (task.final_plan) {
      setPlanMessage(task.final_plan.message);
      setPlannedActions(task.final_plan.previews || []);
      setChangeSummary(task.final_plan.change_summary || null);
      setReviewSession(task.final_plan.review_session || null);
    }

    if (["review", "failed", "stopped"].includes(task.status)) {
      stopPollingTask();
      setGenerating(false);
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  task.status === "review"
                    ? "Autonomous task complete. Review the final changes below before applying."
                    : task.error || `Autonomous task ${task.status}.`,
              }
            : message
        )
      );
    }
  }

  function pollTask(taskId, assistantId) {
    stopPollingTask();
    taskPollRef.current = setInterval(async () => {
      try {
        const task = await getAutonomousAgentTask(taskId);
        handleTaskUpdate(task, assistantId);
      } catch (pollError) {
        stopPollingTask();
        setGenerating(false);
        setError(pollError.message);
      }
    }, 1000);
  }

  async function sendMessage(event) {
    event.preventDefault();

    const prompt = input.trim();
    if (!prompt || generating) return;
    if (agentMode && !selectedProject) {
      setError("Select a project before using Agent Mode.");
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt,
    };
    const assistantId = `assistant-${Date.now()}`;

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        content: "",
      },
    ]);
    setInput("");
    setError("");
    setPlannedActions([]);
    setChangeSummary(null);
    setReviewSession(null);
    setPlanMessage("");
    setAgentTask(null);
    setContextFiles([]);
    setContextStatus(
      useWorkspaceContext
        ? `Indexing ${selectedProject || "workspace"}...`
        : "Workspace context off"
    );
    setGenerating(true);

    try {
      if (agentMode) {
        if (autonomousMode) {
          const task = await startAutonomousAgentTask({
            projectName: selectedProject,
            prompt,
            model: model.trim(),
            maxIterations: 3,
          });
          setAgentTask(task);
          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: "Autonomous agent started. Follow the activity panel for progress.",
                  }
                : message
            )
          );
          pollTask(task.id, assistantId);
          return;
        }

        const plan = await planAgentFileActions({
          projectName: selectedProject,
          prompt,
          model: model.trim(),
          useWorkspaceContext,
        });

        setPlanMessage(plan.message);
        setReviewSession(plan.review_session || null);
        setPlannedActions(plan.review_session?.previews || plan.previews || []);
        setChangeSummary(plan.change_summary || null);

        if (plan.context) {
          setContextStatus(plan.context.status);
          setContextFiles(plan.context.files || []);
        }

        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: `${plan.message}\n\nReview the planned file changes below before applying.`,
                }
              : message
          )
        );
        return;
      }

      await streamOllamaChat({
        prompt,
        model: model.trim(),
        projectName: selectedProject,
        useWorkspaceContext: useWorkspaceContext && Boolean(selectedProject),
        onEvent: (payload) => {
          if (payload.type === "context") {
            setContextStatus(payload.status);
            setContextFiles(payload.files || []);
          }

          if (payload.type === "token") {
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: message.content + payload.content,
                    }
                  : message
              )
            );
          }

          if (payload.type === "error") {
            setError(payload.message);
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: payload.message,
                    }
                  : message
              )
            );
          }
        },
      });
    } catch (chatError) {
      setError(chatError.message);
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: chatError.message,
              }
            : message
        )
      );
    } finally {
      setGenerating(false);
    }
  }

  async function approvePlan() {
    const validActions = plannedActions.filter((action) => action.valid);
    if (!selectedProject || !validActions.length) return;

    setApplying(true);
    setError("");

    try {
      const result = reviewSession?.id
        ? await applyReviewActions({
            reviewId: reviewSession.id,
            actionIds: validActions.map((action) => action.id),
          })
        : await applyAgentFileActions({
            projectName: selectedProject,
            actions: validActions.map((action) => ({
              tool: action.tool,
              args: action.args,
            })),
            prompt: planMessage,
          });

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-applied-${Date.now()}`,
          role: "assistant",
          content: result.message,
        },
      ]);
      setPlannedActions([]);
      setChangeSummary(null);
      setReviewSession(null);
      setPlanMessage("");
      onFilesChanged?.();
    } catch (applyError) {
      setError(applyError.message);
    } finally {
      setApplying(false);
    }
  }

  function rejectPlan() {
    if (reviewSession?.id) {
      rejectReview({
        reviewId: reviewSession.id,
        reason: "Planned file changes discarded.",
      }).catch((rejectError) => setError(rejectError.message));
    }
    setPlannedActions([]);
    setChangeSummary(null);
    setReviewSession(null);
    setPlanMessage("");
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `assistant-rejected-${Date.now()}`,
        role: "assistant",
        content: "Planned file changes discarded.",
      },
    ]);
  }

  async function approveAction(action) {
    if (!selectedProject || !action.valid) return;

    setApplying(true);
    setError("");

    try {
      let result;

      if (reviewSession?.id) {
        result = await applyReviewActions({
          reviewId: reviewSession.id,
          actionIds: [action.id],
        });
        setReviewSession(result.review_session);
        setPlannedActions(result.review_session?.previews || []);
      } else {
        result = await applyAgentFileActions({
          projectName: selectedProject,
          actions: [{ tool: action.tool, args: action.args }],
          prompt: planMessage,
        });
        setPlannedActions((currentActions) =>
          currentActions.map((currentAction) =>
            currentAction.id === action.id
              ? { ...currentAction, status: "applied" }
              : currentAction
          )
        );
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-applied-${Date.now()}`,
          role: "assistant",
          content: result.message,
        },
      ]);
      onFilesChanged?.();
    } catch (applyError) {
      setError(applyError.message);
    } finally {
      setApplying(false);
    }
  }

  async function stopAutonomousTask() {
    if (!agentTask) return;

    try {
      const stoppedTask = await stopAutonomousAgentTask(agentTask.id);
      handleTaskUpdate(stoppedTask, "");
      stopPollingTask();
      setGenerating(false);
    } catch (stopError) {
      setError(stopError.message);
    }
  }

  const hasInvalidPlannedActions = plannedActions.some((action) => !action.valid);

  return (
    <aside
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "22px",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          padding: "18px",
        }}
      >
        <h3 style={{ color: "#00ffff", margin: "0 0 8px" }}>AI Chat</h3>
        <p style={{ color: "rgba(255,255,255,0.62)", fontSize: "0.9rem", margin: 0 }}>
          Local Ollama coding assistant
        </p>
      </div>

      <div
        ref={messagesRef}
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          gap: "12px",
          minHeight: 0,
          overflow: "auto",
          padding: "16px",
        }}
      >
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              alignSelf: message.role === "user" ? "flex-end" : "flex-start",
              background:
                message.role === "user"
                  ? "rgba(0,255,255,0.18)"
                  : "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "16px",
              color: "white",
              maxWidth: "100%",
              padding: "12px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            <div
              style={{
                color: message.role === "user" ? "#00ffff" : "rgba(255,255,255,0.66)",
                fontSize: "0.75rem",
                fontWeight: "bold",
                marginBottom: "6px",
                textTransform: "uppercase",
              }}
            >
              {message.role === "user" ? "You" : "BEING AI"}
            </div>
            {message.content || (generating && message.role === "assistant" ? "Thinking..." : "")}
          </div>
        ))}
      </div>

      {agentTask && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.1)",
            maxHeight: "260px",
            overflow: "auto",
            padding: "14px",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              justifyContent: "space-between",
              gap: "10px",
              marginBottom: "10px",
            }}
          >
            <strong style={{ color: "#00ffff" }}>Agent Activity</strong>
            <button
              disabled={!["queued", "running", "stopping"].includes(agentTask.status)}
              onClick={stopAutonomousTask}
              style={{
                background: "rgba(255,133,133,0.18)",
                border: "1px solid rgba(255,133,133,0.45)",
                borderRadius: "999px",
                color: "#ff8585",
                cursor: !["queued", "running", "stopping"].includes(agentTask.status)
                  ? "not-allowed"
                  : "pointer",
                padding: "8px 12px",
              }}
              type="button"
            >
              Stop Agent
            </button>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              color: "rgba(255,255,255,0.78)",
              marginBottom: "12px",
              padding: "10px",
            }}
          >
            <div>Status: {agentTask.status}</div>
            <div>Current step: {agentTask.current_step}</div>
            <div>
              Iteration: {agentTask.iteration} / {agentTask.max_iterations}
            </div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <div style={{ color: "rgba(255,255,255,0.62)", fontSize: "0.78rem", marginBottom: "6px" }}>
              Timeline
            </div>
            {(agentTask.events || []).map((event, index) => (
              <div
                key={`${event.timestamp}-${index}`}
                style={{
                  borderLeft: "2px solid #00ffff",
                  color: "rgba(255,255,255,0.8)",
                  fontSize: "0.82rem",
                  marginBottom: "8px",
                  paddingLeft: "10px",
                }}
              >
                {event.message}
              </div>
            ))}
          </div>

          <pre
            style={{
              background: "rgba(0,0,0,0.42)",
              borderRadius: "10px",
              color: "rgba(255,255,255,0.82)",
              fontSize: "0.78rem",
              margin: 0,
              maxHeight: "120px",
              overflow: "auto",
              padding: "10px",
              whiteSpace: "pre-wrap",
            }}
          >
            {(agentTask.logs || []).length
              ? (agentTask.logs || []).map((log) => `[${log.stream}] ${log.message}`).join("")
              : "Waiting for execution logs..."}
          </pre>
        </div>
      )}

      {plannedActions.length > 0 && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.1)",
            maxHeight: "260px",
            overflow: "auto",
            padding: "14px",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              justifyContent: "space-between",
              gap: "10px",
              marginBottom: "10px",
            }}
          >
            <strong style={{ color: "#00ffff" }}>Planned File Changes</strong>
            <span style={{ color: "rgba(255,255,255,0.62)", fontSize: "0.82rem" }}>
              Approval required
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "repeat(4, 1fr)",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                background: "rgba(0,255,255,0.1)",
                border: "1px solid rgba(0,255,255,0.18)",
                borderRadius: "12px",
                padding: "10px",
              }}
            >
              <div style={{ color: "rgba(255,255,255,0.62)", fontSize: "0.72rem" }}>
                Files changed
              </div>
              <strong style={{ color: "#00ffff" }}>
                {changeSummary?.files_changed ?? plannedActions.filter((action) => action.valid).length}
              </strong>
            </div>
            <div
              style={{
                background: "rgba(0,255,255,0.1)",
                border: "1px solid rgba(0,255,255,0.18)",
                borderRadius: "12px",
                padding: "10px",
              }}
            >
              <div style={{ color: "rgba(255,255,255,0.62)", fontSize: "0.72rem" }}>
                Lines added
              </div>
              <strong style={{ color: "#8affc1" }}>
                +{changeSummary?.lines_added ?? 0}
              </strong>
            </div>
            <div
              style={{
                background: "rgba(0,255,255,0.1)",
                border: "1px solid rgba(0,255,255,0.18)",
                borderRadius: "12px",
                padding: "10px",
              }}
            >
              <div style={{ color: "rgba(255,255,255,0.62)", fontSize: "0.72rem" }}>
                Lines removed
              </div>
              <strong style={{ color: "#ff8585" }}>
                -{changeSummary?.lines_removed ?? 0}
              </strong>
            </div>
            <div
              style={{
                background: "rgba(0,255,255,0.1)",
                border: "1px solid rgba(0,255,255,0.18)",
                borderRadius: "12px",
                padding: "10px",
              }}
            >
              <div style={{ color: "rgba(255,255,255,0.62)", fontSize: "0.72rem" }}>
                Modified
              </div>
              <strong style={{ color: "#ffd37a" }}>
                ~{changeSummary?.lines_modified ?? 0}
              </strong>
            </div>
          </div>

          <details
            open
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: "0.82rem",
              marginBottom: "12px",
            }}
          >
            <summary>Changed files ({plannedActions.length})</summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: "18px" }}>
              {plannedActions.map((action) => (
                <li key={`file-${action.id}`}>
                  {action.new_path || action.path}{" "}
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>
                    +{action.lines_added || 0} / -{action.lines_removed || 0} / ~{action.lines_modified || 0}
                    {action.status ? ` - ${action.status}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {plannedActions.map((action) => (
              <div
                key={action.id}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${action.valid ? "rgba(255,255,255,0.12)" : "#ff8585"}`,
                  borderRadius: "14px",
                  padding: "12px",
                }}
              >
                <div
                  style={{
                    color: action.valid ? "white" : "#ff8585",
                    fontWeight: "bold",
                    marginBottom: "8px",
                  }}
                >
                  <span>{action.summary}</span>
                  {action.status && (
                    <span
                      style={{
                        color: action.status === "applied" ? "#8affc1" : "rgba(255,255,255,0.58)",
                        fontSize: "0.78rem",
                        marginLeft: "8px",
                      }}
                    >
                      {action.status}
                    </span>
                  )}
                </div>
                {action.valid && (
                  <div
                    style={{
                      color: "rgba(255,255,255,0.58)",
                      fontSize: "0.78rem",
                      marginBottom: "8px",
                    }}
                  >
                    +{action.lines_added || 0} / -{action.lines_removed || 0} / ~{action.lines_modified || 0}
                  </div>
                )}
                {action.error && (
                  <div style={{ color: "#ff8585", marginBottom: "8px" }}>
                    {action.error}
                  </div>
                )}
                <pre
                  style={{
                    background: "rgba(0,0,0,0.42)",
                    borderRadius: "10px",
                    color: "rgba(255,255,255,0.82)",
                    fontSize: "0.78rem",
                    margin: 0,
                    overflow: "auto",
                    padding: "10px",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {action.diff || "No textual diff available."}
                </pre>
                <button
                  disabled={applying || !action.valid || action.status === "applied"}
                  onClick={() => approveAction(action)}
                  style={{
                    background:
                      applying || !action.valid || action.status === "applied"
                        ? "rgba(255,255,255,0.18)"
                        : "#00ffff",
                    border: "none",
                    borderRadius: "999px",
                    color: "black",
                    cursor:
                      applying || !action.valid || action.status === "applied"
                        ? "not-allowed"
                        : "pointer",
                    fontWeight: "bold",
                    marginTop: "10px",
                    padding: "8px 12px",
                  }}
                  type="button"
                >
                  {action.status === "applied" ? "Applied" : "Approve File"}
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
            <button
              disabled={applying || hasInvalidPlannedActions}
              onClick={approvePlan}
              style={{
                background:
                  applying || hasInvalidPlannedActions ? "rgba(255,255,255,0.18)" : "#00ffff",
                border: "none",
                borderRadius: "999px",
                color: "black",
                cursor: applying || hasInvalidPlannedActions ? "not-allowed" : "pointer",
                fontWeight: "bold",
                padding: "10px 16px",
              }}
              type="button"
            >
              {applying ? "Applying..." : "Approve & Apply"}
            </button>
            <button
              disabled={applying}
              onClick={rejectPlan}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: "999px",
                color: "white",
                cursor: applying ? "not-allowed" : "pointer",
                padding: "10px 16px",
              }}
              type="button"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={sendMessage}
        style={{
          borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          padding: "14px",
        }}
      >
        {error && (
          <div style={{ color: "#ff8585", fontSize: "0.9rem" }}>
            {error}
          </div>
        )}

        <label
          style={{
            alignItems: "center",
            color: selectedProject ? "white" : "rgba(255,255,255,0.45)",
            display: "flex",
            gap: "10px",
            fontSize: "0.9rem",
          }}
        >
          <input
            checked={agentMode}
            disabled={!selectedProject || generating || applying}
            onChange={(event) => {
              setAgentMode(event.target.checked);
              if (event.target.checked) {
                setUseWorkspaceContext(true);
                setContextStatus("Workspace context ready");
              } else {
                setAutonomousMode(false);
                setAgentTask(null);
              }
              setPlannedActions([]);
              setChangeSummary(null);
              setReviewSession(null);
              setPlanMessage("");
            }}
            type="checkbox"
          />
          Agent Mode
        </label>

        {agentMode && (
          <label
            style={{
              alignItems: "center",
              color: selectedProject ? "white" : "rgba(255,255,255,0.45)",
              display: "flex",
              gap: "10px",
              fontSize: "0.9rem",
            }}
          >
            <input
              checked={autonomousMode}
              disabled={!selectedProject || generating || applying}
              onChange={(event) => {
                setAutonomousMode(event.target.checked);
                setAgentTask(null);
                setPlannedActions([]);
                setChangeSummary(null);
                setPlanMessage("");
              }}
              type="checkbox"
            />
            Autonomous Loop
          </label>
        )}

        <label
          style={{
            alignItems: "center",
            color: selectedProject ? "white" : "rgba(255,255,255,0.45)",
            display: "flex",
            gap: "10px",
            fontSize: "0.9rem",
          }}
        >
          <input
            checked={useWorkspaceContext}
            disabled={!selectedProject || generating}
            onChange={(event) => {
              setUseWorkspaceContext(event.target.checked);
              setContextFiles([]);
              setContextStatus(
                event.target.checked
                  ? "Workspace context ready"
                  : "Workspace context off"
              );
            }}
            type="checkbox"
          />
          Use Workspace Context
        </label>

        <div
          style={{
            color: "rgba(255,255,255,0.62)",
            fontSize: "0.82rem",
          }}
        >
          {contextStatus}
          {selectedProject ? ` (${selectedProject})` : ""}
        </div>

        {contextFiles.length > 0 && (
          <details
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: "0.82rem",
            }}
          >
            <summary>Files sent to AI ({contextFiles.length})</summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: "18px" }}>
              {contextFiles.map((file) => (
                <li key={file.path}>
                  {file.path}
                </li>
              ))}
            </ul>
          </details>
        )}

        <input
          placeholder="Model override, optional"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: "12px",
            color: "white",
            padding: "10px 12px",
          }}
        />

        <textarea
          placeholder="Ask for code..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={4}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: "12px",
            color: "white",
            padding: "12px",
            resize: "vertical",
          }}
        />

        <button
          disabled={generating || applying || !input.trim()}
          style={{
            background:
              generating || applying || !input.trim() ? "rgba(255,255,255,0.18)" : "#00ffff",
            border: "none",
            borderRadius: "999px",
            color: "black",
            cursor: generating || applying || !input.trim() ? "not-allowed" : "pointer",
            fontWeight: "bold",
            padding: "12px 18px",
          }}
          type="submit"
        >
          {generating ? (agentMode ? "Planning..." : "Generating...") : "Send"}
        </button>
      </form>
    </aside>
  );
}
