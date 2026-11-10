#!/usr/bin/env bash
# ------------------------------------------------------------------
# Bodapp deploy-to-Hetzner script — invoked by the GitHub Actions
# workflow (deploy.yml) over SSH, or run manually on the VPS.
#
# Scope: BUSINESS LOGIC ONLY — the Bodapp compose stack (postgres +
# migrate + app). Infrastructure (Caddy / TLS / firewall) lives in the
# SEPARATE pipeline .github/workflows/infra.yml + deploy/caddy/
# setup-caddy.sh and is never invoked, checked or probed from here.
#
# Strategy (zero build-downtime, graceful swap, health-gated rollback):
#   0. disk pre-flight: prune reclaimable docker disk (builder cache +
#      dangling images), fail fast with df output if still too low
#   1. fetch code (storage/ photos preserved)
#   2. build the new image WHILE the old container keeps serving
#   3. run prisma migrations against the new image
#   4. recreate ONLY the app container — postgres stays up untouched
#   5. gate on health: GET http://127.0.0.1:3001/healthz, then assert
#      the port is still bound loopback-only
#   6. on failure: re-tag the previous image and roll the app back
#
# Network contract: compose publishes the app loopback-only
# (127.0.0.1:3001:3001) — reachable only from this host, never from
# a network.
#
# Env vars read:
#   REPO_DIR - absolute path to the checked-out repo (default /opt/bodapp)
#   BRANCH   - git branch to deploy (default main)
#   APP_PORT - obsolete, ignored. The port is fixed at 3001.
#   DEPLOY_BUILDER_CACHE - build cache kept after the pre-flight prune
#                          (default 6GiB)
#   DEPLOY_MIN_FREE_KB   - fail before building when / has less free space
#                          (default 6291456 KiB = 6GiB; lower it on a small
#                          volume rather than skipping the pre-flight)
# ------------------------------------------------------------------
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/bodapp}"
BRANCH="${BRANCH:-main}"
APP_HOST="127.0.0.1"
APP_PORT="3001"   # compose publishes 127.0.0.1:3001:3001 (loopback-only)

cd "$REPO_DIR"
echo "==> [deploy] working in $REPO_DIR (branch $BRANCH)"

# --- 1. Fetch latest code --------------------------------------------------
git fetch --all --tags
git reset --hard origin/"$BRANCH"
# CRITICAL: git clean -fd removes untracked files, which would delete the
# storage/ directory (not git-tracked) and ALL uploaded photos. Exclude it.
# (.env is gitignored, so it survives — ignored files are never removed
# without -x, and the pipeline rewrites it before this script runs anyway.)
git clean -fd -e storage/

# --- 2. Photo-storage mount must be writable by the container (uid 1001) ---
mkdir -p storage/photos
chown -R 1001:1001 storage 2>/dev/null \
  || chmod -R 777 storage 2>/dev/null \
  || true

# --- 2b. Disk pre-flight: reclaim build disk BEFORE building ---------------
# Every deploy leaves a full `next build` in the builder cache and failed
# runs leave even more behind; the runner targets then COPY node_modules +
# .next/standalone twice (app + migrate), so a full volume kills the build
# minutes later with "no space left on device" (Dockerfile:73). Prune ONLY
# reclaimable disk:
#   - builder cache, capped at DEPLOY_BUILDER_CACHE so the next build still
#     starts warm;
#   - DANGLING (untagged) images only. The running image is tagged and the
#     rollback snapshot (next step) reads it off the running container, so
#     this can never take away the rollback target.
# df output stays in the log before/after, so a failure is diagnosable from
# the workflow run alone.
echo "==> [deploy] disk before prune:"; df -h / | tail -1
docker system df || true
docker builder prune -af --keep-storage "${DEPLOY_BUILDER_CACHE:-6GiB}" || true
docker image prune -f || true
echo "==> [deploy] disk after prune:"; df -h / | tail -1
docker system df || true

