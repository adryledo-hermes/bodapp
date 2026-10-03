#!/usr/bin/env bash
# ------------------------------------------------------------------
# Bodapp deploy-to-Hetzner script — invoked by the GitHub Actions
# workflow (deploy.yml) over SSH, or run manually on the VPS.
#
# Scope: ONLY the Bodapp compose stack (postgres + migrate + app).
# Caddy — the host's systemd reverse proxy that terminates TLS — is
# installed ONCE (see deploy/migrate-to-https.md) and is NEVER
# rebuilt, restarted or reconfigured by this script. TLS keeps
# running through every app deploy.
#
# Strategy (zero build-downtime, graceful swap, health-gated rollback):
#   1. fetch code (storage/ photos preserved)
#   2. build the new image WHILE the old container keeps serving
#   3. run prisma migrations against the new image
#   4. recreate ONLY the app container — postgres stays up untouched
#   5. gate on health: GET http://127.0.0.1:3001/healthz, then assert
#      the port is still bound loopback-only (+ warn-only probes of
#      Caddy itself and the public https:// URL)
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
# ------------------------------------------------------------------
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/bodapp}"
BRANCH="${BRANCH:-main}"
APP_HOST="127.0.0.1"
APP_PORT="3001"   # compose publishes 127.0.0.1:3001:3001 (loopback-only)

cd "$REPO_DIR"
echo "==> [deploy] working in $REPO_DIR (branch $BRANCH)"

# --- 0. Caddy pre-flight (READ-ONLY: warn, never start/restart it) --------
if command -v systemctl >/dev/null 2>&1 && ! systemctl is-active --quiet caddy; then
  echo "==> [deploy] WARN — the 'caddy' service is NOT active; https:// will fail." >&2
  echo "    Inspect with: systemctl status caddy && journalctl -u caddy -n 50" >&2
fi

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

# --- 9. Warn-only end-to-end probes (never fail the deploy) -----------------
# (a) Caddy itself — read-only check; this script never restarts it.
if command -v systemctl >/dev/null 2>&1 && ! systemctl is-active --quiet caddy; then
  echo "==> [deploy] WARN — caddy is not active; the app is fine but HTTPS is down." >&2
fi

# (b) The public URL (https://… from .env PUBLIC_BASE_URL), through Caddy.
# Warn-only: the FIRST deploy after the migration may still be waiting on the
# initial Let's Encrypt issuance, or DNS may not be pointed here yet.
PUBLIC_BASE_URL=""
if [ -f .env ]; then
  PUBLIC_BASE_URL="$(grep -E '^PUBLIC_BASE_URL=' .env | tail -1 | cut -d= -f2- | tr -d '"' || true)"
fi
case "$PUBLIC_BASE_URL" in
  https://*)
    if http_get "${PUBLIC_BASE_URL%/}/healthz"; then
      echo "==> [deploy] OK — end-to-end https probe through Caddy"
    else
      echo "==> [deploy] WARN — ${PUBLIC_BASE_URL} did not answer /healthz." >&2
      echo "    Check: caddy validate --config /etc/caddy/Caddyfile && systemctl status caddy" >&2
    fi
    ;;
  *)
    echo "==> [deploy] note — PUBLIC_BASE_URL is not https yet (${PUBLIC_BASE_URL:-unset})." >&2
    echo "    Behind Caddy it must be https://<domain> (see deploy/migrate-to-https.md)." >&2
    ;;
esac

echo "==> [deploy] done."
