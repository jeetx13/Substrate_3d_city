import ast
import logging
from collections import defaultdict

log = logging.getLogger("substrate.python")


def _dotted(path: str) -> str:
    mod = path[:-3] if path.endswith(".py") else path
    mod = mod.replace("/", ".")
    if mod.endswith(".__init__"):
        mod = mod[: -len(".__init__")]
    elif mod == "__init__":
        mod = ""
    return mod


class PythonResolver:
    def __init__(self, files):
        self.by_path = {f["path"]: f["file_id"] for f in files}
        self.full = {}
        self.suffix = defaultdict(list)
        self.path_of = {}
        for f in files:
            if f["language"] != "python":
                continue
            mod = _dotted(f["path"])
            if not mod:
                continue
            self.full.setdefault(mod, f["file_id"])
            self.path_of[f["file_id"]] = f["path"]
            parts = mod.split(".")
            for k in range(1, len(parts) + 1):
                self.suffix[".".join(parts[-k:])].append(f["file_id"])

    def _pick(self, candidates, importer_path):
        if len(candidates) == 1:
            return candidates[0]
        imp_dir = importer_path.rsplit("/", 1)[0] if "/" in importer_path else ""
        best, best_score = None, -1
        for fid in candidates:
            p = self.path_of[fid]
            d = p.rsplit("/", 1)[0] if "/" in p else ""
            score = len(_common_prefix(d, imp_dir))
            if score > best_score:
                best, best_score = fid, score
        return best

    def resolve_absolute(self, dotted: str, importer_path: str):
        if not dotted:
            return None
        if dotted in self.full:
            return self.full[dotted]
        parts = dotted.split(".")
        cands = self.suffix.get(dotted)
        if cands and (len(parts) >= 2 or len(cands) == 1):
            return self._pick(cands, importer_path)
        if cands:
            imp_dir = importer_path.rsplit("/", 1)[0] if "/" in importer_path else ""
            for fid in cands:
                p = self.path_of[fid]
                d = p.rsplit("/", 1)[0] if "/" in p else ""
                if d == imp_dir:
                    return fid
        return None

    def resolve_relative(self, level: int, module: str, names, importer_path: str):
        base_parts = importer_path.split("/")[:-1]
        if importer_path.endswith("__init__.py"):
            level -= 1
        up = level - 1
        if up > len(base_parts):
            return []
        base = base_parts[: len(base_parts) - up] if up > 0 else base_parts
        base_dotted = ".".join(base)
        out = []
        mod = f"{base_dotted}.{module}" if module and base_dotted else (module or base_dotted)
        if module:
            hit = self.full.get(mod)
            if hit:
                out.append(hit)
                for n in names:
                    sub = self.full.get(f"{mod}.{n}")
                    if sub:
                        out.append(sub)
                return out
        for n in names:
            sub = self.full.get(f"{mod}.{n}" if mod else n)
            if sub:
                out.append(sub)
        if not out and mod in self.full:
            out.append(self.full[mod])
        return out


def _common_prefix(a: str, b: str) -> str:
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return a[:n]


def parse_python_imports(files):
    resolver = PythonResolver(files)
    edges = defaultdict(lambda: {"weight": 0, "low": False})
    stats = {"parsed": 0, "errors": 0, "specifiers": 0, "resolved": 0}
    for f in files:
        if f["language"] != "python":
            continue
        try:
            src = f["_abs"].read_text(encoding="utf-8", errors="replace")
            tree = ast.parse(src)
        except (SyntaxError, ValueError) as e:
            stats["errors"] += 1
            log.warning("python parse error %s: %s", f["path"], str(e).splitlines()[0] if str(e) else e)
            continue
        stats["parsed"] += 1
        targets = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    stats["specifiers"] += 1
                    hit = resolver.resolve_absolute(alias.name, f["path"])
                    if hit:
                        targets.append(hit)
            elif isinstance(node, ast.ImportFrom):
                stats["specifiers"] += 1
                names = [a.name for a in node.names if a.name != "*"]
                if node.level and node.level > 0:
                    hits = resolver.resolve_relative(node.level, node.module or "", names, f["path"])
                    targets.extend(hits)
                else:
                    mod = node.module or ""
                    hits = []
                    for n in names:
                        h = resolver.resolve_absolute(f"{mod}.{n}", f["path"])
                        if h:
                            hits.append(h)
                    if not hits:
                        h = resolver.resolve_absolute(mod, f["path"])
                        if h:
                            hits.append(h)
                    targets.extend(hits)
        for t in targets:
            if t == f["file_id"]:
                continue
            stats["resolved"] += 1
            edges[(f["file_id"], t)]["weight"] += 1
    return edges, stats
