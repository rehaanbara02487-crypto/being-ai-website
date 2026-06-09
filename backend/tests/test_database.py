"""Database layer integration tests."""

from __future__ import annotations

from app.core.enums import (
    MessageRole,
    PlanStatus,
    PlanStepStatus,
    PlanStepType,
    ProjectStatus,
    RunStatus,
    SessionStatus,
)
from app.db.database import (
    check_database_connection,
    create_all_tables,
    dispose_database,
    init_database,
    session_scope,
)
from app.db.models import (
    ChatSession,
    CommandExecuted,
    ErrorRecord,
    FileChange,
    GitOperation,
    MemoryEntry,
    Message,
    Plan,
    PlanStep,
    Project,
    Run,
    RunEvent,
    Setting,
)


def test_init_database_and_connection(test_settings):
    init_database(test_settings)
    assert check_database_connection() is True
    dispose_database()


def test_create_all_tables(db_session):
    project = Project(
        slug="expense-tracker",
        name="Expense Tracker",
        workspace_path="/tmp/expense-tracker",
        status=ProjectStatus.ACTIVE.value,
    )
    db_session.add(project)
    db_session.flush()

    session = ChatSession(project_id=project.id, title="Build v1")
    db_session.add(session)
    db_session.flush()

    message = Message(
        session_id=session.id,
        role=MessageRole.USER.value,
        content="Build a Flutter expense tracker",
    )
    db_session.add(message)
    db_session.flush()

    run = Run(
        session_id=session.id,
        project_id=project.id,
        trigger_message_id=message.id,
        status=RunStatus.RUNNING.value,
    )
    db_session.add(run)
    db_session.flush()

    event = RunEvent(
        run_id=run.id,
        seq=1,
        event_type="heartbeat",
        payload={"type": "heartbeat"},
    )
    plan = Plan(
        run_id=run.id,
        project_id=project.id,
        title="Flutter Expense Tracker",
        status=PlanStatus.DRAFT.value,
    )
    db_session.add_all([event, plan])
    db_session.flush()

    step = PlanStep(
        plan_id=plan.id,
        step_order=1,
        title="Scaffold",
        step_type=PlanStepType.SCAFFOLD.value,
        status=PlanStepStatus.PENDING.value,
    )
    db_session.add(step)
    db_session.flush()

    file_change = FileChange(
        run_id=run.id,
        project_id=project.id,
        plan_step_id=step.id,
        file_path="lib/main.dart",
        action="create",
        agent="coder",
    )
    command = CommandExecuted(
        run_id=run.id,
        plan_step_id=step.id,
        command="flutter create .",
        cwd=project.workspace_path,
        exit_code=0,
    )
    db_session.add_all([file_change, command])
    db_session.flush()

    error = ErrorRecord(
        run_id=run.id,
        command_id=command.id,
        message="sample error",
        resolved=False,
    )
    git_op = GitOperation(
        run_id=run.id,
        project_id=project.id,
        operation="init",
        success=True,
    )
    memory = MemoryEntry(
        project_id=project.id,
        memory_type="architecture",
        key="state_management",
        content="Provider",
        source_run_id=run.id,
    )
    setting = Setting(key="test_feature_flag", value="true")
    db_session.add_all([error, git_op, memory, setting])

    db_session.commit()

    loaded = db_session.get(Project, project.id)
    assert loaded is not None
    assert loaded.slug == "expense-tracker"
    assert len(loaded.sessions) == 1
    assert loaded.sessions[0].messages[0].content.startswith("Build")
    assert loaded.runs[0].events[0].seq == 1
    assert loaded.runs[0].plan.steps[0].title == "Scaffold"


def test_cascade_delete_project(db_session):
    project = Project(
        slug="cascade-test",
        name="Cascade",
        workspace_path="/tmp/cascade",
    )
    db_session.add(project)
    db_session.flush()

    chat_session = ChatSession(project_id=project.id)
    db_session.add(chat_session)
    db_session.flush()

    message = Message(session_id=chat_session.id, role="user", content="hi")
    db_session.add(message)
    db_session.commit()

    db_session.delete(project)
    db_session.commit()

    assert db_session.get(ChatSession, chat_session.id) is None
    assert db_session.get(Message, message.id) is None


def test_session_scope_commits(test_settings, tmp_path):
    init_database(test_settings)
    create_all_tables()
    slug = f"scope-test-{tmp_path.name}"

    with session_scope() as session:
        session.add(
            Project(
                slug=slug,
                name="Scope",
                workspace_path=str(tmp_path / "scope"),
            )
        )

    from sqlalchemy import select

    with session_scope() as session:
        project = session.execute(
            select(Project).where(Project.slug == slug)
        ).scalar_one()
        assert project.name == "Scope"

    dispose_database()


def test_message_metadata_column_name(db_session):
    project = Project(slug="meta", name="Meta", workspace_path="/tmp/meta")
    db_session.add(project)
    db_session.flush()
    chat_session = ChatSession(project_id=project.id)
    db_session.add(chat_session)
    db_session.flush()

    message = Message(
        session_id=chat_session.id,
        role=MessageRole.USER.value,
        content="test",
        message_metadata={"tokens": 10},
    )
    db_session.add(message)
    db_session.commit()

    assert message.message_metadata == {"tokens": 10}
