import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "beingai.chatSessions.v2";

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function defaultWelcome() {
  return {
    id: "welcome",
    role: "assistant",
    content:
      "Ask BEING AI to build, refactor, or explain this workspace. Repository intelligence and indexing are active when a folder is open.",
  };
}

export function useChatSessions(workspaceSlug = "") {
  const [store, setStore] = useState(readStore);
  const [activeSessionId, setActiveSessionId] = useState(null);

  const sessions = useMemo(
    () => (workspaceSlug ? store[workspaceSlug] || [] : []),
    [store, workspaceSlug]
  );

  useEffect(() => {
    writeStore(store);
  }, [store]);

  useEffect(() => {
    setActiveSessionId(null);
  }, [workspaceSlug]);

  const updateWorkspaceSessions = useCallback(
    (updater) => {
      if (!workspaceSlug) return;
      setStore((current) => ({
        ...current,
        [workspaceSlug]: updater(current[workspaceSlug] || []),
      }));
    },
    [workspaceSlug]
  );

  const createSession = useCallback(
    (title = "New Chat") => {
      if (!workspaceSlug) return null;
      const session = {
        id: `chat-${Date.now()}`,
        title,
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [defaultWelcome()],
      };
      updateWorkspaceSessions((current) => [session, ...current]);
      setActiveSessionId(session.id);
      return session.id;
    },
    [updateWorkspaceSessions, workspaceSlug]
  );

  const updateSession = useCallback(
    (sessionId, patch) => {
      updateWorkspaceSessions((current) =>
        current.map((session) =>
          session.id === sessionId
            ? { ...session, ...patch, updatedAt: new Date().toISOString() }
            : session
        )
      );
    },
    [updateWorkspaceSessions]
  );

  const renameSession = useCallback(
    (sessionId, title) => {
      if (!title.trim()) return;
      updateSession(sessionId, { title: title.trim() });
    },
    [updateSession]
  );

  const pinSession = useCallback(
    (sessionId, pinned = true) => {
      updateSession(sessionId, { pinned });
      updateWorkspaceSessions((current) => {
        const target = current.find((session) => session.id === sessionId);
        const rest = current.filter((session) => session.id !== sessionId);
        return pinned && target ? [target, ...rest] : current;
      });
    },
    [updateSession, updateWorkspaceSessions]
  );

  const deleteSession = useCallback(
    (sessionId) => {
      updateWorkspaceSessions((current) => current.filter((session) => session.id !== sessionId));
      setActiveSessionId((current) => (current === sessionId ? null : current));
    },
    [updateWorkspaceSessions]
  );

  const exportSessionMarkdown = useCallback(
    (sessionId) => {
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) return "";

      const lines = [`# ${session.title}`, "", `Workspace: ${workspaceSlug}`, ""];
      for (const message of session.messages || []) {
        lines.push(`## ${message.role === "user" ? "You" : "BEING AI"}`);
        lines.push("");
        lines.push(message.content || "");
        lines.push("");
      }
      return lines.join("\n");
    },
    [sessions, workspaceSlug]
  );

  const downloadSessionMarkdown = useCallback(
    (sessionId) => {
      const markdown = exportSessionMarkdown(sessionId);
      if (!markdown) return;
      const session = sessions.find((item) => item.id === sessionId);
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(session?.title || "chat").replace(/[^\w.-]+/g, "-")}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    [exportSessionMarkdown, sessions]
  );

  const searchSessions = useCallback(
    (query) => {
      const lowered = query.trim().toLowerCase();
      if (!lowered) return sessions;
      return sessions.filter((session) => {
        if (session.title.toLowerCase().includes(lowered)) return true;
        return (session.messages || []).some((message) =>
          (message.content || "").toLowerCase().includes(lowered)
        );
      });
    },
    [sessions]
  );

  const getActiveSession = useCallback(() => {
    if (!activeSessionId) return null;
    return sessions.find((session) => session.id === activeSessionId) || null;
  }, [activeSessionId, sessions]);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }, [sessions]);

  return {
    sessions: sortedSessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    updateSession,
    renameSession,
    pinSession,
    deleteSession,
    exportSessionMarkdown,
    downloadSessionMarkdown,
    searchSessions,
    getActiveSession,
  };
}
