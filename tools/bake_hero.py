#!/usr/bin/env python3
"""
Hero bake tool: generates static graph and history data for Textualize/rich.
Writes output to frontend/src/data/hero-rich.json.
"""

from datetime import datetime, timezone
import gzip
import inspect
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

# 1) Add repository root to sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# 2) Import backend.pipeline.run
from backend.pipeline import run

# 3) Set runtime limits
run.COMMIT_DEPTH = 1500
run.SNAPSHOTS = 60


# 4) Helper to detect generated unicode tables in rich/_unicode_data
def is_generated_unicode_file(f):
    if isinstance(f, dict):
        p = f.get("path", "")
    elif hasattr(f, "path"):
        p = getattr(f, "path", "")
    elif isinstance(f, (list, tuple)) and len(f) > 0 and isinstance(f[0], str):
        p = f[0]
    else:
        p = str(f)

    norm = p.replace("\\", "/").strip("/")
    if "rich/_unicode_data" in norm:
        filename = norm.split("/")[-1]
        if filename.startswith("unicode") and filename.endswith(".py") and filename != "__init__.py":
            return True
    return False


# Wrap run.scan_files so it drops unicode*.py inside rich/_unicode_data and preserves shape
orig_scan_files = run.scan_files


def wrapped_scan_files(*args, **kwargs):
    result = orig_scan_files(*args, **kwargs)
    if isinstance(result, tuple) and len(result) == 3:
        files, total, capped = result
        filtered_files = [f for f in files if not is_generated_unicode_file(f)]
        dropped = len(files) - len(filtered_files)
        new_total = max(0, total - dropped)
        cap = kwargs.get("cap", getattr(run, "FILE_CAP", 1500))
        new_capped = new_total > cap
        return (filtered_files, new_total, new_capped)
    elif isinstance(result, dict):
        files = result.get("files", [])
        total = result.get("total", len(files))
        capped = result.get("capped", False)
        filtered_files = [f for f in files if not is_generated_unicode_file(f)]
        dropped = len(files) - len(filtered_files)
        new_total = max(0, total - dropped)
        cap = kwargs.get("cap", getattr(run, "FILE_CAP", 1500))
        new_capped = new_total > cap
        res = dict(result)
        res["files"] = filtered_files
        res["total"] = new_total
        res["capped"] = new_capped
        return res
    return result


run.scan_files = wrapped_scan_files


def count_snapshot_buildings(snapshot):
    states = snapshot.get("file_states") or snapshot.get("buildings") or []
    if isinstance(states, dict):
        return len(states)
    count = 0
    for s in states:
        if isinstance(s, dict):
            if s.get("exists") and (s.get("loc", 1) > 0):
                count += 1
            elif s.get("exists") is True:
                count += 1
        else:
            count += 1
    return count


def compute_gzipped_size(data):
    json_bytes = json.dumps(data, separators=(",", ":")).encode("utf-8")
    return len(gzip.compress(json_bytes, compresslevel=9))


def main():
    target_url = "https://github.com/Textualize/rich.git"
    slug = "Textualize/rich"

    with tempfile.TemporaryDirectory() as temp_dir:
        work_dir = Path(temp_dir)

        # 5) Run pipeline into temp work dir
        sig = inspect.signature(run.run_pipeline)
        param_names = list(sig.parameters.keys())
        kwargs = {}
        args = []
        if len(param_names) >= 1:
            args.append(target_url)
        if len(param_names) >= 2:
            args.append(slug)
        if "work_dir" in param_names:
            kwargs["work_dir"] = str(work_dir)
        elif len(param_names) >= 3 and param_names[2] in ("work_dir", "dest", "dest_dir", "repo_dir", "tmp_dir"):
            args.append(str(work_dir))

        if inspect.iscoroutinefunction(run.run_pipeline):
            import asyncio
            result = asyncio.run(run.run_pipeline(*args, **kwargs))
        else:
            result = run.run_pipeline(*args, **kwargs)

        # 6) Read HEAD sha from the clone
        head_sha = None
        for candidate in [work_dir / "repo", work_dir / "rich", work_dir]:
            if (candidate / ".git").exists():
                try:
                    head_sha = subprocess.check_output(
                        ["git", "rev-parse", "HEAD"], cwd=str(candidate)
                    ).decode("utf-8").strip()
                    break
                except Exception:
                    pass

        if not head_sha:
            for git_dir in work_dir.glob("**/.git"):
                if git_dir.is_dir():
                    try:
                        head_sha = subprocess.check_output(
                            ["git", "rev-parse", "HEAD"], cwd=str(git_dir.parent)
                        ).decode("utf-8").strip()
                        break
                    except Exception:
                        pass

        if not head_sha:
            try:
                out = subprocess.check_output(["git", "ls-remote", target_url, "HEAD"]).decode("utf-8")
                head_sha = out.split()[0].strip()
            except Exception:
                head_sha = "unknown"

    # Set metadata
    if isinstance(result, dict):
        meta = result.setdefault("meta", {})
        meta["head_sha"] = head_sha
        meta["analyzed_at"] = datetime.now(timezone.utc).isoformat()

    snapshots = result.get("snapshots", []) if isinstance(result, dict) else []
    files = result.get("files", []) if isinstance(result, dict) else []
    edges = result.get("edges", []) if isinstance(result, dict) else []

    file_count = len(files)
    edge_count = len(edges)
    snapshot_count = len(snapshots)
    first_snap_buildings = count_snapshot_buildings(snapshots[0]) if snapshots else 0
    last_snap_buildings = count_snapshot_buildings(snapshots[-1]) if snapshots else 0

    # 7) Check gzipped size and compact if > ~300 KB
    gzipped_size = compute_gzipped_size(result)
    if gzipped_size > 300 * 1024:
        print(f"Gzipped size ({gzipped_size / 1024:.2f} KB) exceeds ~300 KB. Compacting snapshot encoding...")
        for snap in snapshots:
            if "file_states" in snap and isinstance(snap["file_states"], list):
                snap["file_states"] = [
                    s for s in snap["file_states"]
                    if isinstance(s, dict) and s.get("exists")
                ]
        gzipped_size = compute_gzipped_size(result)
        print(f"Compacted snapshot encoding; new gzipped size: {gzipped_size / 1024:.2f} KB")

    # 8) Write frontend/src/data/hero-rich.json
    out_path = REPO_ROOT / "frontend" / "src" / "data" / "hero-rich.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    # 9) Print summary metrics
    print(f"file_count: {file_count}")
    print(f"edge_count: {edge_count}")
    print(f"snapshot_count: {snapshot_count}")
    print(f"first_snapshot_building_count: {first_snap_buildings}")
    print(f"last_snapshot_building_count: {last_snap_buildings}")
    print(f"gzipped_size: {gzipped_size / 1024:.2f} KB ({gzipped_size} bytes)")


if __name__ == "__main__":
    main()
