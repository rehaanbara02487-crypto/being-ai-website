"""Project ORM model."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, CheckConstraint, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ProjectStatus
from app.db.base import Base, TimestampMixin, UuidPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.architecture_decision import ArchitectureDecision
    from app.db.models.file_change import FileChange
    from app.db.models.git_operation import GitOperation
    from app.db.models.memory import MemoryEntry
    from app.db.models.plan import Plan
    from app.db.models.run import Run
    from app.db.models.session import ChatSession


class Project(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'archived', 'failed')",
            name="ck_projects_status",
        ),
        Index("idx_projects_slug", "slug"),
        Index("idx_projects_status", "status"),
    )

    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    workspace_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    tech_stack: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=ProjectStatus.ACTIVE.value,
        server_default=ProjectStatus.ACTIVE.value,
    )
    github_repo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    sessions: Mapped[list[ChatSession]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    runs: Mapped[list[Run]] = relationship(back_populates="project")
    plans: Mapped[list[Plan]] = relationship(back_populates="project")
    file_changes: Mapped[list[FileChange]] = relationship(back_populates="project")
    git_operations: Mapped[list[GitOperation]] = relationship(back_populates="project")
    memory_entries: Mapped[list[MemoryEntry]] = relationship(back_populates="project")
    architecture_decisions: Mapped[list[ArchitectureDecision]] = relationship(
        back_populates="project",
    )
