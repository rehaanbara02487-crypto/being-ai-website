"""Local Git operations for workspace projects."""

from pathlib import Path
import difflib
import subprocess
from datetime import datetime, timezone


class GitServiceError(RuntimeError):
    """Raised when a Git command fails."""


def run_git(project_dir: Path, args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(
        ["git", *args],
        cwd=str(project_dir),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )

    if check and result.returncode != 0:
        raise GitServiceError(result.stderr.strip() or result.stdout.strip() or "Git command failed")

    return result


def ensure_git_repo(project_dir: Path):
    if not (project_dir / ".git").exists():
        run_git(project_dir, ["init"])

    run_git(project_dir, ["config", "user.name", "BEING AI"], check=False)
    run_git(project_dir, ["config", "user.email", "being-ai@example.local"], check=False)


def has_commits(project_dir: Path) -> bool:
    result = run_git(project_dir, ["rev-parse", "--verify", "HEAD"], check=False)
    return result.returncode == 0


def current_branch(project_dir: Path) -> str:
    ensure_git_repo(project_dir)
    result = run_git(project_dir, ["branch", "--show-current"], check=False)
    branch = result.stdout.strip()
    return branch or "HEAD"


def list_branches(project_dir: Path) -> list[str]:
    ensure_git_repo(project_dir)
    result = run_git(project_dir, ["branch", "--format", "%(refname:short)"], check=False)
    return [branch for branch in result.stdout.splitlines() if branch]


def create_branch(project_dir: Path, name: str, checkout: bool = True) -> dict:
    ensure_git_repo(project_dir)

    if not name or not name.strip():
        raise GitServiceError("Branch name is required")

    args = ["checkout", "-b", name] if checkout else ["branch", name]
    run_git(project_dir, args)

    return {
        "branch": current_branch(project_dir),
        "branches": list_branches(project_dir),
    }


def switch_branch(project_dir: Path, name: str) -> dict:
    ensure_git_repo(project_dir)

    if not name or not name.strip():
        raise GitServiceError("Branch name is required")

    run_git(project_dir, ["checkout", name])

    return {
        "branch": current_branch(project_dir),
        "branches": list_branches(project_dir),
    }


def parse_porcelain_line(line: str) -> dict:
    status = line[:2]
    path = line[3:]
    original_path = None

    if " -> " in path:
        original_path, path = path.split(" -> ", 1)

    if status == "??":
        change_type = "untracked"
    elif "D" in status:
        change_type = "deleted"
    elif "A" in status:
        change_type = "added"
    elif "R" in status:
        change_type = "renamed"
    else:
        change_type = "modified"

    return {
        "path": path,
        "original_path": original_path,
        "status": status.strip(),
        "type": change_type,
    }


def status(project_dir: Path) -> dict:
    ensure_git_repo(project_dir)
    result = run_git(project_dir, ["status", "--porcelain"], check=False)
    changes = [
        parse_porcelain_line(line)
        for line in result.stdout.splitlines()
        if line
    ]

    return {
        "branch": current_branch(project_dir),
        "changes": changes,
    }


def untracked_file_diff(project_dir: Path, relative_path: str) -> str:
    file_path = project_dir / relative_path

    if not file_path.is_file():
        return ""

    content = file_path.read_text(encoding="utf-8", errors="ignore")
    return "".join(
        difflib.unified_diff(
            [],
            content.splitlines(keepends=True),
            fromfile="/dev/null",
            tofile=relative_path,
        )
    )


def diff(project_dir: Path, path: str | None = None) -> dict:
    ensure_git_repo(project_dir)

    args = ["diff", "--"]
    if path:
        args.append(path)

    result = run_git(project_dir, args, check=False)
    diff_text = result.stdout

    if path:
        file_status = next((change for change in status(project_dir)["changes"] if change["path"] == path), None)
        if file_status and file_status["type"] == "untracked":
            diff_text = untracked_file_diff(project_dir, path)
    else:
        for change in status(project_dir)["changes"]:
            if change["type"] == "untracked":
                diff_text += "\n" + untracked_file_diff(project_dir, change["path"])

    return {
        "path": path,
        "diff": diff_text,
    }


def commit(project_dir: Path, message: str, files: list[str] | None = None, create_snapshot: bool = True) -> dict:
    ensure_git_repo(project_dir)

    if not message or not message.strip():
        raise GitServiceError("Commit message is required")

    if files:
        run_git(project_dir, ["add", "--", *files])
    else:
        run_git(project_dir, ["add", "-A"])

    staged = run_git(project_dir, ["diff", "--cached", "--quiet"], check=False)
    if staged.returncode == 0:
        raise GitServiceError("No changes staged for commit")

    run_git(project_dir, ["commit", "-m", message])
    commit_hash = run_git(project_dir, ["rev-parse", "HEAD"]).stdout.strip()
    snapshot = create_snapshot_tag(project_dir) if create_snapshot else None

    return {
        "hash": commit_hash,
        "branch": current_branch(project_dir),
        "snapshot": snapshot,
    }


def history(project_dir: Path, limit: int = 30) -> list[dict]:
    ensure_git_repo(project_dir)

    if not has_commits(project_dir):
        return []

    pretty = "%H%x1f%h%x1f%an%x1f%ad%x1f%s"
    result = run_git(
        project_dir,
        ["log", f"--max-count={limit}", "--date=iso", f"--pretty=format:{pretty}"],
    )
    commits = []

    for line in result.stdout.splitlines():
        full_hash, short_hash, author, date, subject = line.split("\x1f", 4)
        commits.append({
            "hash": full_hash,
            "short_hash": short_hash,
            "author": author,
            "date": date,
            "message": subject,
        })

    return commits


def create_snapshot_tag(project_dir: Path, name: str | None = None) -> dict:
    ensure_git_repo(project_dir)

    if not has_commits(project_dir):
        raise GitServiceError("Cannot create snapshot before first commit")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    base_name = name or f"snapshot-{timestamp}"
    tag_name = base_name
    suffix = 1
    commit_hash = run_git(project_dir, ["rev-parse", "HEAD"]).stdout.strip()

    while run_git(project_dir, ["rev-parse", "--verify", f"refs/tags/{tag_name}"], check=False).returncode == 0:
        tag_name = f"{base_name}-{suffix}"
        suffix += 1

    run_git(project_dir, ["tag", tag_name, commit_hash])

    return {
        "name": tag_name,
        "hash": commit_hash,
    }


def snapshots(project_dir: Path) -> list[dict]:
    ensure_git_repo(project_dir)
    result = run_git(project_dir, ["tag", "--list", "snapshot-*"], check=False)
    snapshot_list = []

    for tag_name in result.stdout.splitlines():
        commit_hash = run_git(project_dir, ["rev-list", "-n", "1", tag_name]).stdout.strip()
        snapshot_list.append({
            "name": tag_name,
            "hash": commit_hash,
        })

    return snapshot_list


def restore(project_dir: Path, ref: str, path: str | None = None) -> dict:
    ensure_git_repo(project_dir)

    if not ref:
        raise GitServiceError("Restore ref is required")

    if path:
        run_git(project_dir, ["checkout", ref, "--", path])
        restored = path
    else:
        run_git(project_dir, ["reset", "--hard", ref])
        run_git(project_dir, ["clean", "-fd"])
        restored = "workspace"

    return {
        "status": "restored",
        "ref": ref,
        "path": restored,
        "branch": current_branch(project_dir),
    }


def revert(project_dir: Path, commit_hash: str) -> dict:
    ensure_git_repo(project_dir)

    if not commit_hash:
        raise GitServiceError("Commit hash is required")

    run_git(project_dir, ["revert", "--no-edit", commit_hash])
    new_hash = run_git(project_dir, ["rev-parse", "HEAD"]).stdout.strip()

    return {
        "status": "reverted",
        "reverted": commit_hash,
        "hash": new_hash,
        "branch": current_branch(project_dir),
    }
