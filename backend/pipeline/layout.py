import math

import networkx as nx
import numpy as np
from scipy.spatial import cKDTree

LOC_CAP = 2000.0
# Target share of the city's disc that footprints may occupy. Circle packing tops
# out near 0.9, but a relaxation that has to converge (and leave room for roads)
# needs to start well below that.
PACK_DENSITY = 0.5
# Density of the disc the crowded core is spread onto before collisions are
# resolved. Higher = tighter city, but more work for the collision pass.
FLATTEN_DENSITY = 0.62


def footprint_size(loc: int) -> float:
    return 1.0 + 2.2 * math.sqrt(min(loc, LOC_CAP) / LOC_CAP)


def _separate(X, R, max_iter: int, tol: float = 0.02, rng=None):
    """Push overlapping circles apart until no pair overlaps by more than `tol`.

    Uses a KD-tree so only nearby pairs are considered (the old dense n x n pass
    was both slow and, at 60 fixed iterations, not enough to converge on big
    repos). Returns the number of iterations used.
    """
    rng = rng or np.random.default_rng(7)
    reach = 2.0 * float(R.max())
    for it in range(max_iter):
        pairs = cKDTree(X).query_pairs(r=reach, output_type="ndarray")
        if len(pairs) == 0:
            return it
        i, j = pairs[:, 0], pairs[:, 1]
        delta = X[j] - X[i]
        dist = np.hypot(delta[:, 0], delta[:, 1])
        overlap = (R[i] + R[j]) - dist
        hit = overlap > 0
        if not hit.any() or overlap[hit].max() < tol:
            return it
        i, j, delta, dist, overlap = i[hit], j[hit], delta[hit], dist[hit], overlap[hit]
        # Coincident centres have no direction: pick a random one.
        zero = dist < 1e-6
        if zero.any():
            ang = rng.uniform(0, 2 * math.pi, size=int(zero.sum()))
            delta[zero, 0], delta[zero, 1] = np.cos(ang), np.sin(ang)
            dist[zero] = 1.0
        push = (delta / dist[:, None]) * (overlap * 0.5)[:, None]
        disp = np.zeros_like(X)
        np.add.at(disp, i, -push)
        np.add.at(disp, j, push)
        X += disp * 0.6
    return max_iter


def _flatten_density(X, target_radius):
    """Even out the radial density of a force layout, keeping each node's angle.

    A spring layout piles most nodes into a dense core with a sparse rim. Local
    push-apart alone diffuses that crowd outward far too slowly on big repos, so
    we first remap radii by rank to a uniform-density disc. Angular position and
    radial *order* are preserved, so neighbours stay neighbours.
    """
    r = np.hypot(X[:, 0], X[:, 1])
    ang = np.arctan2(X[:, 1], X[:, 0])
    rank = np.argsort(np.argsort(r, kind="stable"), kind="stable")
    r_new = target_radius * np.sqrt((rank + 0.5) / len(r))
    X[:, 0] = r_new * np.cos(ang)
    X[:, 1] = r_new * np.sin(ang)


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

    R = np.array([0.85 * footprint_size(f["loc"]) + 0.7 for f in files], dtype=np.float64)
    # Size the disc from the footprints themselves: a fixed 2.4*sqrt(n) radius is
    # fine for a few hundred files but leaves 1,500 buildings packed too tightly
    # for the collision pass to ever separate them.
    needed = math.sqrt(float((R ** 2).sum()) / PACK_DENSITY)
    radius = max(2.4 * math.sqrt(n) + 6.0, needed)
    pos = nx.spring_layout(G, iterations=iterations, seed=7, weight="weight", scale=radius, center=(0.0, 0.0))

    X = np.array([pos[i] for i in ids], dtype=np.float64)
    dir_index = {}
    groups = np.array([dir_index.setdefault(f["_dir"], len(dir_index)) for f in files])
    n_groups = len(dir_index)
    rng = np.random.default_rng(7)
    # Phase 1: keep directories cohesive while nudging overlaps apart.
    for it in range(40):
        centroids = np.zeros((n_groups, 2))
        np.add.at(centroids, groups, X)
        counts = np.bincount(groups, minlength=n_groups)[:, None]
        centroids /= np.maximum(counts, 1)
        X += (centroids[groups] - X) * 0.06
        _separate(X, R, max_iter=1, rng=rng)
    # Phase 2: spread the crowded core, then resolve collisions to convergence.
    _flatten_density(X, math.sqrt(float((R ** 2).sum()) / FLATTEN_DENSITY))
    _separate(X, R, max_iter=800, rng=rng)

    X -= X.mean(axis=0)
    for f, (x, y) in zip(files, X):
        f.pop("_dir", None)
        f["layout_x"] = round(float(x), 3)
        f["layout_y"] = round(float(y), 3)
    return iterations