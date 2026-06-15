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
import { logAgentDebug, logGeneration, extractCreatedFiles, recordGenerationStep, GENERATION_TAGS } from "../lib/agentDebug";
import { TIMEOUTS, withTimeout } from "../lib/taskTimeout";
import MarkdownMessage from "./workspace/MarkdownMessage";
import { ReviewPlanPanel } from "./workspace/ReviewActionCard";
import GenerationDiagnosticsPanel from "./workspace/GenerationDiagnosticsPanel";

function isGreenfieldPrompt(prompt, { selectedProject, workspaceKind } = {}) {
  const lowered = prompt.toLowerCase();
  const hasVerb = /\b(build|create|make|generate|scaffold|new|add|write)\b/.test(lowered);
  const hasTarget =
    /\b(app|application|project|api|website|todo|react|flask|fastapi|portfolio)\b/.test(lowered);
  const hasFileTarget = /\b[\w.-]+\.(txt|md|json|jsx?|tsx?|py|html|css|yaml|yml|csv|env)\b/i.test(
    prompt
  );
  const hasContentPhrase = /\bwith content\b/i.test(prompt);
  const inThisFolder = /\b(this folder|in here|here)\b/.test(lowered);

  if (hasVerb && (hasTarget || inThisFolder || hasFileTarget || hasContentPhrase)) {
    return true;
  }

  if (workspaceKind === "external" && selectedProject && hasVerb) {
    return true;
  }

  return false;
}

function resolveGenerationTarget({
  selectedProject,
  workspaceKind,
  greenfieldTarget,
  prompt,
}) {
  if (selectedProject && workspaceKind === "external") {
    return "in_place";
  }

  if (selectedProject && /\b(this folder|in here|here)\b/i.test(prompt)) {
    return "in_place";
  }

  if (greenfieldTarget === "current" && selectedProject) {
    return workspaceKind === "external" ? "in_place" : "current";
  }

  if (greenfieldTarget === "custom") {
    return "custom";
  }

  if (greenfieldTarget === "in_place" && selectedProject) {
    return "in_place";
  }

  return "default";
}

const DEFAULT_WELCOME = {
  id: "welcome",
  role: "assistant",
  content:
    "Ask BEING AI to build a project. Example: **Build a modern React Todo App**.\n\nGreenfield build prompts route to the project planner automatically. Enable **Agent Mode** in Settings for in-project file edits with review.",
};

