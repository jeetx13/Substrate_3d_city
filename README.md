# SUBSTRATE

SUBSTRATE turns a public GitHub repository into an explorable 3D city. Source files become buildings, imports become roads, and recent Git history becomes a time scrubber through the city.

> **Demo GIF placeholder:** Add a short capture here showing a repository being built, the city controls, and history playback.

## What you can explore

- Building height represents lines of code; footprint varies by language; color reflects file churn.
- Import relationships form roads. Dashed roads mark lower-confidence matches.
- Select files to inspect previews and their imports. Search paths, jump to high-churn files, and fly around the city.
- Scrub through up to 60 snapshots built from recent Git commits.

## Stack

- **Frontend:** React, React Three Fiber, Three.js, Drei, Zustand, GSAP, and React Router.
- **Backend:** Python 3.12, FastAPI, Uvicorn, Motor, and MongoDB.
- **Analysis:** Python AST parsing; JavaScript and TypeScript import scanning; NetworkX and NumPy graph layout; Git history sampling.

## How it works

1. The API accepts a public GitHub URL and checks repository metadata. It rejects repositories over 500,000 KB when GitHub's API returns the size; API failures and rate limits do not block the analysis.
2. The worker makes a shallow clone, scans supported source files, skips symlinks, extracts import edges, and summarizes up to 400 commits.
3. It computes file positions and up to 60 historical snapshots, then stores the graph and job result in MongoDB.
4. The browser turns the graph into instanced 3D buildings and roads. The temporary clone also serves read-only previews and is removed by cleanup after it ages past 60 minutes.

## Run locally

You need Python 3.12, Git, Node.js, Yarn, and a reachable MongoDB instance. MongoDB can run locally or in Atlas.

### Backend

In PowerShell:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

On macOS or Linux, activate with `source .venv/bin/activate` instead. Edit `backend/.env` if MongoDB is not using the local defaults.

### Frontend

In a second terminal:

```powershell
cd frontend
yarn install --frozen-lockfile
Copy-Item .env.example .env
yarn start
```

Open <http://localhost:3000>. The frontend calls the backend at the origin in `REACT_APP_BACKEND_URL` and appends `/api` itself. The API root is available at <http://localhost:8000/api/>.

## Environment variables

Copy the example files and set values in the hosting provider's environment settings. Do not commit real credentials.

| Variable | Service | Required | Purpose |
| --- | --- | --- | --- |
| `MONGO_URL` | Backend | Yes | MongoDB URI, such as `mongodb://localhost:27017` or an Atlas `mongodb+srv://` URI. |
| `DB_NAME` | Backend | Yes | Database name, for example `substrate`. |
| `CORS_ORIGINS` | Backend | Production | Comma-separated frontend origins, without paths, such as `https://your-site.example`. Defaults to `*` when unset. |
| `SUBSTRATE_WORK_DIR` | Backend | No | Temporary clone directory. Defaults to `/tmp/substrate`. |
| `GITHUB_TOKEN` | Backend | No | Optional token for authenticated GitHub repository metadata requests. The size-check API is best effort. |
| `REACT_APP_BACKEND_URL` | Frontend | Yes | Backend origin, for example `http://localhost:8000`; do not add `/api`. This value is embedded at frontend build time. |

## Deploy

Deploy the frontend and API as separate services, and use a persistent MongoDB deployment for stored analysis results.

### Frontend on Vercel or Netlify

- Set the project root to `frontend`, build with `yarn build`, and publish the generated `build` directory.
- Add `REACT_APP_BACKEND_URL` to the frontend build environment and rebuild after changing it.
- Configure a single-page-app fallback so direct visits and refreshes of `/city/:jobId`, `/privacy`, and `/terms` serve `index.html`. Netlify supports `/* /index.html 200` in a `_redirects` file; see its [SPA rewrite docs](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/). Vercel supports [rewrites](https://vercel.com/docs/routing/rewrites) and documents [Create React App deployments](https://vercel.com/docs/frameworks/frontend/create-react-app).

### Backend on Render, Railway, or Fly.io

The backend Dockerfile is `backend/Dockerfile`. Use `backend` as the build context so `requirements.txt`, `server.py`, and `pipeline/` are in the Docker image. The container installs Git and starts Uvicorn on `0.0.0.0:$PORT` (falling back to port 8000 locally). Set `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, and any desired `SUBSTRATE_WORK_DIR` or `GITHUB_TOKEN` in the service settings.

- **Render:** Create a Docker web service with the root directory set to `backend` (and Dockerfile path `Dockerfile`). Render web services must bind to `0.0.0.0` and the configured port; see [Docker deploys](https://render.com/docs/docker) and [web services](https://render.com/docs/web-services).
- **Railway:** Deploy the repository and set the service root directory to `backend`, allowing Railway to detect its `Dockerfile`. Add backend environment variables in the service; see [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles).
- **Fly.io:** From `backend`, run `fly launch` to configure the app from this Dockerfile, then `fly deploy`. Set `internal_port = 8000` in `fly.toml` to match the Dockerfile's exposed/default port, and provide the backend variables with Fly secrets; see [Fly's Docker deployment guide](https://docs.fly.io/languages-and-frameworks/dockerfile/).

### MongoDB Atlas

Create a database user, copy the driver's connection URI into `MONGO_URL`, and allow the backend service's outbound IP/network in the Atlas project's IP access list. Atlas requires both an authorized network and valid database credentials; see [Connect to an Atlas cluster](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).

## Limits and behavior

- Only public GitHub repositories are accepted. Python, JavaScript, and TypeScript are scanned; other languages are not modeled.
- A city contains at most 1,500 files. The history uses at most 400 commits and 60 snapshots.
- Repository size is rejected above 500,000 KB only when the GitHub metadata request succeeds; a failed or rate-limited metadata request proceeds to cloning.
- At most two analysis pipelines run at once. `POST /api/repos/analyze` is limited to five requests per hour per client IP.
- Temporary clones are swept every ten minutes once their on-disk age exceeds 60 minutes. Previews can expire earlier if the backend restarts or its temporary storage is cleared. Analysis graphs are stored separately in MongoDB.
- Import extraction and churn/history are heuristics, not a full compiler or security analysis. Dynamic or unresolved imports may be incomplete or marked low confidence.
- Use a persistent work directory if previews must survive backend instance restarts. Temporary storage is not a durable source-code archive.

### Hero bake

Run the hero bake locally with `python tools/bake_hero.py`.
Trigger it via the GitHub Actions tab once the workflow file exists on the default branch.
Trigger it from the CLI with `gh workflow run bake-hero.yml --ref <branch>`.

## Known limitations / Deferred

- The file cap currently keeps the shallowest paths by directory depth, then alphabetical, not the most connected files.
- Connectedness-based partial rendering and general generated-file exclusion for user repos are approved product decisions that are not implemented yet.
- The hero bake excludes Rich's generated unicode tables via `tools/bake_hero.py` only.

## Repository layout

```text
backend/   FastAPI service, Git analysis pipeline, Dockerfile, environment example
frontend/  React application, 3D scene, environment example, static metadata/assets
memory/    Product notes
```
