#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Bodapp — idempotent Dozzle (live log viewer) provisioning. INFRA ONLY.
#
# What it does (each step no-ops or safely re-runs):
#   1. pulls the Dozzle image
#   2. (re)creates the `dozzle` container:
#        - docker socket mounted read-only,
#        - published on LOOPBACK ONLY (127.0.0.1:8080) — never on the network,
#        - DOZZLE_FILTER=name=bodapp-app  → it can ONLY see the app container
#          (filters are passed straight to Docker, same semantics as
#          `docker ps --filter name=…`; `bodapp-postgres` does not match),
#        - MCP server enabled at /api/mcp (read-only tools: list containers,
#          read/search logs, stats),
#        - actions + shell OFF: they can start/stop containers and exec into
#          them, which a log viewer has no business doing.
#   3. waits for Dozzle's /healthcheck to answer 200
#   4. exposes it tailnet-only through `tailscale serve --https=<port>`:
#        - NOT funnel → no public internet exposure, only tailnet members,
#        - port 8443 by default because Caddy already owns :80/:443 on this
#          host (a tailscale serve on 443 would fail to bind),
#        - the config lives in tailscaled's state, so it survives reboots.
#
# It NEVER touches the app container, docker-compose, Caddy or the database.
# Called ONLY by the Infrastructure pipeline (.github/workflows/infra.yml,
# which copies this script to /tmp on the server) or by hand. The
# business-logic pipeline (deploy.yml / deploy.sh) never runs it.
#
# Inputs (all optional):
#   APP_CONTAINER      container to show logs for   (default bodapp-app)
#   DOZZLE_CONTAINER   the viewer's own name        (default dozzle)
#   DOZZLE_IMAGE       image reference              (default amir20/dozzle:latest)
#   DOZZLE_HOST_PORT   loopback port to publish     (default 8080)
#   DOZZLE_SERVE_PORT  tailnet HTTPS port for serve (default 8443)
# ---------------------------------------------------------------------------
set -euo pipefail

APP_CONTAINER="${APP_CONTAINER:-bodapp-app}"
DOZZLE_CONTAINER="${DOZZLE_CONTAINER:-dozzle}"
DOZZLE_IMAGE="${DOZZLE_IMAGE:-amir20/dozzle:latest}"
DOZZLE_HOST_PORT="${DOZZLE_HOST_PORT:-8080}"
DOZZLE_SERVE_PORT="${DOZZLE_SERVE_PORT:-8443}"

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

fail() { echo "FATAL: $*" >&2; exit 1; }

# --- 1. prerequisites -------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker not found on this host"
command -v tailscale >/dev/null 2>&1 || fail "tailscale not found on this host"
command -v curl >/dev/null 2>&1 || fail "curl not found on this host"
docker info >/dev/null 2>&1 || fail "cannot talk to the docker daemon (run as root?)"
$SUDO tailscale status >/dev/null 2>&1 || fail "this host is not on the tailnet (join it first)"

case "$DOZZLE_SERVE_PORT" in
  ''|*[!0-9]*) fail "DOZZLE_SERVE_PORT '$DOZZLE_SERVE_PORT' is not a number" ;;
esac

# --- 2. image + container ---------------------------------------------------
echo "==> [dozzle] pulling $DOZZLE_IMAGE"
$SUDO docker pull -q "$DOZZLE_IMAGE" >/dev/null

echo "==> [dozzle] (re)creating '$DOZZLE_CONTAINER' — only '${APP_CONTAINER}', MCP on, actions/shell off"
# Recreate from scratch: config changes only apply on a fresh container.
$SUDO docker rm -f "$DOZZLE_CONTAINER" >/dev/null 2>&1 || true
$SUDO docker run -d \
  --name "$DOZZLE_CONTAINER" \
  --restart unless-stopped \
  --volume /var/run/docker.sock:/var/run/docker.sock:ro \
  --publish "127.0.0.1:${DOZZLE_HOST_PORT}:8080" \
  --env "DOZZLE_FILTER=name=${APP_CONTAINER}" \
  --env "DOZZLE_ENABLE_MCP=true" \
  --env "DOZZLE_ENABLE_ACTIONS=false" \
  --env "DOZZLE_ENABLE_SHELL=false" \
  "$DOZZLE_IMAGE" >/dev/null

# --- 3. health gate ---------------------------------------------------------
echo "==> [dozzle] waiting for http://127.0.0.1:${DOZZLE_HOST_PORT}/healthcheck"
healthy=""
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${DOZZLE_HOST_PORT}/healthcheck" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done
if [ -z "$healthy" ]; then
  echo "FATAL: Dozzle did not become healthy in 30s" >&2
  $SUDO docker logs --tail 50 "$DOZZLE_CONTAINER" >&2 || true
  exit 1
fi
echo "    healthy"

# The filter is the whole point: fail loudly if it is missing or wrong.
filter_env="$($SUDO docker inspect \
  --format '{{range .Config.Env}}{{println .}}{{end}}' "$DOZZLE_CONTAINER" \
  | grep '^DOZZLE_FILTER=' || true)"
if [ "$filter_env" != "DOZZLE_FILTER=name=${APP_CONTAINER}" ]; then
  fail "Dozzle is not filtered to '${APP_CONTAINER}' (container reports: ${filter_env:-nothing})"
fi
echo "    $filter_env (only this container is visible)"
# A typo'd/nonexistent target would silently show an empty viewer.
if ! $SUDO docker ps -a --format '{{.Names}}' | grep -qx "$APP_CONTAINER"; then
  echo "    WARNING: container '$APP_CONTAINER' does not exist on this host yet" >&2
  echo "             (deploy the app first — Dozzle will show it once it appears)" >&2
fi

# --- 4. tailnet-only exposure ----------------------------------------------
echo "==> [dozzle] exposing through Tailscale on https port ${DOZZLE_SERVE_PORT} (tailnet only, no funnel)"
if ! $SUDO tailscale serve --bg --https="${DOZZLE_SERVE_PORT}" \
      "http://127.0.0.1:${DOZZLE_HOST_PORT}"; then
  echo "FATAL: 'tailscale serve' failed." >&2
  echo "  Most likely the tailnet ACL has no HTTPS allowance. Add to your policy:" >&2
  echo '    {"action": "accept", "src": ["autogroup:member"], "dst": ["autogroup:self"], "proto": "https"}' >&2
  echo "  (tailnet settings -> access controls)" >&2
  exit 1
fi

$SUDO tailscale serve status || true

HOST="$($SUDO tailscale status --json 2>/dev/null | python3 -c '
import json, sys
try:
    print((json.load(sys.stdin).get("Self") or {}).get("DNSName", "").rstrip("."))
except Exception:
    pass
')"

echo "==> [dozzle] done"
if [ -n "$HOST" ]; then
  echo "    UI:            https://${HOST}:${DOZZLE_SERVE_PORT}/"
  echo "    MCP endpoint:  https://${HOST}:${DOZZLE_SERVE_PORT}/api/mcp"
fi
echo "    (reachable only inside your tailnet; MCP tools are read-only)"