export default function ChatWorkspace({
  selectedProject,
  workspaceKind = "managed",
  workspacePath = "",
  onFilesChanged,
  onProjectCreated,
  onGenerationComplete,
  onOpenFile,
  onAgentTaskChange,
  chatSettings,
  onChatSettingsChange,
  ollamaStatus,
  sessionId,
  fixPrompt,
  onFixPromptConsumed,
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
    greenfieldTarget = "default",
    greenfieldTargetPath = "",
  } = chatSettings;

  function buildOllamaErrorMessage() {
    if (!ollamaStatus) {
      return "Unable to verify Ollama status.";
    }

    const lines = [ollamaStatus.message || "Ollama is unavailable."];
    if (ollamaStatus.base_url) {
      lines.push(`Endpoint: ${ollamaStatus.base_url}`);
    }
    if (ollamaStatus.model) {
      lines.push(`Expected model: ${ollamaStatus.model}`);
    }
    if (ollamaStatus.models?.length) {
      lines.push(`Installed models: ${ollamaStatus.models.join(", ")}`);
    } else if (ollamaStatus.online) {
      lines.push("No models are installed. Run `ollama pull <model>`.");
    } else {
      lines.push("Start Ollama, then verify OLLAMA_BASE_URL in backend settings.");
    }
    return lines.join("\n");
  }

  function ollamaReady() {
    return Boolean(ollamaStatus?.online && ollamaStatus?.model_available);
  }

  useEffect(() => {
    if (!fixPrompt?.trim()) return;
    setInput(fixPrompt);
    onFixPromptConsumed?.();
    setError("");
  }, [fixPrompt, onFixPromptConsumed]);

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

  async function completeGreenfieldGeneration(plan, applyResult, assistantId) {
    const createdFiles = extractCreatedFiles(applyResult.results);
    const projectName = applyResult.project_name || selectedProject;
    const inPlace = Boolean(plan.generate_in_place || plan.greenfield_target === "in_place");

    logGeneration("files", {
      projectName,
      workspacePath: applyResult.workspace_path || plan.workspace_path || workspacePath,
      createdFiles,
      count: createdFiles.length,
    });
    recordGenerationStep(GENERATION_TAGS.generationComplete, {
      projectName,
      workspacePath: applyResult.workspace_path || plan.workspace_path || workspacePath,
      createdFiles,
      count: createdFiles.length,
    });

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: inPlace
                ? `${plan.message}\n\n**${createdFiles.length} file(s)** written to the open workspace folder.`
                : `${plan.message}\n\nProject **${projectName}** was created with **${createdFiles.length} file(s)**.`,
            }
          : message
      )
    );

    setPlannedActions([]);
    setChangeSummary(null);
    setReviewSession(null);
    setPlanMessage("");
    setProposedProjectName("");

    if (onGenerationComplete) {
      await onGenerationComplete({
        projectName,
        createdFiles,
        workspacePath: applyResult.workspace_path || plan.workspace_path || workspacePath,
        inPlace,
      });
    } else if (applyResult.is_greenfield && projectName) {
      await onProjectCreated?.(projectName);
    } else {
      onFilesChanged?.();
    }
  }

  async function sendMessage(event) {
    event.preventDefault();

    const prompt = input.trim();
    if (!prompt || generating) return;

    const greenfieldRequest = isGreenfieldPrompt(prompt, { selectedProject, workspaceKind });
    const useAgentPipeline = agentMode || greenfieldRequest;
    const generationTarget = greenfieldRequest
      ? resolveGenerationTarget({
          selectedProject,
          workspaceKind,
          greenfieldTarget,
          prompt,
        })
      : greenfieldTarget;

    recordGenerationStep(GENERATION_TAGS.chatReceived, {
      prompt,
      selectedProject: selectedProject || null,
      workspaceKind,
      workspacePath,
      agentMode,
      greenfieldRequest,
      useAgentPipeline,
      generationTarget,
    });

    if (greenfieldRequest) {
      recordGenerationStep(GENERATION_TAGS.generationDetected, {
        generationTarget,
        selectedProject,
        workspaceKind,
      });
    }

    if (greenfieldRequest && generationTarget === "custom" && !greenfieldTargetPath.trim()) {
      setError("Choose a custom target folder in Settings before generating.");
      return;
    }
    if (
      greenfieldRequest &&
      (generationTarget === "current" || generationTarget === "in_place") &&
      !selectedProject
    ) {
      setError("Open a workspace folder first, or switch generation target to Default workspace.");
      return;
    }

    if (!ollamaReady()) {
      setError(buildOllamaErrorMessage());
      return;
    }

    if (useAgentPipeline && autonomousMode && !selectedProject) {
      setError("Select a project before using Autonomous Mode.");
      return;
    }
    if (agentMode && !selectedProject && !isGreenfieldPrompt(prompt, { selectedProject, workspaceKind })) {
      setError('Use a build/create prompt (e.g. "Build a modern React Todo App") or select a project.');
      return;
    }

    logAgentDebug("incoming-prompt", {
      prompt,
      agentMode,
      greenfieldRequest,
      selectedProject: selectedProject || null,
    });

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
      useWorkspaceContext || workspaceKind === "external"
        ? `Indexing ${selectedProject || "workspace"}...`
        : "Workspace context off"
    );
    setGenerating(true);

    try {
      if (useAgentPipeline) {
        if (agentMode && autonomousMode) {
          logAgentDebug("endpoint", { endpoint: "POST /agent/tasks" });

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

        if (greenfieldRequest) {
          logGeneration("start", {
            prompt,
            target: generationTarget,
            selectedProject,
            workspaceKind,
            workspacePath,
          });
          recordGenerationStep(GENERATION_TAGS.plannerStart, {
            endpoint: "POST /agent/projects/plan",
            target: generationTarget,
            currentWorkspace: selectedProject || null,
            autoApply: true,
          });

          let plan;
          try {
            plan = await withTimeout(
              planNewProject({
                prompt,
                model: model.trim(),
                target: generationTarget,
                targetPath:
                  generationTarget === "custom" ? greenfieldTargetPath || undefined : undefined,
                currentWorkspace: selectedProject || undefined,
                autoApply: true,
              }),
              TIMEOUTS.plan,
              "Project generation"
            );
          } catch (planError) {
            logGeneration("error", {
              stage: "plan",
              message: planError.message,
            });
            recordGenerationStep(
              GENERATION_TAGS.generationFailed,
              { stage: "plan", message: planError.message },
              { level: "error", message: planError.message }
            );
            throw planError;
          }

          const previews = plan.review_session?.previews || plan.previews || [];
          const validPreviews = previews.filter((action) => action.valid);
          const invalidPreviews = previews
            .filter((action) => !action.valid)
            .map((action) => ({ path: action.path, error: action.error }));

          logGeneration("plan", {
            message: plan.message,
            proposed_project_name: plan.proposed_project_name,
            workspace_slug: plan.workspace_slug,
            workspace_path: plan.workspace_path,
            generate_in_place: plan.generate_in_place,
            preview_count: previews.length,
            valid_count: validPreviews.length,
            auto_applied: plan.auto_applied,
          });
          recordGenerationStep(GENERATION_TAGS.reviewCreated, {
            review_session_id: plan.review_session?.id || plan.review_session_id,
            preview_count: previews.length,
            valid_count: validPreviews.length,
            invalid_previews: invalidPreviews,
            workspace_path: plan.workspace_path,
            auto_applied: plan.auto_applied,
          });

          logAgentDebug("planner-result", {
            message: plan.message,
            is_greenfield: plan.is_greenfield,
            proposed_project_name: plan.proposed_project_name,
            workspace_slug: plan.workspace_slug,
            workspace_path: plan.workspace_path,
            review_session_id: plan.review_session?.id || plan.review_session_id,
            preview_count: (plan.review_session?.previews || plan.previews || []).length,
            auto_applied: plan.auto_applied,
          });

          let applyResult = plan.apply_result;

          if (!applyResult && plan.review_session?.id) {
            const validActions = validPreviews;
            if (validActions.length) {
              recordGenerationStep(GENERATION_TAGS.applyStart, {
                review_id: plan.review_session.id,
                action_count: validActions.length,
              });
              applyResult = await applyReviewActions({
                reviewId: plan.review_session.id,
                actionIds: validActions.map((action) => action.id),
              });
            } else {
              recordGenerationStep(
                GENERATION_TAGS.generationFailed,
                { stage: "apply", reason: "no valid previews", invalid_previews: invalidPreviews },
                { level: "error", message: "No valid file actions to apply." }
              );
            }
          } else if (applyResult) {
            recordGenerationStep(GENERATION_TAGS.applyStart, {
              source: "auto_apply",
              applied_count: applyResult.results?.length || 0,
            });
          }

          if (applyResult) {
            await completeGreenfieldGeneration(plan, applyResult, assistantId);
            return;
          }

          setPlanMessage(plan.message);
          setProposedProjectName(
            plan.proposed_project_name || plan.review_session?.project_name || ""
          );
          setReviewSession(plan.review_session || null);
          setPlannedActions(plan.review_session?.previews || plan.previews || []);
          setChangeSummary(plan.change_summary || null);
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

        const plan = selectedProject
          ? await planAgentFileActions({
              projectName: selectedProject,
              prompt,
              model: model.trim(),
              useWorkspaceContext: useWorkspaceContext || workspaceKind === "external",
            })
          : await planNewProject({
              prompt,
              model: model.trim(),
              target: generationTarget,
              targetPath:
                generationTarget === "custom" ? greenfieldTargetPath || undefined : undefined,
              currentWorkspace: selectedProject || undefined,
              autoApply: true,
            });

        logAgentDebug("planner-result", {
          message: plan.message,
          is_greenfield: plan.is_greenfield,
          proposed_project_name: plan.proposed_project_name,
          review_session_id: plan.review_session?.id || plan.review_session_id,
          preview_count: (plan.review_session?.previews || plan.previews || []).length,
          auto_applied: plan.auto_applied,
        });

        if (plan.auto_applied && plan.apply_result) {
          await completeGreenfieldGeneration(plan, plan.apply_result, assistantId);
          return;
        }

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

      logAgentDebug("endpoint", { endpoint: "POST /ollama/chat/stream" });
      recordGenerationStep(
        "CHAT STREAM (NOT GENERATION)",
        {
          reason: "Prompt did not match generation routing",
          agentMode,
          greenfieldRequest,
          selectedProject: selectedProject || null,
        },
        { level: "error", message: "Routed to chat stream instead of generation pipeline." }
      );

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
      logGeneration("error", {
        stage: "request",
        message: chatError.message,
      });
      recordGenerationStep(
        GENERATION_TAGS.generationFailed,
        { stage: "request", message: chatError.message },
        { level: "error", message: chatError.message }
      );
      setError(chatError.message);
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantId
            ? { ...message, content: `Generation failed:\n\n${chatError.message}` }
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

    logAgentDebug("apply-start", {
      reviewSessionId: reviewSession?.id,
      projectName,
      actionCount: validActions.length,
      actionPaths: validActions.map((action) => action.path || action.new_path || action.id),
    });

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

      logAgentDebug("apply-result", {
        message: result.message,
        is_greenfield: result.is_greenfield,
        project_name: result.project_name,
        created_files: (result.results || []).map(
          (entry) => entry.path || entry.file || entry.new_path || entry
        ),
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
        logAgentDebug("project-created", { project_name: result.project_name });
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
  const composerGreenfield = isGreenfieldPrompt(input.trim(), {
    selectedProject,
    workspaceKind,
  });

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
        <GenerationDiagnosticsPanel />

        {!selectedProject && (
          <div className="ws-greenfield-hint">
            No project selected — try: &quot;Build a modern React Todo App&quot;
          </div>
        )}

        {error && (
          <div className="ws-error-panel">
            <strong>Request failed</strong>
            <pre>{error}</pre>
          </div>
        )}

        {!ollamaReady() && ollamaStatus && (
          <div className="ws-error-panel">
            <strong>Ollama unavailable</strong>
            <pre>{buildOllamaErrorMessage()}</pre>
          </div>
        )}

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
            disabled={generating || applying || !input.trim() || !ollamaReady()}
            type="submit"
          >
            {generating
              ? composerGreenfield || agentMode
                ? "Planning…"
                : "Generating…"
              : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

export { DEFAULT_WELCOME, isGreenfieldPrompt, resolveGenerationTarget };
