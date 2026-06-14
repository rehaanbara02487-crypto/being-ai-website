import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "beingai.chatSessions";

function readSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function useChatSessions() {
  const [sessions, setSessions] = useState(readSessions);
  const [activeSessionId, setActiveSessionId] = useState(null);

  useEffect(() => {
    writeSessions(sessions);
  }, [sessions]);

  const createSession = useCallback((title = "New Chat") => {
    const session = {
      id: `chat-${Date.now()}`,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: "welcome",
          role: "assistant",
          content:
            "Ask BEING AI to build a project. Example: **Build a modern React Todo App**.",
        },
      ],
    };
    setSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    return session.id;
  }, []);

  const updateSession = useCallback((sessionId, patch) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId
          ? { ...session, ...patch, updatedAt: new Date().toISOString() }
          : session
      )
    );
  }, []);

  const deleteSession = useCallback((sessionId) => {
    setSessions((current) => current.filter((session) => session.id !== sessionId));
    setActiveSessionId((current) => (current === sessionId ? null : current));
  }, []);

  const getActiveSession = useCallback(() => {
    if (!activeSessionId) return null;
    return sessions.find((session) => session.id === activeSessionId) || null;
  }, [activeSessionId, sessions]);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    updateSession,
    deleteSession,
    getActiveSession,
  };
}
