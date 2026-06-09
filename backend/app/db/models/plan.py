"""Implementation plan ORM model."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import PlanStatus
from app.db.base import Base, CreatedAtMixin, UuidPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.architecture_decision import ArchitectureDecision
    from app.db.models.plan_step import PlanStep
    from app.db.models.project import Project
    from app.db.models.run import Run


class Plan(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "plans"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'approved', 'in_progress', 'complete')",
            name="ck_plans_status",
        ),
        Index("idx_plans_run", "run_id"),
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
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    architecture_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tech_stack: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    folder_structure: Mapped[list[Any] | None] = mapped_column(JSON, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=PlanStatus.DRAFT.value,
        server_default=PlanStatus.DRAFT.value,
    )

    run: Mapped[Run] = relationship(back_populates="plan")
    project: Mapped[Project] = relationship(back_populates="plans")
    steps: Mapped[list[PlanStep]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="PlanStep.step_order",
    )
    architecture_decisions: Mapped[list[ArchitectureDecision]] = relationship(
        back_populates="plan",
    )
