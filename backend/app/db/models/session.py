"""Chat session ORM model."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import SessionStatus
from app.db.base import Base, TimestampMixin, UuidPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.message import Message
    from app.db.models.project import Project
    from app.db.models.run import Run


class ChatSession(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'running', 'completed', 'failed', 'cancelled')",
            name="ck_sessions_status",
        ),
        Index("idx_sessions_project", "project_id"),
    )

    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str | None] = mapped_column(String(256), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=SessionStatus.OPEN.value,
        server_default=SessionStatus.OPEN.value,
    )

    project: Mapped[Project] = relationship(back_populates="sessions")
    messages: Mapped[list[Message]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )
    runs: Mapped[list[Run]] = relationship(back_populates="session")
