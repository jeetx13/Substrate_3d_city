import importlib.util
import json
import os
from pathlib import Path
import sys

import pytest

from pipeline import run
from pipeline.history import build_history


# ---------------------------------------------------------------------------
# History regression tests (git-free hand-built fixtures)
# ---------------------------------------------------------------------------

def test_history_pre_window_file():
    """A file that existed before the commit window and is first modified in
    commit 3 appears with exists=True in every snapshot, with its reconstructed
    pre-window loc. (Regression test for Fix 3)."""
    # 5 commits (0, 1, 2, 3, 4)
    # File "pre_existing.py" has final loc=50.
    # In commit 3, it gained 10 lines (delta = +10).
    # Pre-window loc = 50 - 10 = 40 (> 0).
    files = [
        {"path": "pre_existing.py", "loc": 50, "file_id": "f_pre"},
    ]
    commits = [
        {"sha": "c0", "author": "dev", "date": "2026-01-01T00:00:00Z", "subject": "init other", "changes": [(5, 0, "other.py")]},
        {"sha": "c1", "author": "dev", "date": "2026-01-02T00:00:00Z", "subject": "update other", "changes": [(2, 0, "other.py")]},
        {"sha": "c2", "author": "dev", "date": "2026-01-03T00:00:00Z", "subject": "more other", "changes": [(3, 0, "other.py")]},
        {"sha": "c3", "author": "dev", "date": "2026-01-04T00:00:00Z", "subject": "touch pre", "changes": [(10, 0, "pre_existing.py")]},
        {"sha": "c4", "author": "dev", "date": "2026-01-05T00:00:00Z", "subject": "final other", "changes": [(1, 0, "other.py")]},
    ]

    snapshots = build_history(files, commits, max_snapshots=5)
    assert len(snapshots) == 5

    # In every snapshot, pre_existing.py must have exists=True
    for i, snap in enumerate(snapshots):
        state = next(s for s in snap["file_states"] if s["file_id"] == "f_pre")
        assert state["exists"] is True, f"Snapshot {i} should show pre-window file as existing"
        if i < 3:
            # Before commit 3, loc is reconstructed pre-window loc
            assert state["loc"] == 40
        else:
            # From commit 3 onwards, loc is updated
            assert state["loc"] == 50


def test_history_created_in_window_file():
    """A file created inside the window is absent (exists=False) before its
    creating commit and present (exists=True) from then on."""
    # File "created.py" final loc = 20.
    # Created in commit 2 with 20 added lines (initial = 20 - 20 = 0).
    files = [
        {"path": "created.py", "loc": 20, "file_id": "f_created"},
    ]
    commits = [
        {"sha": "c0", "author": "dev", "date": "2026-01-01T00:00:00Z", "subject": "c0", "changes": [(5, 0, "other.py")]},
        {"sha": "c1", "author": "dev", "date": "2026-01-02T00:00:00Z", "subject": "c1", "changes": [(2, 0, "other.py")]},
        {"sha": "c2", "author": "dev", "date": "2026-01-03T00:00:00Z", "subject": "create file", "changes": [(20, 0, "created.py")]},
        {"sha": "c3", "author": "dev", "date": "2026-01-04T00:00:00Z", "subject": "c3", "changes": [(1, 0, "other.py")]},
    ]

    snapshots = build_history(files, commits, max_snapshots=4)
    assert len(snapshots) == 4

    # Snapshots 0 and 1 (commits 0, 1): file does not exist yet
    for i in (0, 1):
        state = next(s for s in snapshots[i]["file_states"] if s["file_id"] == "f_created")
        assert state["exists"] is False, f"Snapshot {i} should show created file as not existing"
        assert state["loc"] == 0

    # Snapshots 2 and 3 (commits 2, 3): file exists
    for i in (2, 3):
        state = next(s for s in snapshots[i]["file_states"] if s["file_id"] == "f_created")
        assert state["exists"] is True, f"Snapshot {i} should show created file as existing"
        assert state["loc"] == 20


