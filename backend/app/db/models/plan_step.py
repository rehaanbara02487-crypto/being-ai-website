"""Plan step ORM model."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import PlanStepStatus
from app.db.base import Base, UuidPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.command import CommandExecuted
    from app.db.models.file_change import FileChange
    from app.db.models.plan import Plan


class PlanStep(UuidPrimaryKeyMixin, Base):
    __tablename__ = "plan_steps"
    __table_args__ = (
        CheckConstraint(
            "step_type IN ('scaffold', 'file', 'command', 'verify', 'git')",
            name="ck_plan_steps_step_type",
        ),
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'complete', 'failed', 'skipped')",
            name="ck_plan_steps_status",
        ),
        Index("idx_plan_steps_plan", "plan_id", "step_order"),
    )

    plan_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    step_type: Mapped[str] = mapped_column(String(20), nullable=False)
    files_spec: Mapped[list[Any] | None] = mapped_column(JSON, nullable=True)
    commands: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    success_criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    depends_on: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=PlanStepStatus.PENDING.value,
        server_default=PlanStepStatus.PENDING.value,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    plan: Mapped[Plan] = relationship(back_populates="steps")
    file_changes: Mapped[list[FileChange]] = relationship(back_populates="plan_step")
    commands_executed: Mapped[list[CommandExecuted]] = relationship(back_populates="plan_step")
