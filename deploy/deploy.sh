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
# ------------------------------------------------------------------
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/bodapp}"
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

# 3. Prune old images (optional) then build & start everything.
#    compose `app` depends_on `migrate: service_completed_successfully`,
#    so `up --build` runs prisma migrate deploy before the app starts.
docker compose pull 2>/dev/null || true
docker compose up -d --build

# 4. Wait for the app to come up and probe it.
echo "==> [deploy] waiting for app to respond..."
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:3000/login" 2>/dev/null; then
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
