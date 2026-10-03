#!/usr/bin/env python3
"""
Hero bake tool: generates static graph and history data for Textualize/rich.
Writes output to frontend/src/data/hero-rich.json.
"""

from datetime import datetime, timezone
import gzip
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

# Add repository root to sys.path so `from backend.pipeline import run` works
# when the script is run from the repo root as `python tools/bake_hero.py`.
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# When running under pytest from backend/, `pipeline.run` may already be in sys.modules.
# Ensure `backend.pipeline.run` maps to `pipeline.run` so both names refer to the same module.
if "pipeline.run" in sys.modules and "backend.pipeline.run" not in sys.modules:
    import types
    if "backend" not in sys.modules:
        backend_pkg = types.ModuleType("backend")
        backend_pkg.__path__ = [str(REPO_ROOT / "backend")]
        sys.modules["backend"] = backend_pkg
    if "backend.pipeline" not in sys.modules:
        sys.modules["backend.pipeline"] = sys.modules["pipeline"]
    sys.modules["backend.pipeline.run"] = sys.modules["pipeline.run"]

from backend.pipeline import run

# Default output path (overridable for testing).
OUTPUT_PATH = REPO_ROOT / "frontend" / "src" / "data" / "hero-rich.json"

# Gzip size threshold in bytes (~300 KB).
MAX_GZIP_BYTES = 300 * 1024


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_generated_unicode_file(path_str: str) -> bool:
    """Return True for generated unicode table files inside rich/_unicode_data."""
    norm = path_str.replace("\\", "/").strip("/")
    if "rich/_unicode_data" not in norm:
        return False
    filename = norm.split("/")[-1]
    return filename.startswith("unicode") and filename.endswith(".py") and filename != "__init__.py"


_orig_scan_files = run.scan_files


def scan_files_excluding_generated(repo_dir, cap=None, **kwargs):
    """Wrapper around the real scan_files that drops Rich's generated unicode
    tables, then re-applies the cap so that ``total`` and ``capped`` stay
    consistent with the filtered list.  Preserves the depth-then-path ordering
    and the 3-tuple return shape ``(files, total, capped)``."""
    # Call original with a very large cap so we see all files.
    files, _total, _capped = _orig_scan_files(repo_dir, cap=999_999)

    # Drop generated unicode tables.
    filtered = [f for f in files if not _is_generated_unicode_file(f["path"])]

    total = len(filtered)
    if cap is None:
        cap = kwargs.get("cap", getattr(run, "FILE_CAP", 1500))
    capped = total > cap
    selected = filtered[:cap]
    return selected, total, capped


def count_snapshot_buildings(snapshot):
    """Count file_states where ``exists`` is true."""
    states = snapshot.get("file_states") or snapshot.get("buildings") or []
    return sum(1 for s in states if isinstance(s, dict) and s.get("exists"))


def compute_gzipped_size(data):
    json_bytes = json.dumps(data, separators=(",", ":")).encode("utf-8")
    return len(gzip.compress(json_bytes, compresslevel=9))


def serialize_and_check(result, out_path=None):
    """Write *result* as compact JSON, print raw + gzip sizes.

    Returns ``(raw_bytes, gzip_bytes)``.  Exits with status 1 when the gzip
    size exceeds ``MAX_GZIP_BYTES``.
    """
    if out_path is None:
        out_path = OUTPUT_PATH
    else:
        out_path = Path(out_path)

    compact = json.dumps(result, separators=(",", ":"))
    raw_bytes = len(compact.encode("utf-8"))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(compact)

    gz_bytes = len(gzip.compress(compact.encode("utf-8"), compresslevel=9))
    print(f"raw_bytes: {raw_bytes}  gzip_bytes: {gz_bytes}")

    if gz_bytes > MAX_GZIP_BYTES:
        print(
            f"ERROR: gzip size ({gz_bytes / 1024:.1f} KB) exceeds "
            f"{MAX_GZIP_BYTES / 1024:.0f} KB threshold.",
            file=sys.stderr,
        )
        sys.exit(1)

    return raw_bytes, gz_bytes


# ---------------------------------------------------------------------------
# Configuration (no module-level side effects)
# ---------------------------------------------------------------------------

def configure():
    """Apply hero-specific overrides.  Kept out of module level so that
    importing bake_hero does not mutate ``run``."""
    run.COMMIT_DEPTH = 1500
    run.SNAPSHOTS = 60
    run.scan_files = scan_files_excluding_generated


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(out_path=None):
    if out_path is None:
        out_path = OUTPUT_PATH
    else:
        out_path = Path(out_path)

    configure()

    target_url = "https://github.com/Textualize/rich.git"
    slug = "Textualize/rich"

    def progress(stage, message):
        print(f"[{stage}] {message}")

    with tempfile.TemporaryDirectory() as temp_dir:
        work_dir = Path(temp_dir)

        result = run.run_pipeline(target_url, slug, work_dir, progress)

        # Read HEAD sha from the clone (lives at work_dir/repo).
        head_sha = None
        repo_clone = work_dir / "repo"
        try:
            head_sha = subprocess.check_output(
                ["git", "-C", str(repo_clone), "rev-parse", "HEAD"],
            ).decode("utf-8").strip()
        except Exception:
            pass

        # Single fallback: git ls-remote.
        if not head_sha:
            try:
                out = subprocess.check_output(
                    ["git", "ls-remote", target_url, "HEAD"],
                ).decode("utf-8")
                head_sha = out.split()[0].strip()
            except Exception:
                head_sha = "unknown"

    # Set metadata.
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

    # Compact snapshot encoding: drop non-existent file_states.
    gzipped_size = compute_gzipped_size(result)
    if gzipped_size > MAX_GZIP_BYTES:
        print(f"Gzipped size ({gzipped_size / 1024:.2f} KB) exceeds threshold. Compacting snapshots...")
        for snap in snapshots:
            if "file_states" in snap and isinstance(snap["file_states"], list):
                snap["file_states"] = [
                    s for s in snap["file_states"]
                    if isinstance(s, dict) and s.get("exists")
                ]

    # Write output and validate size.
    raw_bytes, gz_bytes = serialize_and_check(result, out_path)

    # Print summary metrics.
    print(f"file_count: {file_count}")
    print(f"edge_count: {edge_count}")
    print(f"snapshot_count: {snapshot_count}")
    print(f"first_snapshot_building_count: {first_snap_buildings}")
    print(f"last_snapshot_building_count: {last_snap_buildings}")
    print(f"gzipped_size: {gz_bytes / 1024:.2f} KB ({gz_bytes} bytes)")


if __name__ == "__main__":
    main()