def test_history_untouched_file():
    """A file untouched during the commit window exists=True in every snapshot."""
    files = [
        {"path": "untouched.py", "loc": 35, "file_id": "f_untouched"},
    ]
    commits = [
        {"sha": "c0", "author": "dev", "date": "2026-01-01T00:00:00Z", "subject": "c0", "changes": [(1, 0, "other.py")]},
        {"sha": "c1", "author": "dev", "date": "2026-01-02T00:00:00Z", "subject": "c1", "changes": [(2, 0, "other.py")]},
    ]

    snapshots = build_history(files, commits, max_snapshots=2)
    assert len(snapshots) == 2
    for snap in snapshots:
        state = next(s for s in snap["file_states"] if s["file_id"] == "f_untouched")
        assert state["exists"] is True
        assert state["loc"] == 35


def test_history_contract():
    """Every snapshot has exactly the keys commit_date, file_states, commit_message_summary,
    and each file state has file_id, exists, loc, with one state per file."""
    files = [
        {"path": "a.py", "loc": 10, "file_id": "fa"},
        {"path": "b.py", "loc": 20, "file_id": "fb"},
    ]
    commits = [
        {"sha": "c0", "author": "alice", "date": "2026-01-01T12:00:00Z", "subject": "initial commit", "changes": [(10, 0, "a.py"), (20, 0, "b.py")]},
        {"sha": "c1", "author": "bob", "date": "2026-01-02T12:00:00Z", "subject": "update a", "changes": [(5, 2, "a.py")]},
    ]

    snapshots = build_history(files, commits, max_snapshots=10)
    assert len(snapshots) == 2

    expected_snap_keys = {"commit_date", "file_states", "commit_message_summary"}
    expected_state_keys = {"file_id", "exists", "loc"}

    for snap in snapshots:
        assert set(snap.keys()) == expected_snap_keys
        assert isinstance(snap["commit_date"], str)
        assert isinstance(snap["commit_message_summary"], str)
        assert len(snap["file_states"]) == len(files)

        for state in snap["file_states"]:
            assert set(state.keys()) == expected_state_keys
            assert isinstance(state["file_id"], str)
            assert isinstance(state["exists"], bool)
            assert isinstance(state["loc"], int)


# ---------------------------------------------------------------------------
# Hero bake tool tests
# ---------------------------------------------------------------------------

def test_bake_import_safety(monkeypatch):
    """Importing tools/bake_hero.py does not modify run.COMMIT_DEPTH or
    run.scan_files until configure() is called."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    tools_bake = repo_root / "tools" / "bake_hero.py"

    orig_depth = run.COMMIT_DEPTH
    orig_scan = run.scan_files

    if str(repo_root) not in sys.path:
        monkeypatch.syspath_prepend(str(repo_root))

    spec = importlib.util.spec_from_file_location("tools.bake_hero_isolated", tools_bake)
    bake_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bake_mod)

    # Before configure(): run module must remain unmodified
    assert run.COMMIT_DEPTH == orig_depth
    assert run.scan_files == orig_scan

    # After configure(): run module is configured
    try:
        bake_mod.configure()
        assert run.COMMIT_DEPTH == 1500
        assert run.SNAPSHOTS == 60
        assert run.scan_files == bake_mod.scan_files_excluding_generated
    finally:
        # Restore original state to prevent side effects
        run.COMMIT_DEPTH = orig_depth
        run.scan_files = orig_scan


def test_bake_exclusion(tmp_path):
    """With a tmp_path tree containing rich/_unicode_data/unicode9-0-0.py,
    rich/_unicode_data/__init__.py, and ordinary files, the filtered scan drops
    only the unicode*.py tables, keeps __init__.py and ordinary files, and returns
    a consistent (files, total, capped) 3-tuple."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    from tools.bake_hero import scan_files_excluding_generated

    # Set up directory structure
    unicode_dir = tmp_path / "rich" / "_unicode_data"
    unicode_dir.mkdir(parents=True)

    (unicode_dir / "unicode9-0-0.py").write_text("TABLE = [1, 2, 3]\n", encoding="utf-8")
    (unicode_dir / "unicode10-0-0.py").write_text("TABLE = [4, 5, 6]\n", encoding="utf-8")
    (unicode_dir / "__init__.py").write_text("# init\n", encoding="utf-8")

    (tmp_path / "rich" / "console.py").write_text("class Console: pass\n", encoding="utf-8")
    (tmp_path / "rich" / "text.py").write_text("class Text: pass\n", encoding="utf-8")
    (tmp_path / "setup.py").write_text("# setup\n", encoding="utf-8")

    # Full scan without capping (cap=100)
    files, total, capped = scan_files_excluding_generated(tmp_path, cap=100)
    paths = [f["path"] for f in files]

    # Dropped unicode*.py
    assert not any("unicode9-0-0.py" in p for p in paths)
    assert not any("unicode10-0-0.py" in p for p in paths)

    # Kept __init__.py and regular files
    assert any("__init__.py" in p for p in paths)
    assert any("console.py" in p for p in paths)
    assert any("text.py" in p for p in paths)
    assert any("setup.py" in p for p in paths)

    assert total == 4
    assert len(files) == 4
    assert capped is False

    # Now test with cap smaller than number of files
    capped_files, total_capped, was_capped = scan_files_excluding_generated(tmp_path, cap=2)
    assert total_capped == 4
    assert was_capped is True
    assert len(capped_files) == 2


