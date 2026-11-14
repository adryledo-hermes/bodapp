#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Bodapp — idempotent MONITORING provisioning (vmagent + exporters → Grafana
# Cloud).  INFRA ONLY — mirrors deploy/dozzle/setup-dozzle.sh.
#
# What it does (each step no-ops or safely re-runs):
#   1. preflight: docker + compose v2, app network exists, warn on busy ports
#   2. installs compose files + vmagent.yml into MON_DIR (default
#      /opt/bodapp-monitoring — OUTSIDE /opt/bodapp, so the business-logic
#      pipeline's git reset/clean can never touch this state)
#   3. (re)writes the root-owned 0600 .env: Grafana remote-write credentials
#      passed in from the pipeline's GitHub secrets (never echoed), a
#      generated hex password for the DB monitor role (once), DB name
#      introspected from the running postgres container's env
#   4. validates with `docker compose config --quiet` — quiet on purpose, so
#      resolved secrets can never appear in CI logs
#   5. pulls the pinned images and brings the stack up
#   6. health gates, all host-side over loopback:
#        - every exporter answers /metrics
#        - Caddy serves caddy_http_* on 127.0.0.1:2019/metrics
#        - vmagent's targets are up (≥4/5 jobs) and remote_write shows no
#          auth/transport errors in its recent logs (credentials check)
#        - every monitoring port binds 127.0.0.1 ONLY (public-internet test)
#   7. prints the series-count query to verify the Grafana Cloud free-tier
#      budget (10k active series) from the portal after the first hour
#
# It NEVER touches the app container, Caddy's config, the database container
# or the app .env.  Called ONLY by .github/workflows/infra.yml (assets copied
# to /tmp/bodapp-monitoring) or by hand.
#
# Inputs (env, all optional if .env already holds them):
#   GF_PROM_URL, GF_PROM_USER, GF_PROM_PASSWORD - Grafana Cloud remote write
#   MON_DIR        install dir            (default /opt/bodapp-monitoring)
#   APP_NETWORK    app compose network    (default bodapp_default)
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MON_DIR="${MON_DIR:-/opt/bodapp-monitoring}"
APP_NETWORK="${APP_NETWORK:-bodapp_default}"
APP_DB_CONTAINER="${APP_DB_CONTAINER:-bodapp-postgres}"

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"
fail() { echo "FATAL: $*" >&2; exit 1; }
warn() { echo "WARN: $*" >&2; }

# --- 1. preflight -----------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker not found on this host"
docker info >/dev/null 2>&1 || fail "cannot talk to the docker daemon (run as root?)"
docker compose version >/dev/null 2>&1 || fail "docker compose v2 plugin not found"
command -v curl >/dev/null 2>&1 || fail "curl not found on this host"

if ! docker network inspect "$APP_NETWORK" >/dev/null 2>&1; then
  fail "network '$APP_NETWORK' does not exist — deploy the app stack first (postgres_exporter needs it to reach the database)."
fi
for p in 8429 9187 9100 8081; do
  if ss -ltn 2>/dev/null | grep -qE "127\.0\.0\.1:$p |0\.0\.0\.0:$p |\[::\]:$p "; then
    if ! docker ps --format '{{.Names}}' | grep -q '^monitoring-'; then
      warn "port $p is already bound by a foreign process and no monitoring container is running — 'docker compose up' will fail on the bind; free the port first."
    fi
  fi
done

# --- 2. install files -------------------------------------------------------
echo "==> [monitoring] installing into $MON_DIR"
$SUDO install -d -m 0755 "$MON_DIR"
$SUDO install -m 0644 "$HERE/docker-compose.yml" \
                      "$HERE/docker-compose.statements.yml" \
                      "$HERE/vmagent.yml" "$MON_DIR/"

# --- 3. .env (root-owned, 0600) --------------------------------------------
ENV_FILE="$MON_DIR/.env"
umask 077
[ -f "$ENV_FILE" ] || $SUDO touch "$ENV_FILE"

set_kv() { # key value — value empty ⇒ leave existing line untouched
  local k="$1" v="${2:-}"
  [ -z "$v" ] && return 0
  if $SUDO grep -q "^$k=" "$ENV_FILE"; then
    $SUDO sed -i "s|^$k=.*|$k=$v|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$k" "$v" | $SUDO tee -a "$ENV_FILE" >/dev/null
  fi
}

# Grafana credentials: take the passed-in values, else keep what is stored.
if ! $SUDO grep -q '^GF_PROM_URL=' "$ENV_FILE" || [ -n "${GF_PROM_URL:-}" ]; then
  [ -n "${GF_PROM_URL:-}" ] || fail "GF_PROM_URL not set and $ENV_FILE has no stored value. Add the Grafana Cloud secrets (see deploy/infra.env.example)."
fi
set_kv GF_PROM_URL "${GF_PROM_URL:-}"
set_kv GF_PROM_USER "${GF_PROM_USER:-}"
set_kv GF_PROM_PASSWORD "${GF_PROM_PASSWORD:-}"
$SUDO grep -q '^GF_PROM_PASSWORD=' "$ENV_FILE" || fail "no Grafana Cloud write credentials (GF_PROM_PASSWORD)"

# DB monitor role password: generated ONCE, URL-safe hex, stored in .env only.
if ! $SUDO grep -qE '^PG_MON_PASSWORD=.+' "$ENV_FILE"; then
  NEWPW="$(openssl rand -hex 16 2>/dev/null || head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  set_kv PG_MON_PASSWORD "$NEWPW"
