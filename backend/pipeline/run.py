import logging
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from . import PipelineError
from .clone import check_repo_size, clone_repo
from .history import build_history, read_git_log
from .js_imports import parse_js_imports
from .layout import compute_layout
from .py_imports import parse_python_imports
from .scan import scan_files

log = logging.getLogger("substrate.pipeline")

FILE_CAP = 1500
COMMIT_DEPTH = 400
SNAPSHOTS = 60


def run_pipeline(url: str, slug: str, work_dir: Path, progress):
    repo_dir = work_dir / "repo"
    check_repo_size(slug)
    if repo_dir.exists():
        shutil.rmtree(repo_dir, ignore_errors=True)

    progress("clone", f"Cloning {slug}, recent history only")
    clone_repo(url, repo_dir, depth=COMMIT_DEPTH + 50)

    files, total, capped = scan_files(repo_dir, cap=FILE_CAP)
    if not files:
        raise PipelineError("No Python, JavaScript or TypeScript files found in this repository")
    langs = Counter(f["language"] for f in files)
    msg = f"Scanned {total:,} source files"
    if capped:
        msg += f", building the first {len(files):,}"
    progress("scan", msg)

    py_edges, py_stats = parse_python_imports(files)
    if py_stats["parsed"]:
        progress("parse", f"Parsed {py_stats['parsed']:,} Python files with ast" + (f", {py_stats['errors']} unparsable" if py_stats["errors"] else ""))
    js_edges, js_stats, n_pkgs, n_tsconfigs = parse_js_imports(files, repo_dir)
    if js_stats["parsed"]:
        extra = []
        if n_pkgs > 1:
            extra.append(f"{n_pkgs} package roots")
        if n_tsconfigs:
            extra.append(f"{n_tsconfigs} path alias configs")
        progress("parse", f"Parsed {js_stats['parsed']:,} JS/TS files" + (", " + ", ".join(extra) if extra else ""))

    edges = {}
    for src in (py_edges, js_edges):
        for k, e in src.items():
            if k in edges:
                edges[k]["weight"] += e["weight"]
                edges[k]["low"] = edges[k]["low"] and e["low"]
            else:
                edges[k] = dict(e)
    low = sum(1 for e in edges.values() if e["low"])
    progress("graph", f"Resolved {len(edges):,} import edges, {low:,} low confidence")

    commits = read_git_log(repo_dir, limit=COMMIT_DEPTH)
    authors = {c["author"] for c in commits}
    progress("history", f"Read {len(commits):,} commits by {len(authors):,} authors")
    snapshots = build_history(files, commits, max_snapshots=SNAPSHOTS)
    progress("history", f"Bucketed history into {len(snapshots)} snapshots")

    progress("layout", f"Computing force-directed layout for {len(files):,} nodes")
    iters = compute_layout(files, edges)
    progress("layout", f"Settled {len(files):,} buildings after {iters} force iterations")

    file_nodes = [{
        "file_id": f["file_id"], "path": f["path"], "language": f["language"], "loc": f["loc"],
        "churn_score": f["churn_score"], "layout_x": f["layout_x"], "layout_y": f["layout_y"],
        "last_modified": f["last_modified"], "top_author": f["top_author"],
    } for f in files]
    edge_list = [{
        "source_file_id": s, "target_file_id": t, "weight": e["weight"],
        "confidence": "low" if e["low"] else "high",
    } for (s, t), e in edges.items()]

    meta = {
        "slug": slug, "url": url, "file_count": len(files), "total_scanned": total, "capped": capped,
        "file_cap": FILE_CAP, "edge_count": len(edge_list), "low_confidence_edges": low,
        "commit_count": len(commits), "commit_depth": COMMIT_DEPTH, "snapshot_count": len(snapshots),
        "languages": dict(langs), "python_parse_errors": py_stats["errors"],
        "import_specifiers": py_stats["specifiers"] + js_stats["specifiers"],
        "resolved_specifiers": py_stats["resolved"] + js_stats["resolved"],
        "dynamic_imports": js_stats["dynamic"], "package_roots": n_pkgs,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }
    progress("done", "City ready")
    return {"files": file_nodes, "edges": edge_list, "snapshots": snapshots, "meta": meta}
