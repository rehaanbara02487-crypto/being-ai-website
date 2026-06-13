import { useEffect, useRef, useState } from "react";

import { streamOllamaChat } from "../lib/api";

export default function ChatPanel({ selectedProject }) {
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
    setContextFiles([]);
    setContextStatus(
      useWorkspaceContext
        ? `Indexing ${selectedProject || "workspace"}...`
        : "Workspace context off"
    );
    setGenerating(true);

    try {
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
          disabled={generating || !input.trim()}
          style={{
            background: generating || !input.trim() ? "rgba(255,255,255,0.18)" : "#00ffff",
            border: "none",
            borderRadius: "999px",
            color: "black",
            cursor: generating || !input.trim() ? "not-allowed" : "pointer",
            fontWeight: "bold",
            padding: "12px 18px",
          }}
          type="submit"
        >
          {generating ? "Generating..." : "Send"}
        </button>
      </form>
    </aside>
  );
}
