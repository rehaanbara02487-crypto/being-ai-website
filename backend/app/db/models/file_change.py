"""File change audit ORM model."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAtMixin, UuidPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.plan_step import PlanStep
    from app.db.models.project import Project
    from app.db.models.run import Run


class FileChange(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "file_changes"
    __table_args__ = (
        CheckConstraint(
            "action IN ('create', 'edit', 'delete')",
            name="ck_file_changes_action",
        ),
        Index("idx_file_changes_run", "run_id"),
        Index("idx_file_changes_project", "project_id", "file_path"),
    )

    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    plan_step_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("plan_steps.id", ondelete="SET NULL"),
        nullable=True,
    )
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    diff: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent: Mapped[str] = mapped_column(String(32), nullable=False)

    run: Mapped[Run] = relationship(back_populates="file_changes")
    project: Mapped[Project] = relationship(back_populates="file_changes")
    plan_step: Mapped[PlanStep | None] = relationship(back_populates="file_changes")
