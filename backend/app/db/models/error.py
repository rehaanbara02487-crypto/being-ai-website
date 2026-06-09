"""Captured error ORM model."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAtMixin, UuidPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.command import CommandExecuted
    from app.db.models.run import Run


class ErrorRecord(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "errors"
    __table_args__ = (Index("idx_errors_run", "run_id"),)

    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    command_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("commands_executed.id", ondelete="SET NULL"),
        nullable=True,
    )
    error_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    stack_trace: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_files: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    fix_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    run: Mapped[Run] = relationship(back_populates="errors")
    command: Mapped[CommandExecuted | None] = relationship(back_populates="errors")
