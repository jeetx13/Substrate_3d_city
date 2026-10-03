import logging
import math
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

from . import PipelineError

log = logging.getLogger("substrate.history")


def read_git_log(repo_dir: Path, limit: int = 400):
    cmd = ["git", "-C", str(repo_dir), "log", "-n", str(limit), "--no-renames", "--numstat", "--date=iso-strict",
           "--format=%x1e%H%x1f%an%x1f%cI%x1f%s"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, errors="replace")
    except subprocess.TimeoutExpired:
        raise PipelineError("git log timed out")
    if proc.returncode != 0:
        raise PipelineError("git log failed: " + (proc.stderr or "").strip()[-200:])
    shallow_path = repo_dir / ".git" / "shallow"
    try:
        shallow_shas = set(shallow_path.read_text(encoding="ascii").splitlines())
    except OSError:
        shallow_shas = set()

    commits = []
    for rec in proc.stdout.split("\x1e"):
        rec = rec.strip("\n")
        if not rec.strip():
            continue
        head, _, body = rec.partition("\n")
        parts = head.split("\x1f")
        if len(parts) < 4:
            continue
        sha, author, date, subject = parts[0], parts[1], parts[2], "\x1f".join(parts[3:])
        if sha in shallow_shas:
            continue
        changes = []
        for line in body.splitlines():
            cols = line.split("\t")
            if len(cols) != 3 or cols[0] == "-" or cols[1] == "-":
                continue
            try:
                changes.append((int(cols[0]), int(cols[1]), cols[2]))
            except ValueError:
                continue
        commits.append({"sha": sha, "author": author or "unknown", "date": date, "subject": subject.strip(), "changes": changes})
    commits.reverse()
    return commits


def build_history(files, commits, max_snapshots: int = 60):
    by_path = {f["path"]: f for f in files}
    n = len(commits)
    touched = defaultdict(list)
    for i, c in enumerate(commits):
        for a, d, p in c["changes"]:
            if p in by_path:
                touched[p].append((i, a, d))

    raw_churn = {}
    for f in files:
        p = f["path"]
        events = touched.get(p, [])
        authors = Counter()
        score = 0.0
        for i, a, d in events:
            recency = 0.4 + 0.6 * (i / (n - 1) if n > 1 else 1.0)
            score += (1.0 + 0.25 * math.log1p(a + d)) * recency
            authors[commits[i]["author"]] += 1
        raw_churn[p] = score
        f["top_author"] = authors.most_common(1)[0][0] if authors else "unknown"
        f["last_modified"] = commits[events[-1][0]]["date"] if events else (commits[0]["date"] if commits else "")
    max_churn = max(raw_churn.values()) if raw_churn else 0.0
    for f in files:
        f["churn_score"] = round(math.sqrt(raw_churn[f["path"]] / max_churn), 3) if max_churn > 0 else 0.0

    loc = {}
    exists = {}
    for f in files:
        p = f["path"]
        delta = sum(a - d for _, a, d in touched.get(p, []))
        initial = f["loc"] - delta
        loc[p] = max(0, initial)
        # Heuristic: if the unclamped pre-window LOC is positive the file
        # already had content before the commit window, so it exists from the
        # start.  If initial <= 0 the file was created inside the window and
        # appears at its first touching commit.
        # Limitation: a file that existed before the window but was shrunk to
        # zero within it cannot be told apart from a file created in the window.
        exists[p] = initial > 0 if p in touched else True

    snapshots = []
    if n == 0:
        return snapshots
    k = min(max_snapshots, n)
    bucket_ends = sorted({int(round((j + 1) * n / k)) - 1 for j in range(k)})
    prev_end = -1
    for end in bucket_ends:
        for i in range(prev_end + 1, end + 1):
            for a, d, p in commits[i]["changes"]:
                if p not in by_path:
                    continue
                loc[p] = max(0, loc[p] + a - d)
                exists[p] = not (a == 0 and d > 0 and loc[p] == 0)
        count = end - prev_end
        subject = commits[end]["subject"][:80]
        summary = subject if count == 1 else f"{subject} (+{count - 1} more)"
        snapshots.append({
            "commit_date": commits[end]["date"],
            "file_states": [{"file_id": f["file_id"], "exists": bool(exists[f["path"]]), "loc": int(loc[f["path"]])} for f in files],
            "commit_message_summary": summary,
        })
        prev_end = end
    return snapshots
