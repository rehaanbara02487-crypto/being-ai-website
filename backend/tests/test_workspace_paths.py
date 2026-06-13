"""Tests for workspace path sandboxing."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.workspace_paths import (
    PathEscapeError,
    resolve_path_in_project_dir,
    resolve_project_dir,
    resolve_workspace_path,
)


@pytest.fixture
def workspace_env(tmp_path, monkeypatch):
    workspace = tmp_path / "workspaces"
    workspace.mkdir()
    project = workspace / "demo"
    project.mkdir()
    (project / "hello.txt").write_text("hello")
    (project / "nested").mkdir()
    (project / "nested" / "file.txt").write_text("nested")

    monkeypatch.setenv("BEINGAI_WORKSPACE_ROOT", str(workspace))
    get_settings.cache_clear()
    yield workspace, project
    get_settings.cache_clear()


class TestResolveWorkspacePath:
    def test_valid_relative_path(self, workspace_env):
        path = resolve_workspace_path("demo", "hello.txt", must_exist=True)
        assert path.name == "hello.txt"
        assert path.read_text(encoding="utf-8") == "hello"

    def test_nested_valid_path(self, workspace_env):
        path = resolve_workspace_path("demo", "nested/file.txt", must_exist=True)
        assert path.read_text(encoding="utf-8") == "nested"

    def test_unix_traversal_blocked(self, workspace_env):
        with pytest.raises(HTTPException) as exc:
            resolve_workspace_path("demo", "../../etc/passwd")
        assert exc.value.status_code == 403

    def test_windows_traversal_blocked(self, workspace_env):
        with pytest.raises(HTTPException) as exc:
            resolve_workspace_path("demo", "..\\..\\windows\\system32")
        assert exc.value.status_code == 403

    def test_absolute_path_blocked(self, workspace_env):
        absolute = "/etc/passwd" if sys.platform != "win32" else "C:\\Windows\\System32\\config\\sam"
        with pytest.raises(HTTPException) as exc:
            resolve_workspace_path("demo", absolute)
        assert exc.value.status_code == 403

    def test_project_name_traversal_blocked(self, workspace_env):
        with pytest.raises(HTTPException) as exc:
            resolve_workspace_path("../outside", "hello.txt")
        assert exc.value.status_code == 403

    def test_project_name_absolute_blocked(self, workspace_env, tmp_path):
        outside = tmp_path / "outside"
        outside.mkdir()
        with pytest.raises(HTTPException) as exc:
            resolve_workspace_path(str(outside), "hello.txt")
        assert exc.value.status_code == 403

    def test_missing_path_returns_404(self, workspace_env):
        with pytest.raises(HTTPException) as exc:
            resolve_workspace_path("demo", "missing.txt", must_exist=True)
        assert exc.value.status_code == 404

    def test_symlink_escape_blocked(self, workspace_env, tmp_path):
        workspace, project = workspace_env
        outside = tmp_path / "outside"
        outside.mkdir()
        secret = outside / "secret.txt"
        secret.write_text("secret")

        link_dir = project / "escape"
        try:
            if os.name == "nt":
                os.symlink(str(outside), str(link_dir), target_is_directory=True)
            else:
                link_dir.symlink_to(outside, target_is_directory=True)
        except (OSError, NotImplementedError):
            pytest.skip("symlinks not supported in this environment")

        with pytest.raises(HTTPException) as exc:
            resolve_workspace_path("demo", "escape/secret.txt", must_exist=True)
        assert exc.value.status_code == 403


class TestResolveProjectDir:
    def test_valid_project(self, workspace_env):
        project_dir = resolve_project_dir("demo")
        assert project_dir.name == "demo"

    def test_missing_project_404(self, workspace_env):
        with pytest.raises(HTTPException) as exc:
            resolve_project_dir("missing")
        assert exc.value.status_code == 404


class TestResolvePathInProjectDir:
    def test_traversal_raises_path_escape(self, workspace_env, tmp_path):
        _, project = workspace_env
        with pytest.raises(PathEscapeError):
            resolve_path_in_project_dir(project, "../../etc/passwd")


class TestWorkspacePathHttpEndpoints:
    @pytest.fixture
    def client(self, workspace_env):
        return TestClient(app)

    def test_read_file_traversal_returns_403(self, client):
        response = client.get("/projects/demo/file", params={"path": "../../etc/passwd"})
        assert response.status_code == 403

    def test_read_file_valid_returns_200(self, client):
        response = client.get("/projects/demo/file", params={"path": "hello.txt"})
        assert response.status_code == 200
        assert response.json()["content"] == "hello"

    def test_edit_file_traversal_returns_403(self, client):
        response = client.post(
            "/edit-file",
            json={
                "project_name": "demo",
                "filename": "..\\..\\outside.txt",
                "content": "evil",
            },
        )
        assert response.status_code == 403

    def test_project_name_traversal_list_returns_403(self, client):
        response = client.get("/projects/..%2F..%2Fetc/passwd")
        assert response.status_code == 403

    def test_create_file_traversal_returns_403(self, client):
        response = client.post(
            "/projects/demo/file",
            json={"path": "../../outside.txt", "content": "evil"},
        )
        assert response.status_code == 403

    def test_delete_path_traversal_returns_403(self, client):
        response = client.delete(
            "/projects/demo/path",
            params={"path": "../../outside.txt"},
        )
        assert response.status_code == 403
