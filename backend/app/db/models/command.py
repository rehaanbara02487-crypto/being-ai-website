"""Executed shell command ORM model."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAtMixin, UuidPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.error import ErrorRecord
    from app.db.models.plan_step import PlanStep
    from app.db.models.run import Run


class CommandExecuted(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "commands_executed"
    __table_args__ = (Index("idx_commands_run", "run_id"),)

    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    plan_step_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("plan_steps.id", ondelete="SET NULL"),
        nullable=True,
    )
    command: Mapped[str] = mapped_column(Text, nullable=False)
    cwd: Mapped[str] = mapped_column(String(1024), nullable=False)
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stdout: Mapped[str | None] = mapped_column(Text, nullable=True)
    stderr: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    agent: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="terminal",
        server_default="terminal",
    )

    run: Mapped[Run] = relationship(back_populates="commands")
    plan_step: Mapped[PlanStep | None] = relationship(back_populates="commands_executed")
    errors: Mapped[list[ErrorRecord]] = relationship(back_populates="command")