def test_bake_progress_and_main(tmp_path, monkeypatch):
    """run_pipeline is invoked with all four arguments (url, slug, work_dir, progress),
    and main() writes the JSON file and exits cleanly with small fake result."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    if str(repo_root) not in sys.path:
        monkeypatch.syspath_prepend(str(repo_root))
    from tools import bake_hero

    calls = []

    def fake_run_pipeline(url, slug, work_dir, progress):
        calls.append({
            "url": url,
            "slug": slug,
            "work_dir": work_dir,
            "progress": progress,
        })
        progress("test_stage", "testing progress")
        return {
            "files": [{"path": "main.py", "loc": 10, "file_id": "f1"}],
            "edges": [],
            "snapshots": [
                {
                    "commit_date": "2026-01-01T00:00:00Z",
                    "file_states": [{"file_id": "f1", "exists": True, "loc": 10}],
                    "commit_message_summary": "initial",
                }
            ],
            "meta": {},
        }

    monkeypatch.setattr(run, "run_pipeline", fake_run_pipeline)
    monkeypatch.setattr(bake_hero.run, "run_pipeline", fake_run_pipeline)

    out_file = tmp_path / "output.json"
    bake_hero.main(out_path=out_file)

    assert len(calls) == 1
    call = calls[0]
    assert call["url"] == "https://github.com/Textualize/rich.git"
    assert call["slug"] == "Textualize/rich"
    assert isinstance(call["work_dir"], Path)
    assert callable(call["progress"])

    assert out_file.exists()
    saved = json.loads(out_file.read_text(encoding="utf-8"))
    assert saved["files"][0]["path"] == "main.py"
    assert "meta" in saved
    assert "head_sha" in saved["meta"]


def test_size_validation_oversized(tmp_path):
    """serialize_and_check exits with status 1 on oversized payload."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    from tools.bake_hero import serialize_and_check

    # Create payload that compresses to > 300 KB
    big_data = {"data": os.urandom(400_000).hex()}

    out_file = tmp_path / "oversized.json"
    with pytest.raises(SystemExit) as exc_info:
        serialize_and_check(big_data, out_path=out_file)
    assert exc_info.value.code == 1


def test_size_validation_valid(tmp_path):
    """serialize_and_check succeeds and writes compact JSON for valid payload."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    from tools.bake_hero import serialize_and_check

    small_data = {"files": [], "edges": [], "snapshots": []}
    out_file = tmp_path / "valid.json"
    raw_bytes, gz_bytes = serialize_and_check(small_data, out_path=out_file)

    assert out_file.exists()
    content = out_file.read_text(encoding="utf-8")
    assert content == '{"files":[],"edges":[],"snapshots":[]}'
    assert raw_bytes == len(content.encode("utf-8"))
    assert gz_bytes < 300 * 1024
