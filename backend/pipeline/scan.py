import hashlib
import os
from pathlib import Path

CODE_EXT = {
    ".py": "python",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript",
}
IGNORE_DIRS = {
    "node_modules", ".git", "dist", "build", "out", "vendor", "venv", ".venv", "env",
    "__pycache__", "site-packages", "coverage", ".next", ".nuxt", "target", "third_party",
    "bower_components", ".tox", ".mypy_cache", ".pytest_cache", "storybook-static", ".cache",
}
MAX_FILE_BYTES = 1_000_000


def file_id_for(path: str) -> str:
    return hashlib.sha1(path.encode("utf-8")).hexdigest()[:10]


def count_lines(abs_path: Path) -> int:
    try:
        data = abs_path.read_bytes()
    except OSError:
        return -1
    if b"\x00" in data[:4096]:
        return -1
    if not data:
        return 0
    n = data.count(b"\n")
    if not data.endswith(b"\n"):
        n += 1
    return n


def scan_files(repo_dir: Path, cap: int = 1500):
    found = []
    for root, dirs, names in os.walk(repo_dir):
        dirs[:] = sorted(d for d in dirs if d not in IGNORE_DIRS and not d.startswith("."))
        for name in names:
            ext = os.path.splitext(name)[1].lower()
            if ext not in CODE_EXT or name.endswith(".min.js") or name.endswith(".min.mjs"):
                continue
            abs_path = Path(root) / name
            if abs_path.is_symlink():
                continue
            try:
                if abs_path.stat().st_size > MAX_FILE_BYTES:
                    continue
            except OSError:
                continue
            rel = abs_path.relative_to(repo_dir).as_posix()
            found.append((rel, abs_path, CODE_EXT[ext]))

    total = len(found)
    found.sort(key=lambda t: (t[0].count("/"), t[0]))
    capped = total > cap
    selected = found[:cap]

    files = []
    for rel, abs_path, lang in selected:
        loc = count_lines(abs_path)
        if loc < 0:
            continue
        files.append({"file_id": file_id_for(rel), "path": rel, "language": lang, "loc": loc, "_abs": abs_path})
    return files, total, capped