fi
set_kv PG_MON_USER "bodapp_monitor"
# Database name from the running postgres container (not from the app tree).
if ! $SUDO grep -q '^PG_MON_DB=' "$ENV_FILE"; then
  PDB="$(docker exec "$APP_DB_CONTAINER" env 2>/dev/null | sed -n 's/^POSTGRES_DB=//p' | head -1)"
  set_kv PG_MON_DB "${PDB:-bodapp}"
fi
$SUDO chmod 600 "$ENV_FILE"
echo "    .env present (mode 600, $(grep -c '=' "$ENV_FILE") keys — values not printed)"

# --- 4. validate (quiet: secrets must not reach the log) --------------------
FILES=(-f docker-compose.yml)
if [ -f "$MON_DIR/statements.enabled" ]; then
  FILES+=(-f docker-compose.statements.yml)
  echo "    pg_stat_statements variant: ON"
else
  echo "    pg_stat_statements variant: OFF (enable via setup-postgres-monitoring.sh)"
fi
cd "$MON_DIR"
echo "==> [monitoring] docker compose config --quiet"
docker compose "${FILES[@]}" config --quiet

# --- 5. pull + up ------------------------------------------------------------
echo "==> [monitoring] pulling pinned images"
docker compose "${FILES[@]}" pull -q
echo "==> [monitoring] starting stack"
docker compose "${FILES[@]}" up -d

# --- 6. health gates --------------------------------------------------------
wait_http() { # url grep-pattern(optional) → 0 when healthy within 30s
  local url="$1" pat="${2:-}" i
  for i in $(seq 1 30); do
    if body="$(curl -fsS --max-time 3 "$url" 2>/dev/null)"; then
      if [ -z "$pat" ] || printf '%s' "$body" | grep -q "$pat"; then return 0; fi
    fi
    sleep 1
  done
  return 1
}

echo "==> [monitoring] health gates (host loopback)"
ok=1
wait_http "http://127.0.0.1:9187/metrics" '^pg_up'                || { warn "postgres_exporter not answering :9187"; ok=0; }
wait_http "http://127.0.0.1:9100/metrics" '^node_uname_info'      || { warn "node_exporter not answering :9100"; ok=0; }
wait_http "http://127.0.0.1:8081/healthz"                          || { warn "cAdvisor not answering :8081/healthz"; ok=0; }
wait_http "http://127.0.0.1:8429/metrics" '^vmagent'              || { warn "vmagent not answering :8429"; ok=0; }

# Caddy metrics (needs the `metrics` option in the Caddyfile — deployed by the
# same infra workflow before this step).
if wait_http "http://127.0.0.1:2019/metrics" 'caddy_http_requests_total'; then
  echo "    caddy metrics: OK (127.0.0.1:2019)"
else
  warn "caddy metrics missing on 127.0.0.1:2019 — is the 'metrics' global option deployed? (deploy/caddy/Caddyfile + re-run the infra workflow)"
  ok=0
fi

# vmagent scrape targets.
targets="$(curl -fsS --max-time 5 'http://127.0.0.1:8429/api/v1/targets' 2>/dev/null || true)"
if [ -n "$targets" ]; then
  up_jobs="$(printf '%s' "$targets" | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
tg=(d.get("data") or {}).get("activeTargets") or []
print(",".join(sorted(t.get("labels",{}).get("job","?") for t in tg if t.get("health")=="up")))' 2>/dev/null || true)"
  echo "    vmagent targets up: ${up_jobs:-<none parsed>}"
  n_up="$(printf '%s' "$up_jobs" | awk -F, '{print NF}')"
  [ "${up_jobs:-}" = "" ] && n_up=0
  if [ "$n_up" -lt 4 ]; then
    warn "only $n_up/5 scrape jobs are up — see http://127.0.0.1:8429/targets"
    ok=0
  fi
else
  warn "vmagent targets API unreachable"; ok=0
fi

# remote_write credential/transport errors (vmagent never logs the password).
if docker logs --since 3m monitoring-vmagent 2>&1 | grep -iE 'remoteWrite|remote_write' | grep -iE 'error|failed|401|403|denied|refused' >/dev/null 2>&1; then
  echo "    recent vmagent remote_write errors:" >&2
  docker logs --since 3m monitoring-vmagent 2>&1 | grep -iE 'remoteWrite|remote_write' | grep -iE 'error|failed|401|403|denied|refused' | tail -5 >&2
  fail "vmagent cannot ship to Grafana Cloud — check GRAFANA_PROM_URL / _USER / _PASSWORD secrets"
fi
echo "    remote_write: no errors in the last 3m"

# loopback-only assertion: no monitoring port may listen beyond 127.0.0.1.
for p in 8429 9187 9100 8081; do
  if ss -ltn 2>/dev/null | grep -E "[:.]$p " | grep -vq '127\.0\.0\.1'; then
    warn "port $p has a NON-loopback listener:"; ss -ltnp 2>/dev/null | grep -E "[:.]$p " >&2; ok=0
  fi
done
[ "$ok" = 1 ] || fail "one or more monitoring health gates failed (see warnings above)"

# --- 7. summary --------------------------------------------------------------
echo "==> [monitoring] OK"
docker ps --filter name=monitoring- --format '    {{.Names}}  {{.Status}}'
cat <<'EOF'
    Verify against the Grafana Cloud free tier (10k active series) after ~1h
    in the portal's Explore (Prometheus datasource):
        count by (job) ({environment="production", service="bodapp"})
    Total must stay under 10000; trim with cAdvisor's --disable_metrics or
    per-target relabeling if it ever grows (see README.md).
    Next: import deploy/monitoring/grafana/bodapp-dashboard.json and the
    alert rules from deploy/monitoring/grafana/alerts.md in the portal.
EOF
