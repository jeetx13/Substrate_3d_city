import os
import subprocess
from pathlib import Path

import pytest

from pipeline import PipelineError
from pipeline.clone import check_repo_size
from pipeline.history import read_git_log
from pipeline.scan import scan_files


def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


@pytest.fixture
def shallow_history_repo(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "--quiet")
    _git(repo, "config", "user.name", "Fixture Author")
    _git(repo, "config", "user.email", "fixture@example.com")

    for i in range(8):
        (repo / f"file_{i}.py").write_text(f"value = {i}\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "--quiet", "-m", "wide boundary commit")
    boundary_sha = _git(repo, "rev-parse", "HEAD")

    for i in range(6):
        (repo / "file_0.py").write_text(f"value = {i + 10}\n", encoding="utf-8")
        _git(repo, "add", "file_0.py")
        _git(repo, "commit", "--quiet", "-m", f"small change {i}")

    (repo / ".git" / "shallow").write_text(boundary_sha + "\n", encoding="ascii")
    return repo


def test_shallow_boundary_does_not_create_mass_add_commit(shallow_history_repo):
    commits = read_git_log(shallow_history_repo, limit=400)
    changes_per_commit = [len(commit["changes"]) for commit in commits]
    median_changes = sorted(changes_per_commit)[len(changes_per_commit) // 2]

    assert all(commit["sha"] != (shallow_history_repo / ".git" / "shallow").read_text().strip()
               for commit in commits)
    assert len(commits) <= 400
    assert max(changes_per_commit) <= 3 * median_changes


def test_scan_skips_symlinked_source_file(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    source = tmp_path / "outside.py"
    source.write_text("print('outside')\n", encoding="utf-8")
    link = repo / "linked.py"
    try:
        link.symlink_to(source)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks are unavailable on this platform")

    files, total, _ = scan_files(repo)

    assert total == 0
    assert files == []


def test_github_size_guard_rejects_large_repository(monkeypatch):
    class Response:
        status_code = 200
        headers = {}

        @staticmethod
        def json():
            return {"size": 500_001}

    monkeypatch.setattr("pipeline.clone.httpx.get", lambda *args, **kwargs: Response())
    with pytest.raises(PipelineError, match="too large to build a city"):
        check_repo_size("owner/repo")


def test_github_size_guard_proceeds_when_api_fails(monkeypatch):
    def fail(*args, **kwargs):
        raise RuntimeError("temporary failure")

    monkeypatch.setattr("pipeline.clone.httpx.get", fail)
    check_repo_size("owner/repo")


def test_analyze_ip_rate_limit_uses_forwarded_client(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "substrate_test")
    import server
    from starlette.requests import Request

    server._rate_limit_hits.clear()
    request = Request({
        "type": "http",
        "headers": [(b"x-forwarded-for", b"203.0.113.10, 10.0.0.1")],
        "client": ("10.0.0.1", 1234),
    })
    ip = server._client_ip(request)
    assert ip == "203.0.113.10"
    assert [server._check_rate_limit(ip, now=1000 + i) for i in range(6)] == [True] * 5 + [False]