MIN_FREE_KB="${DEPLOY_MIN_FREE_KB:-6291456}"   # 6 GiB
AVAIL_KB="$(df -kP / | awk 'NR==2 {print $4}')"
if [ "${AVAIL_KB:-0}" -lt "$MIN_FREE_KB" ]; then
  echo "==> [deploy] FAIL — only ${AVAIL_KB} KiB free on / after pruning (need ${MIN_FREE_KB})." >&2
  echo "    Refusing to start a build that would die halfway ('no space left on device')." >&2
  echo "    If 'docker system df' above shows little reclaimable, the space is held" >&2
  echo "    elsewhere (logs, volumes, other images) — clean it on the host, or lower" >&2
  echo "    DEPLOY_MIN_FREE_KB if the volume is genuinely smaller." >&2
  exit 1
fi

# --- 3. Snapshot the running image for rollback ----------------------------
# (Must run BEFORE `docker compose build`, which re-tags bodapp-app:latest.)
PREV_IMAGE_ID="$(docker inspect -f '{{.Image}}' bodapp-app 2>/dev/null || true)"

# --- 4. Build the new image FIRST — the old container keeps serving --------
# `app` and `migrate` share one Dockerfile, so layers are cache-shared.
echo "==> [deploy] building image (previous container keeps serving)..."
docker compose build

# --- 5. Postgres: start if down, otherwise leave it running untouched ------
docker compose up -d postgres

# --- 6. Migrations against the NEW image, before any traffic switches ------
# (`prisma migrate deploy` — idempotent; a failure aborts here, leaving the
#  old app container serving.)
echo "==> [deploy] applying database migrations..."
docker compose run --rm migrate

# --- 7. Graceful swap: recreate ONLY the app container ---------------------
# --no-deps: postgres/migrate are not touched (migrate already ran above).
# --no-build: the build already happened in step 4; compose never rebuilds
# implicitly here. Docker sends SIGTERM and compose stop_grace_period: 30s
# lets in-flight requests drain before the old container dies.
echo "==> [deploy] swapping app container..."
docker compose up -d --no-build --no-deps --force-recreate app

# --- 8. Health gate ---------------------------------------------------------
http_get() {
  # $1 = url. Prefer curl; fall back to wget. Always a GET (no --spider).
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 5 -o /dev/null "$1" 2>/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O /dev/null -T 5 "$1" 2>/dev/null
  else
    return 1
  fi
}

HEALTH_URL="http://${APP_HOST}:${APP_PORT}/healthz"
echo "==> [deploy] waiting for ${HEALTH_URL} ..."
healthy=false
for _ in $(seq 1 45); do          # up to ~90s (cold start + start_period)
  if http_get "$HEALTH_URL"; then healthy=true; break; fi
  sleep 2
done

if ! $healthy; then
  echo "==> [deploy] FAIL — new image never became healthy; logs:" >&2
  docker compose logs --tail=100 app >&2 || true

  # Rollback: put the previous image back and swap again.
  if [ -n "$PREV_IMAGE_ID" ]; then
    echo "==> [deploy] rolling back to previous image ${PREV_IMAGE_ID}..." >&2
    docker tag "$PREV_IMAGE_ID" bodapp-app:latest
    docker compose up -d --no-build --no-deps --force-recreate app
    sleep 5
    if http_get "$HEALTH_URL"; then
      echo "==> [deploy] rollback OK — previous version serving again" >&2
    else
      echo "==> [deploy] rollback did NOT clear either — manual intervention" >&2
    fi
  else
    echo "==> [deploy] no previous image to roll back to (first deploy?)" >&2
  fi
  docker compose ps >&2 || true
  exit 1
fi
echo "==> [deploy] OK — app healthy on ${HEALTH_URL}"

# Security assertion: the app must never be published beyond loopback.
# A mismatch means docker-compose.yml regressed (0.0.0.0) — fail loudly.
published="$(docker compose port app 3001 2>/dev/null | head -1 || true)"
case "$published" in
  127.0.0.1:3001)
    echo "==> [deploy] OK — app bound loopback-only (127.0.0.1:3001)"
    ;;
  *)
    echo "==> [deploy] FAIL — app port published as '${published:-<nothing>}', expected 127.0.0.1:3001." >&2
    echo "    The app must only be reachable by Caddy on this host. Fix docker-compose.yml." >&2
    docker compose ps >&2 || true
    exit 1
    ;;
esac

docker compose ps
echo "==> [deploy] done."
