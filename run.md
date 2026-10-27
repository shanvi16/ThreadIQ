# How to run ThreadIQ — step by step (Docker only)

ThreadIQ is run **entirely with Docker**. You do **not** need Node.js, npm or MongoDB installed on your PC — the frontend, both backend services, MongoDB, the demo-data seeder and the test runner all run in containers.

Commands work in **PowerShell** or **Git Bash**. Run them from the **project root** (the folder that contains `docker-compose.yml`).

**Contents:** [0 Prerequisites](#0-prerequisites) · [1 Start Docker](#1-start-docker-desktop) · [2 Configure](#2-get-the-project-and-optional-configuration) · [3 Build & start](#3-build-and-start-everything) · [4 Seed data](#4-load-the-demo-data) · [5 Open the app](#5-open-the-app) · [6 Smoke test & automated tests](#6-verify-smoke-test-and-automated-tests) · [7 Daily commands](#7-everyday-commands) · [8 Changing code](#8-after-you-change-the-code) · [9 Images & containers manually](#9-build-images-and-run-containers-manually-without-compose) · [10 GitHub](#10-put-the-whole-project-on-github) · [11 Docker Hub](#11-publish-the-images-to-docker-hub) · [12 Troubleshooting](#12-troubleshooting)

---

## 0. Prerequisites
| Tool | Needed for | Check with |
|---|---|---|
| **Docker Desktop** (Windows 11, WSL 2 backend) | everything | `docker --version` and `docker compose version` |
| Git | only for the GitHub section | `git --version` |

Nothing else. (No Node.js, no npm install, no local MongoDB.)

## 1. Start Docker Desktop
1. Open **Docker Desktop** from the Start menu.
2. Wait until it says **Engine running** (bottom-left is green).
3. Check in a terminal: `docker info` must print server details (not "cannot connect to the docker API … dockerDesktopLinuxEngine" — that means Docker Desktop is not running yet).

## 2. Get the project and (optional) configuration
```powershell
git clone https://github.com/<your-username>/threadiq.git
cd threadiq
copy .env.example .env        # optional - every value has a default
```
`.env` (root) is the only configuration file. It sets the published ports, the CORS origins and the browser-facing API URLs. Defaults work as they are.

## 3. Build and start everything
```powershell
docker compose up --build -d
```
What this does:
1. **Builds 3 images** from the Dockerfiles: `catalog-service`, `insights-service`, `web` (the first build takes a few minutes; later builds use the cache).
2. **Starts 4 containers** on a private network, in order, waiting for health checks: `mongo` → `catalog-service` → `insights-service` → `web`.
3. Creates a named volume `threadiq_mongo_data` that holds your database.

Check status — all four must show **(healthy)**:
```powershell
docker compose ps
```
If one is still `starting`, wait 20–30 seconds and run it again.

## 4. Load the demo data
```powershell
docker compose --profile tools run --rm seed
```
Expected: `Done: 20 products, 130 variants, … stock movements, … sales over 90 days`.
> ⚠ The seed **deletes and recreates** products, stock movements and sales. Run it again any time to reset the demo; it is deterministic and never duplicates data.

## 5. Open the app
| What | URL |
|---|---|
| **Web app** | http://localhost:5173 |
| Catalog API docs (Swagger) | http://localhost:3001/api-docs |
| Insights API docs (Swagger) | http://localhost:3002/api-docs |
| Health checks | http://localhost:3001/health · http://localhost:3002/health |

MongoDB is intentionally **not** reachable from your PC (its port is not published); only the other containers can talk to it.

## 6. Verify: smoke test and automated tests
Both run **inside Docker** as one-off containers (`--rm` deletes them afterwards).

**End-to-end smoke test** (needs the stack from step 3 to be running):
```powershell
docker compose --profile tools run --rm smoke
```
Expect `PASS` lines and `All smoke checks passed.` — it creates a product, records a sale across both services, checks stock deduction, idempotency and error handling, then archives the test product.

**Automated tests** (type-check + 92 tests; uses throw-away databases `threadiq_catalog_test` / `threadiq_sales_test` on the compose MongoDB, never your demo data):
```powershell
docker compose --profile tools run --rm test
```
Expect `Tests  38 passed` (catalog) and `Tests  54 passed` (insights).

## 7. Everyday commands
```powershell
docker compose ps                              # status of the stack
docker compose logs -f catalog-service         # follow one service's logs (Ctrl+C stops following)
docker compose logs -f                         # all logs
docker compose restart insights-service        # restart one service
docker compose stop                            # stop everything (data kept)
docker compose start                           # start again without rebuilding
docker compose down                            # remove containers + network (DATA KEPT in the volume)
docker compose down -v                         # also DELETE the database volume (all data lost)
docker compose exec mongo mongosh              # open a MongoDB shell inside the container
docker compose exec catalog-service sh         # shell inside a service container
docker stats                                   # live CPU / memory of containers
```
**Persistence check:** `docker compose down` then `docker compose up -d` — your data is still there.
**Fresh start:** `docker compose down -v` → step 3 → step 4.

## 8. After you change the code
There is no live reload: rebuild the image of what you changed.
```powershell
docker compose up --build -d catalog-service    # backend change (same for insights-service)
docker compose up --build -d web                # frontend change, or after editing VITE_* URLs in .env
docker compose up --build -d                    # rebuild everything that changed
docker compose --profile tools run --rm --build test   # re-run tests against the new code
```
Browser-facing URLs (`VITE_CATALOG_API_URL`, `VITE_INSIGHTS_API_URL`) are **baked into the web image** at build time because the browser, not a container, calls the APIs. They must use `localhost` + the published ports (never container names like `catalog-service`).

## 9. Build images and run containers manually (without Compose)
`docker compose up --build` does all of this for you. Doing it by hand shows what happens under the hood (useful for the viva).

> **Image** = read-only template built from a Dockerfile. **Container** = a running instance of an image. One image can start many containers.

> ⚠ **Use unique names.** A container name must be unique on your machine and `docker rm -f <name>` deletes whatever has that name. Every name below starts with `threadiq-` so it can't collide with (or delete) containers from your other projects. Don't use generic names like `mongo` or `web`. Don't run this section while `docker compose up` is running (same ports) — `docker compose down` first.

### 9.1 Build the images
The final `.` is the *build context* (the repo root — the npm workspaces share one lockfile); `-f` picks the Dockerfile; `-t` names/tags the image.
```powershell
docker build -f services/catalog-service/Dockerfile  -t threadiq-catalog-service:1.0.0  .
docker build -f services/insights-service/Dockerfile -t threadiq-insights-service:1.0.0 .
docker build -f apps/web/Dockerfile -t threadiq-web:1.0.0 --build-arg VITE_CATALOG_API_URL=http://localhost:3001 --build-arg VITE_INSIGHTS_API_URL=http://localhost:3002 .
docker build -f scripts/Dockerfile -t threadiq-seed:1.0.0 .
```
The service Dockerfiles are **multi-stage**: one stage compiles TypeScript, another installs only production dependencies, and the small final image copies just the compiled code and runs as the non-root `node` user.
```powershell
docker images                         # list images and sizes
docker history threadiq-web:1.0.0     # show the layers
```

### 9.2 Create a network and a volume
```powershell
docker network create threadiq-net
docker volume create threadiq-mongo-data
```
Containers on the same user-defined network reach each other **by container name**. The volume keeps MongoDB data after the container is removed.

### 9.3 Run the containers (in this order)
```powershell
docker run -d --name threadiq-mongo --network threadiq-net -v threadiq-mongo-data:/data/db mongo:8.0

docker run -d --name threadiq-catalog --network threadiq-net -p 3001:3001 -e NODE_ENV=production -e PORT=3001 -e MONGODB_URI=mongodb://threadiq-mongo:27017/threadiq_catalog -e CORS_ORIGINS=http://localhost:5173 --init threadiq-catalog-service:1.0.0

docker run -d --name threadiq-insights --network threadiq-net -p 3002:3002 -e NODE_ENV=production -e PORT=3002 -e MONGODB_URI=mongodb://threadiq-mongo:27017/threadiq_sales -e CATALOG_SERVICE_URL=http://threadiq-catalog:3001 -e CORS_ORIGINS=http://localhost:5173 --init threadiq-insights-service:1.0.0

docker run -d --name threadiq-web --network threadiq-net -p 5173:8080 --init threadiq-web:1.0.0
```
Seed (one-off container, deleted afterwards by `--rm`):
```powershell
docker run --rm --network threadiq-net -e CATALOG_MONGODB_URI=mongodb://threadiq-mongo:27017/threadiq_catalog -e SALES_MONGODB_URI=mongodb://threadiq-mongo:27017/threadiq_sales threadiq-seed:1.0.0
```
Open http://localhost:5173.
`-d` background · `--name` container name · `-p host:container` publish a port · `-e` environment variable · `-v` mount a volume · `--network` join the network · `--init` proper signal handling. MongoDB has **no** `-p`, so it is reachable only from containers on the network.

### 9.4 Manage and clean up
```powershell
docker ps                             # running containers (docker ps -a = all)
docker logs -f threadiq-catalog       # follow logs
docker exec -it threadiq-mongo mongosh
docker stop threadiq-web threadiq-insights threadiq-catalog threadiq-mongo
docker start threadiq-mongo threadiq-catalog threadiq-insights threadiq-web
docker rm -f threadiq-web threadiq-insights threadiq-catalog threadiq-mongo   # delete containers (volume keeps data)
docker volume rm threadiq-mongo-data  # delete the data
docker network rm threadiq-net
docker image rm threadiq-web:1.0.0    # delete an image
```

## 10. Put the whole project on GitHub
The folder is **not** a git repository until you do this once. Git is the only tool needed on your PC.

### 10.1 Set up Git
`.gitignore` already excludes `node_modules/`, `dist/` and `.env`. **Never commit real secrets** — only `.env.example` is committed.
```powershell
git --version
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"      # the e-mail linked to your GitHub account
```

### 10.2 Create an empty repository on GitHub
1. Sign in at https://github.com → **+** (top right) → **New repository**.
2. Name it e.g. `threadiq`, choose Public or Private, and **do not** tick "Add a README / .gitignore / license" (they already exist here).
3. Click **Create repository** and copy the URL, e.g. `https://github.com/<your-username>/threadiq.git`.

### 10.3 Commit and push
```powershell
git init -b main
git add .
git status                      # review: node_modules, dist and .env must NOT be listed
git commit -m "Initial commit: ThreadIQ"
git remote add origin https://github.com/<your-username>/threadiq.git
git push -u origin main
```
A browser window opens to sign in (Git Credential Manager). If the command line asks for a *password*, use a **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens, scope `repo`), not your account password. Alternative: GitHub CLI `gh auth login`.

