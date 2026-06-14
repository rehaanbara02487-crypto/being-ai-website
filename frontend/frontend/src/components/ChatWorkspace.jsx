import { useEffect, useRef, useState } from "react";

import {
  applyAgentFileActions,
  applyReviewActions,
  getAutonomousAgentTask,
  planAgentFileActions,
  planNewProject,
  rejectReview,
  streamOllamaChat,
  startAutonomousAgentTask,
  stopAutonomousAgentTask,
} from "../lib/api";
import MarkdownMessage from "./workspace/MarkdownMessage";
import { ReviewPlanPanel } from "./workspace/ReviewActionCard";

function isGreenfieldPrompt(prompt) {
  const lowered = prompt.toLowerCase();
  return (
    /\b(build|create|make|generate|scaffold|new)\b/.test(lowered) &&
    /\b(app|application|project|api|website|todo|react|flask|fastapi)\b/.test(lowered)
  );
}

const DEFAULT_WELCOME = {
  id: "welcome",
  role: "assistant",
  content:
    "Ask BEING AI to build a project. Example: **Build a modern React Todo App**.\n\nEnable **Agent Mode** in Settings to scaffold greenfield projects or review file changes before applying.",
};

export default function ChatWorkspace({
  selectedProject,
  onFilesChanged,
  onProjectCreated,
  onOpenFile,
  onAgentTaskChange,
  chatSettings,
  onChatSettingsChange,
  sessionId,
  initialMessages,
  onMessagesChange,
  onSessionTitleChange,
}) {
  const [messages, setMessages] = useState(initialMessages || [DEFAULT_WELCOME]);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [contextStatus, setContextStatus] = useState("Workspace context off");
  const [contextFiles, setContextFiles] = useState([]);
  const [agentTask, setAgentTask] = useState(null);
  const [reviewSession, setReviewSession] = useState(null);
  const [plannedActions, setPlannedActions] = useState([]);
  const [changeSummary, setChangeSummary] = useState(null);
  const [planMessage, setPlanMessage] = useState("");
  const [proposedProjectName, setProposedProjectName] = useState("");
  const [applying, setApplying] = useState(false);
  const messagesRef = useRef(null);
  const taskPollRef = useRef(null);

  const {
    agentMode,
    autonomousMode,
    useWorkspaceContext,
    model,
  } = chatSettings;

  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages);
    }
  }, [sessionId, initialMessages]);

  useEffect(() => {
    onMessagesChange?.(messages);
    const firstUser = messages.find((message) => message.role === "user");
    if (firstUser?.content) {
      onSessionTitleChange?.(firstUser.content.slice(0, 48));
    }
  }, [messages, onMessagesChange, onSessionTitleChange]);

  useEffect(() => {
    onAgentTaskChange?.(agentTask);
  }, [agentTask, onAgentTaskChange]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, generating, plannedActions, agentTask]);

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
    if (agentMode && autonomousMode && !selectedProject) {
      setError("Select a project before using Autonomous Mode.");
      return;
    }
    if (agentMode && !selectedProject && !isGreenfieldPrompt(prompt)) {
      setError('Use a build/create prompt (e.g. "Build a modern React Todo App") or select a project.');
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
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setInput("");
    setError("");
    setPlannedActions([]);
    setChangeSummary(null);
    setReviewSession(null);
    setPlanMessage("");
    setProposedProjectName("");
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
                    content:
                      "Autonomous agent started. Follow progress in the sidebar **Agent Tasks** panel.",
                  }
                : message
            )
          );
          pollTask(task.id, assistantId);
          return;
        }

        const plan = selectedProject
          ? await planAgentFileActions({
              projectName: selectedProject,
              prompt,
              model: model.trim(),
              useWorkspaceContext,
            })
          : await planNewProject({
              prompt,
              model: model.trim(),
            });

        setPlanMessage(plan.message);
        setProposedProjectName(plan.proposed_project_name || plan.review_session?.project_name || "");
        setReviewSession(plan.review_session || null);
        setPlannedActions(plan.review_session?.previews || plan.previews || []);
        setChangeSummary(plan.change_summary || null);

        if (plan.context) {
          setContextStatus(plan.context.status);
          setContextFiles(plan.context.files || []);
        }

        const projectLabel = plan.proposed_project_name || selectedProject;
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: `${plan.message}\n\n${
                    plan.is_greenfield
                      ? `New project **${projectLabel}** is ready for review. Approve to create it in the workspace.`
                      : "Review the planned file changes below before applying."
                  }`,
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
                  ? { ...message, content: message.content + payload.content }
                  : message
              )
            );
          }

          if (payload.type === "error") {
            setError(payload.message);
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantId
                  ? { ...message, content: payload.message }
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
            ? { ...message, content: chatError.message }
            : message
        )
      );
    } finally {
      setGenerating(false);
    }
  }

  async function approvePlan() {
    const validActions = plannedActions.filter((action) => action.valid);
    const projectName =
      selectedProject || reviewSession?.project_name || proposedProjectName;
    if (!projectName || !validActions.length) return;

    setApplying(true);
    setError("");

    try {
      const result = reviewSession?.id
        ? await applyReviewActions({
            reviewId: reviewSession.id,
            actionIds: validActions.map((action) => action.id),
          })
        : await applyAgentFileActions({
            projectName,
            actions: validActions.map((action) => ({
              tool: action.tool,
              args: action.args,
            })),
            prompt: planMessage,
          });

      setMessages((currentMessages) => [
        ...currentMessages,
        { id: `assistant-applied-${Date.now()}`, role: "assistant", content: result.message },
      ]);
      setPlannedActions([]);
      setChangeSummary(null);
      setReviewSession(null);
      setPlanMessage("");
      setProposedProjectName("");

      if (result.is_greenfield && result.project_name) {
        await onProjectCreated?.(result.project_name);
      } else {
        onFilesChanged?.();
      }
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
    const projectName =
      selectedProject || reviewSession?.project_name || proposedProjectName;
    if (!projectName || !action.valid) return;

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
          projectName,
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
        { id: `assistant-applied-${Date.now()}`, role: "assistant", content: result.message },
      ]);
      if (result.is_greenfield && result.project_name) {
        await onProjectCreated?.(result.project_name);
      } else {
        onFilesChanged?.();
      }
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
    <div className="ws-chat-workspace">
      <div ref={messagesRef} className="ws-chat-thread">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`ws-message ${message.role === "user" ? "ws-message-user" : "ws-message-assistant"}`}
          >
            <div className="ws-message-label">
              {message.role === "user" ? "You" : "BEING AI"}
            </div>
            <div className="ws-message-bubble">
              <MarkdownMessage
                content={message.content}
                isStreaming={generating && message.role === "assistant" && !message.content}
              />
            </div>
          </div>
        ))}

        {agentTask && (
          <div className="ws-message ws-message-assistant">
            <div className="ws-message-label">Agent Activity</div>
            <div className="ws-message-bubble">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                <div>
                  <div>
                    <strong>Status:</strong> {agentTask.status}
                  </div>
                  <div>
                    <strong>Step:</strong> {agentTask.current_step}
                  </div>
                  <div>
                    Iteration {agentTask.iteration} / {agentTask.max_iterations}
                  </div>
                </div>
                <button
                  className="ws-btn ws-btn-danger"
                  disabled={!["queued", "running", "stopping"].includes(agentTask.status)}
                  onClick={stopAutonomousTask}
                  type="button"
                >
                  Stop Agent
                </button>
              </div>
              {(agentTask.events || []).slice(-5).map((event, index) => (
                <div
                  key={`${event.timestamp}-${index}`}
                  style={{
                    borderLeft: "2px solid var(--ws-accent)",
                    fontSize: "0.82rem",
                    marginTop: "8px",
                    paddingLeft: "10px",
                  }}
                >
                  {event.message}
                </div>
              ))}
            </div>
          </div>
        )}

        <ReviewPlanPanel
          applying={applying}
          changeSummary={changeSummary}
          hasInvalidPlannedActions={hasInvalidPlannedActions}
          onApproveAction={approveAction}
          onApprovePlan={approvePlan}
          onOpenFile={onOpenFile}
          onRejectPlan={rejectPlan}
          plannedActions={plannedActions}
        />
      </div>

      <form className="ws-composer" onSubmit={sendMessage}>
        {!selectedProject && (
          <div className="ws-greenfield-hint">
            No project selected — try Agent Mode with: &quot;Build a modern React Todo App&quot;
          </div>
        )}

        {error && <div style={{ color: "var(--ws-error)", fontSize: "0.85rem", marginBottom: "8px" }}>{error}</div>}

        <div className="ws-composer-toolbar">
          <span>
            {agentMode ? "Agent Mode" : "Chat"}
            {agentMode && autonomousMode ? " · Autonomous" : ""}
          </span>
          <span>{contextStatus}{selectedProject ? ` (${selectedProject})` : ""}</span>
          {contextFiles.length > 0 && <span>{contextFiles.length} context files</span>}
        </div>

        <textarea
          className="ws-composer-input"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              sendMessage(event);
            }
          }}
          placeholder="Ask BEING AI to build, refactor, or explain code… (Ctrl+Enter to send)"
          rows={4}
          value={input}
        />

        <div className="ws-composer-actions">
          <button
            className="ws-btn ws-btn-primary"
            disabled={generating || applying || !input.trim()}
            type="submit"
          >
            {generating ? (agentMode ? "Planning..." : "Generating...") : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

export { DEFAULT_WELCOME, isGreenfieldPrompt };
