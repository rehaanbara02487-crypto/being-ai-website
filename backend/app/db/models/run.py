"""Agent run ORM model."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import RunStatus
from app.db.base import Base, UuidPrimaryKeyMixin, utcnow

if TYPE_CHECKING:
    from app.db.models.command import CommandExecuted
    from app.db.models.error import ErrorRecord
    from app.db.models.file_change import FileChange
    from app.db.models.git_operation import GitOperation
    from app.db.models.message import Message
    from app.db.models.plan import Plan
    from app.db.models.project import Project
    from app.db.models.run_event import RunEvent
    from app.db.models.session import ChatSession


class Run(UuidPrimaryKeyMixin, Base):
    __tablename__ = "runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'success', 'failed', 'cancelled')",
            name="ck_runs_status",
        ),
        Index("idx_runs_session", "session_id"),
        Index("idx_runs_status", "status"),
    )

    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    trigger_message_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=RunStatus.RUNNING.value,
        server_default=RunStatus.RUNNING.value,
    )
    current_agent: Mapped[str | None] = mapped_column(String(32), nullable=True)
    current_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    graph_state: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    session: Mapped[ChatSession] = relationship(back_populates="runs")
    project: Mapped[Project] = relationship(back_populates="runs")
    trigger_message: Mapped[Message | None] = relationship(back_populates="triggered_runs")
    events: Mapped[list[RunEvent]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="RunEvent.seq",
    )
    plan: Mapped[Plan | None] = relationship(
        back_populates="run",
        uselist=False,
        cascade="all, delete-orphan",
    )
    file_changes: Mapped[list[FileChange]] = relationship(back_populates="run")
    commands: Mapped[list[CommandExecuted]] = relationship(back_populates="run")
    errors: Mapped[list[ErrorRecord]] = relationship(back_populates="run")
    git_operations: Mapped[list[GitOperation]] = relationship(back_populates="run")
