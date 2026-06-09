"""Shared enumerations mirrored by database CHECK constraints."""

from enum import StrEnum


class ProjectStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    FAILED = "failed"


class SessionStatus(StrEnum):
    OPEN = "open"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class RunStatus(StrEnum):
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PlanStatus(StrEnum):
    DRAFT = "draft"
    APPROVED = "approved"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"


class PlanStepType(StrEnum):
    SCAFFOLD = "scaffold"
    FILE = "file"
    COMMAND = "command"
    VERIFY = "verify"
    GIT = "git"


class PlanStepStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"
    FAILED = "failed"
    SKIPPED = "skipped"


class FileChangeAction(StrEnum):
    CREATE = "create"
    EDIT = "edit"
    DELETE = "delete"


class GitOperationType(StrEnum):
    INIT = "init"
    ADD = "add"
    COMMIT = "commit"
    PUSH = "push"
    CREATE_REPO = "create_repo"


class MemoryType(StrEnum):
    ARCHITECTURE = "architecture"
    CONVENTION = "convention"
    DEPENDENCY = "dependency"
    FAILURE = "failure"
    PREFERENCE = "preference"


class AdrStatus(StrEnum):
    PROPOSED = "proposed"
    ACCEPTED = "accepted"
    SUPERSEDED = "superseded"


class EventType(StrEnum):
    AGENT_START = "agent_start"
    AGENT_THOUGHT = "agent_thought"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    PLAN_UPDATED = "plan_updated"
    FILE_CHANGED = "file_changed"
    TERMINAL_OUTPUT = "terminal_output"
    ERROR = "error"
    RUN_COMPLETE = "run_complete"
    HEARTBEAT = "heartbeat"
