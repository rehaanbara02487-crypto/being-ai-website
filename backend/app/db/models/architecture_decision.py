"""Architecture decision record (ADR) ORM model."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AdrStatus
from app.db.base import Base, CreatedAtMixin, UuidPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.plan import Plan
    from app.db.models.project import Project


class ArchitectureDecision(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "architecture_decisions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('proposed', 'accepted', 'superseded')",
            name="ck_architecture_decisions_status",
        ),
        Index("idx_adr_project", "project_id"),
    )

    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    plan_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("plans.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    context: Mapped[str] = mapped_column(Text, nullable=False)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    consequences: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=AdrStatus.ACCEPTED.value,
        server_default=AdrStatus.ACCEPTED.value,
    )

    project: Mapped[Project] = relationship(back_populates="architecture_decisions")
    plan: Mapped[Plan | None] = relationship(back_populates="architecture_decisions")
