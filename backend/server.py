import asyncio
import logging
import os
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

from pipeline import PipelineError
from pipeline.clone import normalize_repo_url
from pipeline.run import run_pipeline
from pipeline.scan import CODE_EXT

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("substrate")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
WORK_DIR = Path(os.environ.get("SUBSTRATE_WORK_DIR", "/tmp/substrate"))

app = FastAPI(title="SUBSTRATE")
api_router = APIRouter(prefix="/api")

jobs: dict = {}
pipeline_semaphore = asyncio.Semaphore(2)
_rate_limit_hits: dict[str, list[float]] = {}
_cleanup_task: Optional[asyncio.Task] = None
RATE_LIMIT = 5
RATE_WINDOW_SECONDS = 60 * 60
CLEANUP_INTERVAL_SECONDS = 10 * 60
WORK_RETENTION_SECONDS = 60 * 60


class AnalyzeRequest(BaseModel):
    url: str


def _public(job: dict) -> dict:
    return {k: job.get(k) for k in ("job_id", "slug", "status", "stages", "error", "cached")}


async def _run_job(job_id: str, url: str, slug: str):
    job = jobs[job_id]

    def progress(stage: str, message: str):
        job["stages"].append({"stage": stage, "message": message, "at": datetime.now(timezone.utc).isoformat()})
        logger.info("[%s] %s: %s", slug, stage, message)

    try:
        progress("queued", "Queued; waiting for an available analysis slot")
        async with pipeline_semaphore:
            result = await asyncio.to_thread(run_pipeline, url, slug, WORK_DIR / job_id, progress)
        job["result"] = result
        job["status"] = "done"
        job["finished_at"] = time.time()
        doc = {"job_id": job_id, "slug": slug, "url": url, "status": "done", "stages": job["stages"],
               "created_at": datetime.now(timezone.utc).isoformat(), **result}
        try:
            await db.analyses.insert_one(doc)
        except Exception as e:
            logger.warning("could not persist analysis %s: %s", slug, e)
    except PipelineError as e:
        job["status"] = "error"
        job["error"] = str(e)
        job["finished_at"] = time.time()
        logger.error("[%s] pipeline failed: %s", slug, e)
    except Exception as e:
        job["status"] = "error"
        job["error"] = f"Unexpected error: {type(e).__name__}: {e}"
        job["finished_at"] = time.time()
        logger.exception("[%s] pipeline crashed", slug)


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip() or "unknown"
    return request.client.host if request.client else "unknown"


def _check_rate_limit(ip: str, now: Optional[float] = None) -> bool:
    now = time.monotonic() if now is None else now
    hits = [hit for hit in _rate_limit_hits.get(ip, []) if now - hit < RATE_WINDOW_SECONDS]
    if len(hits) >= RATE_LIMIT:
        _rate_limit_hits[ip] = hits
        return False
    hits.append(now)
    _rate_limit_hits[ip] = hits
    return True


async def _cleanup_loop():
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        cutoff = time.time() - WORK_RETENTION_SECONDS
        active_ids = {job_id for job_id, job in jobs.items() if job.get("status") == "running"}
        if WORK_DIR.exists():
            for entry in WORK_DIR.iterdir():
                if entry.name in active_ids:
                    continue
                try:
                    if entry.stat().st_mtime < cutoff:
                        if entry.is_dir():
                            shutil.rmtree(entry)
                        else:
                            entry.unlink()
                except OSError as e:
                    logger.warning("could not clean work item %s: %s", entry, e)
        for job_id, job in list(jobs.items()):
            if job.get("status") in ("done", "error"):
                jobs.pop(job_id, None)
        now = time.monotonic()
        for ip, hits in list(_rate_limit_hits.items()):
            recent_hits = [hit for hit in hits if now - hit < RATE_WINDOW_SECONDS]
            if recent_hits:
                _rate_limit_hits[ip] = recent_hits
            else:
                _rate_limit_hits.pop(ip, None)


@app.on_event("startup")
async def startup():
    global _cleanup_task
    await db.analyses.create_index("slug")
    await db.analyses.create_index("job_id")
    await db.analyses.create_index("created_at")
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    _cleanup_task = asyncio.create_task(_cleanup_loop())


@api_router.get("/")
async def root():
    return {"service": "substrate", "status": "ok"}


@api_router.post("/repos/analyze")
async def analyze(req: AnalyzeRequest, background: BackgroundTasks, request: Request):
    if not _check_rate_limit(_client_ip(request)):
        raise HTTPException(status_code=429, detail="Rate limit reached. Try again in an hour.")
    try:
        url, slug = normalize_repo_url(req.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    for job in jobs.values():
        if job["slug"] == slug and job["status"] in ("running", "done") and (WORK_DIR / job["job_id"] / "repo").exists():
            return {**_public(job), "cached": job["status"] == "done"}
    async for doc in db.analyses.find({"slug": slug, "status": "done"}, {"_id": 0, "job_id": 1, "stages": 1}).sort("created_at", -1).limit(3):
        if (WORK_DIR / doc["job_id"] / "repo").exists():
            job = await _load_job(doc["job_id"])
            return {**_public(job), "cached": True}

    job_id = uuid.uuid4().hex[:12]
    jobs[job_id] = {"job_id": job_id, "slug": slug, "url": url, "status": "running", "stages": [], "error": None, "cached": False}
    background.add_task(_run_job, job_id, url, slug)
    return _public(jobs[job_id])


async def _load_job(job_id: str) -> Optional[dict]:
    job = jobs.get(job_id)
    if job:
        return job
    doc = await db.analyses.find_one({"job_id": job_id}, {"_id": 0})
    if doc:
        job = {"job_id": job_id, "slug": doc["slug"], "url": doc["url"], "status": "done", "stages": doc["stages"],
               "error": None, "cached": True,
               "finished_at": time.time(),
               "result": {k: doc[k] for k in ("files", "edges", "snapshots", "meta")}}
        jobs[job_id] = job
        return job
    return None


@api_router.get("/repos/{job_id}/status")
async def job_status(job_id: str):
    job = await _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job")
    return _public(job)


@api_router.get("/repos/{job_id}")
async def job_result(job_id: str):
    job = await _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job")
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail=f"Job is {job['status']}")
    return {"job_id": job_id, "slug": job["slug"], **job["result"]}


@api_router.get("/repos/{job_id}/file")
async def file_preview(job_id: str, path: str = Query(...), lines: int = 120):
    job = await _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job")
    repo_dir = (WORK_DIR / job_id / "repo").resolve()
    target = (repo_dir / path).resolve()
    if repo_dir not in target.parents or not target.is_file():
        raise HTTPException(status_code=404, detail="Preview expired. Rebuild this city to read files.")
    text = target.read_text(encoding="utf-8", errors="replace")
    all_lines = text.split("\n")
    return {"path": path, "language": CODE_EXT.get(target.suffix.lower(), "text"),
            "total_lines": len(all_lines), "lines": all_lines[:lines]}


app.include_router(api_router)
app.add_middleware(GZipMiddleware, minimum_size=2048)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    if _cleanup_task:
        _cleanup_task.cancel()
        try:
            await _cleanup_task
        except asyncio.CancelledError:
            pass
    client.close()
