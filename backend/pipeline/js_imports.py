import json
import logging
import os
import posixpath
import re
from collections import defaultdict
from pathlib import Path

from .scan import IGNORE_DIRS

log = logging.getLogger("substrate.js")

BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"^\s*//.*$", re.M)
STATIC_IMPORT = re.compile(r"""import\s+(?:type\s+)?(?:[\w*\s{},$]*?\s+from\s+)?['"]([^'"\n]+)['"]""")
EXPORT_FROM = re.compile(r"""export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s+['"]([^'"\n]+)['"]""")
REQUIRE = re.compile(r"""\brequire\(\s*['"]([^'"\n]+)['"]\s*\)""")
DYNAMIC_IMPORT = re.compile(r"""\bimport\(\s*['"]([^'"\n]+)['"]\s*\)""")

EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]


def _tolerant_json(text: str):
    text = BLOCK_COMMENT.sub("", text)
    text = LINE_COMMENT.sub("", text)
    text = re.sub(r",\s*([}\]])", r"\1", text)
    return json.loads(text)


def _load_configs(repo_dir: Path):
    tsconfigs, packages = {}, {}
    for root, dirs, names in os.walk(repo_dir):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith(".")]
        rel_root = Path(root).relative_to(repo_dir).as_posix()
        rel_root = "" if rel_root == "." else rel_root
        for name in names:
            if name in ("tsconfig.json", "jsconfig.json"):
                try:
                    cfg = _tolerant_json((Path(root) / name).read_text(encoding="utf-8", errors="replace"))
                    opts = cfg.get("compilerOptions", {}) or {}
                    if opts.get("paths") or opts.get("baseUrl"):
                        tsconfigs[rel_root] = {"baseUrl": opts.get("baseUrl") or ".", "paths": opts.get("paths") or {}}
                except Exception as e:
                    log.warning("could not parse %s/%s: %s", rel_root, name, e)
            elif name == "package.json":
                try:
                    pkg = _tolerant_json((Path(root) / name).read_text(encoding="utf-8", errors="replace"))
                    if isinstance(pkg, dict) and pkg.get("name"):
                        entry = pkg.get("source") or pkg.get("module") or pkg.get("main") or ""
                        packages[pkg["name"]] = {"dir": rel_root, "entry": entry if isinstance(entry, str) else ""}
                except Exception as e:
                    log.warning("could not parse %s/package.json: %s", rel_root, e)
    return tsconfigs, packages


class JSResolver:
    def __init__(self, files, repo_dir: Path):
        self.repo_dir = repo_dir
        self.by_path = {f["path"]: f["file_id"] for f in files}
        self.tsconfigs, self.packages = _load_configs(repo_dir)
        self.pkg_dirs = sorted({p["dir"] for p in self.packages.values()}, key=len, reverse=True)
        self.has_src = (repo_dir / "src").is_dir()

    def _nearest(self, mapping_keys, file_path):
        d = posixpath.dirname(file_path)
        while True:
            if d in mapping_keys:
                return d
            if d == "":
                return None
            d = posixpath.dirname(d)

    def _probe(self, rel: str):
        rel = posixpath.normpath(rel)
        if rel.startswith("../"):
            return None
        if rel == ".":
            rel = ""
        cands = [rel] if rel else []
        base, ext = posixpath.splitext(rel)
        if ext in (".js", ".jsx", ".mjs", ".cjs"):
            swap = {".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"]}[ext]
            cands += [base + e for e in swap]
        cands += [rel + e for e in EXTS]
        cands += [posixpath.join(rel, "index" + e) if rel else "index" + e for e in EXTS]
        for c in cands:
            if c in self.by_path:
                return self.by_path[c]
        return None

    def _alias(self, spec: str, file_path: str):
        key = self._nearest(self.tsconfigs, file_path)
        if key is None:
            return []
        cfg = self.tsconfigs[key]
        base = posixpath.normpath(posixpath.join(key, cfg["baseUrl"]))
        base = "" if base == "." else base
        out = []
        for pattern, targets in cfg["paths"].items():
            if not isinstance(targets, list):
                continue
            if pattern.endswith("*"):
                prefix = pattern[:-1]
                if spec.startswith(prefix):
                    rest = spec[len(prefix):]
                    out += [posixpath.join(base, t.replace("*", rest)) for t in targets]
            elif spec == pattern:
                out += [posixpath.join(base, t) for t in targets]
        if not out and cfg["paths"] == {} and not spec.startswith("."):
            out.append(posixpath.join(base, spec))
        return out

    def resolve(self, spec: str, file_path: str):
        spec = spec.split("?")[0]
        if not spec or spec.startswith("node:"):
            return None
        if spec.startswith("."):
            return self._probe(posixpath.join(posixpath.dirname(file_path), spec))
        if spec.startswith("/"):
            return self._probe(spec.lstrip("/"))
        for cand in self._alias(spec, file_path):
            hit = self._probe(cand)
            if hit:
                return hit
        for prefix in ("@/", "~/", "~", "@"):
            if spec.startswith(prefix) and prefix in ("@/", "~/", "~"):
                rest = spec[len(prefix):]
                roots = ["src", ""]
                pkg_root = self._nearest(set(self.pkg_dirs), file_path)
                if pkg_root:
                    roots = [posixpath.join(pkg_root, "src"), pkg_root] + roots
                for r in roots:
                    hit = self._probe(posixpath.join(r, rest))
                    if hit:
                        return hit
                return None
        parts = spec.split("/")
        name = "/".join(parts[:2]) if spec.startswith("@") and len(parts) >= 2 else parts[0]
        pkg = self.packages.get(name)
        if pkg:
            rest = spec[len(name):].lstrip("/")
            if rest:
                return self._probe(posixpath.join(pkg["dir"], rest)) or self._probe(posixpath.join(pkg["dir"], "src", rest))
            for entry in (pkg["entry"], "src/index", "index", "src/main", "lib/index"):
                if entry:
                    hit = self._probe(posixpath.join(pkg["dir"], entry))
                    if hit:
                        return hit
            return None
        if self.has_src and spec.startswith("src/"):
            return self._probe(spec)
        return None


def parse_js_imports(files, repo_dir: Path):
    resolver = JSResolver(files, repo_dir)
    edges = defaultdict(lambda: {"weight": 0, "low": False})
    stats = {"parsed": 0, "errors": 0, "specifiers": 0, "resolved": 0, "dynamic": 0}
    for f in files:
        if f["language"] not in ("javascript", "typescript"):
            continue
        try:
            src = f["_abs"].read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            stats["errors"] += 1
            log.warning("could not read %s: %s", f["path"], e)
            continue
        stats["parsed"] += 1
        src = BLOCK_COMMENT.sub("", src)
        src = LINE_COMMENT.sub("", src)
        found = []
        for rx in (STATIC_IMPORT, EXPORT_FROM, REQUIRE):
            found += [(m, False) for m in rx.findall(src)]
        found += [(m, True) for m in DYNAMIC_IMPORT.findall(src)]
        for spec, dynamic in found:
            stats["specifiers"] += 1
            if dynamic:
                stats["dynamic"] += 1
            hit = resolver.resolve(spec, f["path"])
            if not hit or hit == f["file_id"]:
                continue
            stats["resolved"] += 1
            e = edges[(f["file_id"], hit)]
            e["weight"] += 1
            if dynamic and e["weight"] == 1:
                e["low"] = True
            elif not dynamic:
                e["low"] = False
    return edges, stats, len(resolver.packages), len(resolver.tsconfigs)