> Your folder is inside Google Drive ("My Drive"); that works, but syncing a large `node_modules`/`dist` is slow. Since everything runs in Docker you can safely delete those host folders (`node_modules`, `dist`) — they are not needed and are git-ignored.

### 10.4 Everyday Git workflow
```powershell
git status                       # what changed
git add .                        # stage all changes
git commit -m "Describe the change"
git push                         # upload
git pull                         # download others' changes
git log --oneline                # history
git switch -c feature/my-change  # new branch → commit → git push -u origin feature/my-change → open a Pull Request
```

### 10.5 Anyone else runs your project
```powershell
git clone https://github.com/<your-username>/threadiq.git
cd threadiq
docker compose up --build -d
docker compose --profile tools run --rm seed
```

## 11. Publish the images to Docker Hub
Docker Hub (https://hub.docker.com) is a public image registry. Once your images are there, anyone can run ThreadIQ **without the source code and without building**.

### 11.1 Account and login
1. Sign up at https://hub.docker.com and choose a **username** (written `<dockeruser>` below).
2. Recommended: Account Settings → **Personal access tokens** → create one with *Read & Write*, and use it as the password.
```powershell
docker login -u <dockeruser>          # expect: Login Succeeded
```

### 11.2 Build and tag with your username
The image name **must** start with your Docker Hub username: `<dockeruser>/<name>:<tag>`.
```powershell
$u = "<dockeruser>"        # PowerShell.  Git Bash: u=<dockeruser>
docker build -f services/catalog-service/Dockerfile  -t $u/threadiq-catalog-service:1.0.0  -t $u/threadiq-catalog-service:latest  .
docker build -f services/insights-service/Dockerfile -t $u/threadiq-insights-service:1.0.0 -t $u/threadiq-insights-service:latest .
docker build -f apps/web/Dockerfile -t $u/threadiq-web:1.0.0 -t $u/threadiq-web:latest --build-arg VITE_CATALOG_API_URL=http://localhost:3001 --build-arg VITE_INSIGHTS_API_URL=http://localhost:3002 .
docker build -f scripts/Dockerfile -t $u/threadiq-seed:1.0.0 -t $u/threadiq-seed:latest .
```
Already built an image under a local name? Add a tag instead of rebuilding: `docker tag threadiq-web:1.0.0 $u/threadiq-web:1.0.0`.

### 11.3 Push
```powershell
docker push $u/threadiq-catalog-service  --all-tags
docker push $u/threadiq-insights-service --all-tags
docker push $u/threadiq-web              --all-tags
docker push $u/threadiq-seed             --all-tags
```
Check `https://hub.docker.com/u/<dockeruser>`: four repositories (public by default). Use version tags (`1.0.0`) for releases and `latest` for the newest.

### 11.4 Run from Docker Hub on any machine
Needs only Docker and the file `docker-compose.hub.yml` from this repo:
```powershell
$env:DOCKERHUB_USER = "<dockeruser>"           # Git Bash: export DOCKERHUB_USER=<dockeruser>
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
docker compose -f docker-compose.hub.yml --profile tools run --rm seed
```
Open http://localhost:5173. Pin a version with `$env:IMAGE_TAG = "1.0.0"`.

> ⚠ The web image has `http://localhost:3001/:3002` baked in, so it works when the browser runs on the **same machine** as the containers. For a remote server, rebuild the web image with `--build-arg VITE_…=http://<server>:<port>` and add that origin to `CORS_ORIGINS`.
> ⚠ Never put secrets in images or push `.env` files; images on public Docker Hub are visible to everyone.

### 11.5 Update later
Change code → rebuild with a new tag (`1.0.1` + `latest`) → `docker push … --all-tags`. Users run `docker compose -f docker-compose.hub.yml pull` then `up -d`.

## 12. Troubleshooting
| Symptom | Fix |
|---|---|
| `failed to connect to the docker API … dockerDesktopLinuxEngine` | Docker Desktop is not running — step 1; wait for *Engine running*. |
| `port is already allocated` (3001 / 3002 / 5173) | Another program or stack uses it. Stop it (`docker compose down`, or `docker ps` to find the owner) or change `WEB_PORT` / `CATALOG_PORT` / `INSIGHTS_PORT` in `.env`. |
| Web page loads but shows "Cannot reach the server" | Backends not healthy yet (`docker compose ps`), or the `VITE_*` URLs are wrong. After editing them: `docker compose up --build -d web`. |
| Dashboard is empty | Demo data not loaded — step 4. |
| CORS error in the browser console | The page origin must be in `CORS_ORIGINS` (default allows `http://localhost:5173` and `http://127.0.0.1:5173`). |
| A container is `unhealthy` / restarting | `docker compose logs <service>`; most often MongoDB was not ready yet — wait, or `docker compose up -d` again. |
| `Conflict. The container name … is already in use` (manual section) | A container with that name exists. Pick another name; never `docker rm -f` a container you didn't create. |
| `docker compose` seems to use old code | Rebuild: `docker compose up --build -d`. |
| Want a totally clean start | `docker compose down -v`, then steps 3–4. |
| Disk space is filling up | `docker system prune` (removes stopped containers and unused images — check what it lists first). |
