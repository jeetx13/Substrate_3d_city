import os
import re
import subprocess
from pathlib import Path

import httpx

from . import PipelineError

GITHUB_RE = re.compile(
    r"^(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?(?:/.*)?/?$"
)
SHORT_RE = re.compile(r"^([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?$")


def normalize_repo_url(raw: str):
    raw = (raw or "").strip()
    m = GITHUB_RE.match(raw) or SHORT_RE.match(raw)
    if not m:
        raise ValueError("Enter a public GitHub repository, for example github.com/owner/repo")
    owner, repo = m.group(1), m.group(2)
    slug = f"{owner}/{repo}"
    return f"https://github.com/{slug}.git", slug


def clone_repo(url: str, dest: Path, depth: int = 400, timeout: int = 240):
    dest.parent.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "echo"}
    cmd = ["git", "clone", "--quiet", "--depth", str(depth), "--single-branch", "--no-tags", url, str(dest)]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        raise PipelineError("git clone timed out after %d seconds" % timeout)
    if proc.returncode != 0:
        err = (proc.stderr or "").strip().splitlines()
        msg = err[-1] if err else "unknown git error"
        if "not found" in msg.lower() or "could not read" in msg.lower() or "authentication" in msg.lower():
            msg = "Repository not found or not public"
        raise PipelineError(f"git clone failed: {msg}")


def check_repo_size(slug: str, timeout: float = 8.0):
    """Reject very large repositories; API errors and rate limits are non-blocking."""
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = httpx.get(f"https://api.github.com/repos/{slug}", headers=headers, timeout=timeout)
        if response.status_code == 403 and response.headers.get("X-RateLimit-Remaining") == "0":
            return
        if response.status_code != 200:
            return
        size_kb = response.json().get("size")
        if isinstance(size_kb, (int, float)) and size_kb > 500_000:
            raise PipelineError(
                f"Repository is too large to build a city (GitHub reports {size_kb:,} KB; limit is 500,000 KB)."
            )
    except PipelineError:
        raise
    except Exception:
        return
