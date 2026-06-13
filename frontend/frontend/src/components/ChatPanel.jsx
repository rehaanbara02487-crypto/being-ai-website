import { useEffect, useRef, useState } from "react";

import {
  applyAgentFileActions,
  planAgentFileActions,
  streamOllamaChat,
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
  const [plannedActions, setPlannedActions] = useState([]);
  const [planMessage, setPlanMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, generating]);

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
    setPlanMessage("");
    setContextFiles([]);
    setContextStatus(
      useWorkspaceContext
        ? `Indexing ${selectedProject || "workspace"}...`
        : "Workspace context off"
    );
    setGenerating(true);

    try {
      if (agentMode) {
        const plan = await planAgentFileActions({
          projectName: selectedProject,
          prompt,
          model: model.trim(),
          useWorkspaceContext,
        });

        setPlanMessage(plan.message);
        setPlannedActions(plan.previews || []);

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
      const result = await applyAgentFileActions({
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
      setPlanMessage("");
      onFilesChanged?.();
    } catch (applyError) {
      setError(applyError.message);
    } finally {
      setApplying(false);
    }
  }

  function rejectPlan() {
    setPlannedActions([]);
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
                  {action.summary}
                </div>
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
              }
              setPlannedActions([]);
              setPlanMessage("");
            }}
            type="checkbox"
          />
          Agent Mode
        </label>

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
