"""SUBSTRATE backend API tests: analyze pipeline, result data contract, file preview, errors."""
import os
import re
import time

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _analyze_and_wait(client, url, timeout=180):
    r = client.post(f"{API}/repos/analyze", json={"url": url}, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "job_id" in body and body["job_id"]
    job_id = body["job_id"]
    status = body
    start = time.time()
    while status.get("status") == "running":
        if time.time() - start > timeout:
            pytest.fail(f"timeout waiting for {url}; stages={status.get('stages')}")
        time.sleep(2)
        sr = client.get(f"{API}/repos/{job_id}/status", timeout=60)
        assert sr.status_code == 200, sr.text
        status = sr.json()
    return job_id, status, body


# ---------- health ----------
def test_root(client):
    r = client.get(f"{API}/", timeout=30)
    assert r.status_code == 200
    assert r.json() == {"service": "substrate", "status": "ok"}


# ---------- validation / error handling ----------
def test_invalid_url_400(client):
    r = client.post(f"{API}/repos/analyze", json={"url": "not a repo"}, timeout=30)
    assert r.status_code == 400, r.text
    assert "github" in r.json()["detail"].lower()


def test_empty_url_400(client):
    r = client.post(f"{API}/repos/analyze", json={"url": ""}, timeout=30)
    assert r.status_code == 400


def test_unknown_job_status_404(client):
    r = client.get(f"{API}/repos/unknownid/status", timeout=30)
    assert r.status_code == 404
    r2 = client.get(f"{API}/repos/unknownid", timeout=30)
    assert r2.status_code == 404


def test_nonexistent_repo_ends_in_error(client):
    job_id, status, _ = _analyze_and_wait(client, "github.com/thisuser/doesnotexist-xyz-123", timeout=120)
    assert status["status"] == "error", status
    assert status["error"] and len(status["error"]) > 5
    print("error message:", status["error"])
    # result endpoint should be 409 for a non-done job
    r = client.get(f"{API}/repos/{job_id}", timeout=30)
    assert r.status_code == 409, r.text


# ---------- flask analysis: stages + full data contract ----------
@pytest.fixture(scope="session")
def flask_job(client):
    job_id, status, first = _analyze_and_wait(client, "pallets/flask", timeout=240)
    assert status["status"] == "done", status
    return job_id, status


def test_flask_stages(client, flask_job):
    _, status = flask_job
    msgs = " | ".join(s["message"] for s in status["stages"])
    print("STAGES:", msgs)
    for frag in ["Cloning", "Scanned", "Parsed", "import edges", "commits", "Bucketed history into",
                 "buildings", "City ready"]:
        assert frag in msgs, f"missing stage fragment '{frag}' in: {msgs}"
    for s in status["stages"]:
        assert set(["stage", "message", "at"]) <= set(s.keys())
    assert re.search(r"Scanned \d", msgs)
    assert re.search(r"Read [\d,]+ commits", msgs)


def test_flask_result_contract(client, flask_job):
    job_id, _ = flask_job
    r = client.get(f"{API}/repos/{job_id}", timeout=90)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "_id" not in data
    for k in ("files", "edges", "snapshots", "meta"):
        assert k in data, k
    files, edges, snaps, meta = data["files"], data["edges"], data["snapshots"], data["meta"]

    assert len(files) > 10
    ids = set()
    keys = {"file_id", "path", "language", "loc", "churn_score", "layout_x", "layout_y",
            "last_modified", "top_author"}
    for f in files:
        assert set(f.keys()) == keys, f.keys()
        assert isinstance(f["loc"], int) and f["loc"] >= 0
        assert isinstance(f["churn_score"], (int, float)) and 0.0 <= f["churn_score"] <= 1.0
        assert isinstance(f["layout_x"], (int, float)) and isinstance(f["layout_y"], (int, float))
        assert ISO_RE.match(f["last_modified"]), f["last_modified"]
        assert isinstance(f["top_author"], str) and f["top_author"]
        assert f["language"] in ("python", "javascript", "typescript")
        ids.add(f["file_id"])
    assert len(ids) == len(files), "duplicate file_id"

    assert len(edges) > 0, "flask should have import edges"
    for e in edges:
        assert set(e.keys()) == {"source_file_id", "target_file_id", "weight", "confidence"}
        assert isinstance(e["weight"], int) and e["weight"] >= 1
        assert e["confidence"] in ("high", "low")
        assert e["source_file_id"] in ids and e["target_file_id"] in ids

    assert 0 < len(snaps) <= 60, len(snaps)
    for sn in snaps:
        assert set(sn.keys()) == {"commit_date", "file_states", "commit_message_summary"}
        assert ISO_RE.match(sn["commit_date"]), sn["commit_date"]
        assert isinstance(sn["commit_message_summary"], str)
        assert len(sn["file_states"]) == len(files)
        st = sn["file_states"][0]
        assert set(st.keys()) == {"file_id", "exists", "loc"}
        assert isinstance(st["exists"], bool) and isinstance(st["loc"], int)
    # author dates in git history are not strictly monotonic; require broadly increasing
    from datetime import datetime as _dt
    ds = [_dt.fromisoformat(s["commit_date"]) for s in snaps]
    inversions = sum(1 for a, b in zip(ds, ds[1:]) if b < a)
    assert inversions <= max(2, len(ds) // 10), f"snapshots badly out of order: {inversions} inversions"
    assert ds[-1] > ds[0]

    assert meta["slug"] == "pallets/flask"
    assert meta["file_count"] == len(files)
    assert meta["edge_count"] == len(edges)
    assert meta["snapshot_count"] == len(snaps)
    assert "python" in meta["languages"]
    assert meta["commit_count"] > 0
    print("meta:", {k: meta[k] for k in ("file_count", "edge_count", "snapshot_count", "capped", "commit_count", "languages")})


def test_flask_file_preview(client, flask_job):
    job_id, _ = flask_job
    r = client.get(f"{API}/repos/{job_id}/file", params={"path": "src/flask/app.py"}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["language"] == "python"
    assert isinstance(d["total_lines"], int) and d["total_lines"] > 120
    assert len(d["lines"]) <= 120 and len(d["lines"]) == 120
    assert any("flask" in ln.lower() for ln in d["lines"])


def test_file_preview_traversal_404(client, flask_job):
    job_id, _ = flask_job
    for bad in ["../../etc/passwd", "/etc/passwd", "../../../../etc/hosts", "does/not/exist.py"]:
        r = client.get(f"{API}/repos/{job_id}/file", params={"path": bad}, timeout=30)
        assert r.status_code == 404, f"{bad} -> {r.status_code} {r.text[:200]}"


def test_file_preview_unknown_job_404(client):
    r = client.get(f"{API}/repos/nosuchjob/file", params={"path": "README.md"}, timeout=30)
    assert r.status_code == 404


def test_flask_cached_resubmit(client, flask_job):
    t0 = time.time()
    r = client.post(f"{API}/repos/analyze", json={"url": "https://github.com/pallets/flask"}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["cached"] is True, d
    assert d["status"] == "done"
    assert time.time() - t0 < 15, "cached response too slow"


# ---------- typescript repo ----------
def test_typescript_repo(client):
    job_id, status, _ = _analyze_and_wait(client, "pmndrs/drei", timeout=300)
    assert status["status"] == "done", status
    r = client.get(f"{API}/repos/{job_id}", timeout=120)
    assert r.status_code == 200
    d = r.json()
    langs = d["meta"]["languages"]
    assert "typescript" in langs or "javascript" in langs, langs
    assert d["meta"]["edge_count"] > 0
    assert len(d["edges"]) > 0
    print("drei meta:", {k: d["meta"][k] for k in ("file_count", "edge_count", "snapshot_count", "languages", "dynamic_imports")})
