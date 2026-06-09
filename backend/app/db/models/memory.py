"""Long-term memory ORM model."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UuidPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.project import Project
    from app.db.models.run import Run


class MemoryEntry(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "memory_entries"
    __table_args__ = (
        CheckConstraint(
            "memory_type IN ('architecture', 'convention', 'dependency', 'failure', 'preference')",
            name="ck_memory_entries_memory_type",
        ),
        CheckConstraint(
            "importance BETWEEN 1 AND 10",
            name="ck_memory_entries_importance",
        ),
        Index("idx_memory_project", "project_id"),
        Index("idx_memory_type", "memory_type"),
        Index("idx_memory_key", "key"),
    )

    project_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )
    memory_type: Mapped[str] = mapped_column(String(32), nullable=False)
    key: Mapped[str] = mapped_column(String(256), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_run_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("runs.id", ondelete="SET NULL"),
        nullable=True,
    )
    importance: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=5,
        server_default="5",
    )

    project: Mapped[Project | None] = relationship(back_populates="memory_entries")
    source_run: Mapped[Run | None] = relationship()
