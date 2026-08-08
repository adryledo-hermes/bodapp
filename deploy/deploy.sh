#!/usr/bin/env bash
# ------------------------------------------------------------------
# Bodapp deploy-to-Hetzner script — invoked by the GitHub Actions
# workflow (deploy.yml) over SSH, or run manually on the VPS.
#
# Assumes the repo is already cloned into $REPO_DIR on the server
# (see deploy/hetzner-setup.md one-time setup) and that .env has
# already been written by the pipeline (from GH secret ENV_FILE).
#
# Env vars read:
#   REPO_DIR   - absolute path to the checked-out repo on the server
#                (default /opt/bodapp)
#   BRANCH     - git branch to deploy (default main)
#   APP_PORT   - HOST port the app is published on (compose maps
#                ${APP_PORT:-8080}:3000; must match PUBLIC_BASE_URL)
# ------------------------------------------------------------------
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/bodapp}"
# APP_PORT: default 8080, but honour one set in the repo .env so the health
# probe matches the host port compose actually publishes.
if [ -z "${APP_PORT:-}" ] && [ -f "$REPO_DIR/.env" ]; then
  APP_PORT="$(grep -E '^APP_PORT=' "$REPO_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true)"
fi
APP_PORT="${APP_PORT:-8080}"
cd "$REPO_DIR"

echo "==> [deploy] working in $REPO_DIR"

# 1. Fetch latest code (the pipeline already did git pull, but be safe)
git fetch --all --tags
git reset --hard origin/"${BRANCH:-main}"
git clean -fd

# 2. Ensure the photo-storage mount's host dir exists & is writable by
#    the container's non-root user (uid 1001). Best-effort — the setup
#    runbook normally pre-creates this; do it again in case it's fresh.
mkdir -p storage/photos
chown -R 1001:1001 storage 2>/dev/null \
  || chmod -R 777 storage 2>/dev/null \
  || true

# 3. Tear down any EXISTING containers/network first. Without this, a stale
#    `app` container from a previous deploy still holds port 3000 and the new
#    one fails to bind ("port is already allocated"). `down` leaves the named
#    postgres volume (bodapp-pgdata) intact, so no data is lost — the DB will
#    simply be restarted fresh against the same volume.
echo "==> [deploy] stopping existing containers (keeping postgres volume)..."
docker compose down --remove-orphans

# 4. Build & start everything. compose `app` depends_on
#    `migrate: service_completed_successfully`, so `up --build` runs
#    `prisma migrate deploy` before the app starts.
docker compose pull 2>/dev/null || true
docker compose up -d --build

# 4. Wait for the app to come up and probe it. Instead of trusting APP_PORT
#    (the health probe must match the ACTUAL published host port), discover it
#    from compose: `docker compose port app 3000` prints e.g. 0.0.0.0:8080.
probe_host="127.0.0.1"
probe_port="$(docker compose port app 3000 2>/dev/null | sed -E 's/.*://' || true)"
probe_port="${probe_port:-${APP_PORT:-8080}}"

# Prefer curl; fall back to wget; last resort a raw /dev/tcp TCP check.
http_ok() {
  local url="http://${probe_host}:${probe_port}/login"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -o /dev/null "$url" 2>/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -q --spider -T 5 "$url" 2>/dev/null
  else
    (exec 3<>"/dev/tcp/${probe_host}/${probe_port}") 2>/dev/null
  fi
}

echo "==> [deploy] waiting for app to respond on ${probe_host}:${probe_port}..."
for i in $(seq 1 30); do
  if http_ok; then
    echo "==> [deploy] OK — app responded on /login (try $i)"
    docker compose ps
    exit 0
  fi
  sleep 2
done

echo "==> [deploy] WARN — app did not respond within timeout; showing logs" >&2
docker compose logs --tail=100 app || true
docker compose ps
exit 1
