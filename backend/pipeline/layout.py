import math

import networkx as nx
import numpy as np

LOC_CAP = 2000.0


def footprint_size(loc: int) -> float:
    return 1.0 + 2.2 * math.sqrt(min(loc, LOC_CAP) / LOC_CAP)


def compute_layout(files, edges, iterations: int = 80):
    n = len(files)
    if n == 0:
        return 0
    G = nx.Graph()
    ids = [f["file_id"] for f in files]
    G.add_nodes_from(ids)
    for (s, t), e in edges.items():
        w = 1.0 + 0.2 * min(e["weight"], 5)
        if G.has_edge(s, t):
            G[s][t]["weight"] += w
        else:
            G.add_edge(s, t, weight=w)
    for f in files:
        parts = f["path"].split("/")[:-1]
        prev = "dir:."
        G.add_node(prev)
        for depth in range(len(parts)):
            node = "dir:" + "/".join(parts[: depth + 1])
            if not G.has_edge(prev, node):
                G.add_edge(prev, node, weight=0.9)
            prev = node
        G.add_edge(f["file_id"], prev, weight=1.4)
        f["_dir"] = prev

    radius = 2.4 * math.sqrt(n) + 6.0
    pos = nx.spring_layout(G, iterations=iterations, seed=7, weight="weight", scale=radius, center=(0.0, 0.0))

    X = np.array([pos[i] for i in ids], dtype=np.float64)
    R = np.array([0.85 * footprint_size(f["loc"]) + 0.7 for f in files], dtype=np.float64)
    dir_index = {}
    groups = np.array([dir_index.setdefault(f["_dir"], len(dir_index)) for f in files])
    n_groups = len(dir_index)
    rng = np.random.default_rng(7)
    for it in range(60):
        centroids = np.zeros((n_groups, 2))
        np.add.at(centroids, groups, X)
        counts = np.bincount(groups, minlength=n_groups)[:, None]
        centroids /= np.maximum(counts, 1)
        pull = 0.06 if it < 40 else 0.0
        X += (centroids[groups] - X) * pull
        dx = X[:, 0][:, None] - X[:, 0][None, :]
        dy = X[:, 1][:, None] - X[:, 1][None, :]
        dist = np.sqrt(dx * dx + dy * dy)
        min_d = R[:, None] + R[None, :]
        overlap = min_d - dist
        np.fill_diagonal(overlap, 0.0)
        mask = overlap > 0
        if not mask.any() and pull == 0.0:
            break
        dist_safe = np.where(dist < 1e-6, 1e-6, dist)
        jitter = rng.normal(0, 1e-3, size=dx.shape)
        ux = np.where(dist < 1e-6, jitter, dx / dist_safe)
        uy = np.where(dist < 1e-6, jitter, dy / dist_safe)
        push = np.where(mask, overlap * 0.5, 0.0)
        X[:, 0] += (ux * push).sum(axis=1) * 0.6
        X[:, 1] += (uy * push).sum(axis=1) * 0.6
    X -= X.mean(axis=0)
    for f, (x, y) in zip(files, X):
        f.pop("_dir", None)
        f["layout_x"] = round(float(x), 3)
        f["layout_y"] = round(float(y), 3)
    return iterations
