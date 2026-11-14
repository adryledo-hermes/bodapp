#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Bodapp — PostgreSQL monitoring preparation (EXTRA-PG privileges + role).
# INFRA ONLY — the only script in the repo that may restart the DATABASE, and
# it does so ONLY when explicitly approved (see restart gate below).
#
# What it does (idempotent):
#   1. reads the superuser + db name from the RUNNING container's env
#      (never from /opt/bodapp — the infra pipeline must not touch the app tree)
#   2. ensures a root-owned .env exists with a generated hex password for the
#      dedicated monitoring role (never echoed anywhere)
#   3. pg_stat_statements status:
#        a) preloaded      → nothing disruptive; proceed
#        b) NOT preloaded  → prints the exact plan and EXITS 0 unless
#                            MON_ALLOW_RESTART=1 (the infra workflow input
#                            `enable_pg_stat_statements` — that checkbox IS
#                            the approval for the restart)
#                            With approval:
#                              ALTER SYSTEM SET shared_preload_libraries
#                                (appending, preserving any existing entries)
#                              ALTER SYSTEM SET pg_stat_statements.max = 100
#                                (bounds exporter cardinality: default 5000)
#                              docker restart bodapp-postgres   ← the one
#                                disruptive act: a few seconds of DB blip;
#                                the app reconnects automatically and
#                                /healthz is DB-free, so Caddy keeps routing
#   4. CREATE EXTENSION IF NOT EXISTS pg_stat_statements  (app db ONLY)
#   5. creates/updates role `bodapp_monitor`:
#        CONNECT + pg_read_all_stats  (narrow — preferred)
#        self-test as that role (activity, statements, db size, settings);
#        ONLY if a test fails → GRANT pg_monitor and re-test
#   6. audits the role (superuser/createrole/createdb flags, table grants)
#      and writes the statements.enabled marker for setup-monitoring.sh
#
# Never prints the password; SQL is piped to psql on stdin (not argv).
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MON_DIR="${MON_DIR:-/opt/bodapp-monitoring}"
APP_DB_CONTAINER="${APP_DB_CONTAINER:-bodapp-postgres}"
MON_ROLE="${MON_ROLE:-bodapp_monitor}"
MON_ALLOW_RESTART="${MON_ALLOW_RESTART:-0}"
MARKER="$MON_DIR/statements.enabled"
STMT_MAX="${STMT_MAX:-100}"

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"
fail() { echo "FATAL: $*" >&2; exit 1; }
warn() { echo "WARN: $*" >&2; }

# --- 1. preflight -----------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker not found"
docker info >/dev/null 2>&1 || fail "cannot talk to the docker daemon (run as root?)"
docker ps --format '{{.Names}}' | grep -qx "$APP_DB_CONTAINER" \
  || fail "container '$APP_DB_CONTAINER' is not running — deploy the app first."

# Superuser + db from the container's env (POSTGRES_USER is superuser in the
# official image). Values are not secrets.
PU="$(docker exec "$APP_DB_CONTAINER" env | sed -n 's/^POSTGRES_USER=//p' | head -1)"
PDB="$(docker exec "$APP_DB_CONTAINER" env | sed -n 's/^POSTGRES_DB=//p' | head -1)"
PU="${PU:-bodapp}"; PDB="${PDB:-bodapp}"
echo "==> [pg-monitor] container=$APP_DB_CONTAINER superuser=$PU db=$PDB"

psql_as_superuser() { # [psql args…] — SQL on stdin
  docker exec -i "$APP_DB_CONTAINER" psql -U "$PU" -d "$PDB" -v ON_ERROR_STOP=1 -q "$@"
}
psql_q() { docker exec -i "$APP_DB_CONTAINER" psql -U "$PU" -d "$PDB" -tAc "$1"; }

# --- 2. root-owned .env with the role password ------------------------------
ENV_FILE="$MON_DIR/.env"
umask 077
$SUDO install -d -m 0755 "$MON_DIR"
[ -f "$ENV_FILE" ] || $SUDO touch "$ENV_FILE"
if ! $SUDO grep -qE '^PG_MON_PASSWORD=.+' "$ENV_FILE"; then
  NEWPW="$(openssl rand -hex 16 2>/dev/null || head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  printf 'PG_MON_PASSWORD=%s\n' "$NEWPW" | $SUDO tee -a "$ENV_FILE" >/dev/null
fi
$SUDO chmod 600 "$ENV_FILE"
MON_PW="$($SUDO sed -n 's/^PG_MON_PASSWORD=//p' "$ENV_FILE" | head -1)"
[ -n "$MON_PW" ] || fail "could not read PG_MON_PASSWORD from $ENV_FILE"
if ! $SUDO grep -q '^PG_MON_DB=' "$ENV_FILE"; then
  printf 'PG_MON_DB=%s\n' "$PDB" | $SUDO tee -a "$ENV_FILE" >/dev/null
fi

# --- 3. shared_preload_libraries / pg_stat_statements ------------------------
PRELOAD="$(psql_q 'SHOW shared_preload_libraries;' || true)"
echo "    shared_preload_libraries = '${PRELOAD:-}'"

if ! printf '%s' "$PRELOAD" | grep -q 'pg_stat_statements'; then
  if [ "$MON_ALLOW_RESTART" != "1" ]; then
    cat <<EOF
==> [pg-monitor] pg_stat_statements is NOT loaded — PLAN (not applied):
      ALTER SYSTEM SET shared_preload_libraries = '${PRELOAD:+$PRELOAD,}pg_stat_statements';
      ALTER SYSTEM SET pg_stat_statements.max = $STMT_MAX;
      docker restart $APP_DB_CONTAINER     # seconds-level DB blip, approved via workflow input
      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;   # app database only
    A database RESTART is required (preload happens at startup) — this run made
    NO database changes. Approve via: Infrastructure workflow → Run workflow →
    ☑ enable_pg_stat_statements (or MON_ALLOW_RESTART=1 for a manual run),
    at a moment a ~5s connection blip is acceptable.
EOF
    rm -f "$MARKER"
    exit 0
  fi

  NEW_PRELOAD="${PRELOAD:+$PRELOAD,}pg_stat_statements"
  echo "==> [pg-monitor] APPROVED restart: setting preload + bounded statement stats"
  psql_as_superuser <<EOF
ALTER SYSTEM SET shared_preload_libraries = '$NEW_PRELOAD';
ALTER SYSTEM SET pg_stat_statements.max = $STMT_MAX;
EOF
  echo "    restarting $APP_DB_CONTAINER (app reconnects automatically; /healthz is DB-free)..."
  docker restart "$APP_DB_CONTAINER" >/dev/null
  ready=""
  for _ in $(seq 1 45); do
    if docker exec "$APP_DB_CONTAINER" pg_isready -U "$PU" -d "$PDB" >/dev/null 2>&1; then ready=1; break; fi
    sleep 2
  done
  [ -n "$ready" ] || fail "postgres did not become ready within 90s — inspect: docker logs $APP_DB_CONTAINER"
  PRELOAD="$(psql_q 'SHOW shared_preload_libraries;')"
  printf '%s' "$PRELOAD" | grep -q 'pg_stat_statements' || fail "preload did not take effect"
  echo "    ready — preload confirmed"
fi

# --- 4. extension (app database only) ----------------------------------------
psql_q "SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements'" | grep -q 1 \
  || { echo "    creating extension pg_stat_statements in '$PDB'";
       psql_as_superuser <<<"CREATE EXTENSION IF NOT EXISTS pg_stat_statements;" >/dev/null; }
echo "    extension: present"

# --- 5. role + minimal grants + self-test ------------------------------------
if ! psql_q "SELECT 1 FROM pg_roles WHERE rolname='$MON_ROLE'" | grep -q 1; then
  psql_as_superuser <<EOF
CREATE ROLE $MON_ROLE LOGIN PASSWORD '$MON_PW' CONNECTION LIMIT 5;
EOF
  echo "    role $MON_ROLE: created"
else
  psql_as_superuser <<EOF
ALTER ROLE $MON_ROLE PASSWORD '$MON_PW' CONNECTION LIMIT 5;
EOF
  echo "    role $MON_ROLE: password synced from .env"
fi
psql_as_superuser <<EOF
GRANT CONNECT ON DATABASE "$PDB" TO $MON_ROLE;
GRANT pg_read_all_stats TO $MON_ROLE;
EOF

run_tests() { # returns 0 iff every self-test passes as the monitor role
  local t
  for t in \
    'SELECT count(*) FROM pg_stat_activity;' \
    'SELECT count(*) FROM pg_stat_statements;' \
    'SELECT pg_database_size(current_database());' \
    "SELECT setting FROM pg_settings WHERE name='max_connections';" ; do
    # NOTE: one -c with BOTH statements — each separate -c flag would open a
    # NEW connection and SET ROLE would not carry over (tests would run as
    # superuser and pass vacuously).
    if ! docker exec -i "$APP_DB_CONTAINER" psql -U "$PU" -d "$PDB" -q -v ON_ERROR_STOP=1 \
         -c "SET ROLE $MON_ROLE; $t" >/dev/null 2>&1; then
      echo "    FAIL: SET ROLE $MON_ROLE; $t"
      return 1
    fi
  done
  return 0
}

if run_tests; then
  echo "    privileges: pg_read_all_stats SUFFICIENT (narrow grant kept)"
else
  warn "pg_read_all_stats was not sufficient — escalating to pg_monitor (read-only monitoring bundle) and re-testing"
  psql_as_superuser <<<"GRANT pg_monitor TO $MON_ROLE;"
  run_tests || fail "even pg_monitor cannot run the required statistics queries — see failures above"
  echo "    privileges: pg_monitor required — granted (no superuser/createrole/createdb)"
fi

# --- 6. audit + marker -------------------------------------------------------
echo "==> [pg-monitor] role audit (must show: LOGIN only, no elevated flags, no table grants):"
docker exec -i "$APP_DB_CONTAINER" psql -U "$PU" -d "$PDB" -q <<EOF
SELECT rolname, rolsuper AS super, rolcreaterole AS createrole,
       rolcreatedb AS createdb, rolbypassrls AS bypassrls, rolconnlimit AS conn_limit
FROM pg_roles WHERE rolname = '$MON_ROLE';
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = '$MON_ROLE' AND table_schema NOT IN ('pg_catalog','information_schema');
EOF
STMTS="$(psql_q 'SELECT count(*) FROM pg_stat_statements;')"
echo "    pg_stat_statements rows tracked: $STMTS (grows as the app runs queries)"

# Marker picked up by setup-monitoring.sh → enables the statements variant.
printf 'enabled=%s\npreload=%s\n' "$(date -u +%FT%TZ)" "$PRELOAD" | $SUDO tee "$MARKER" >/dev/null
$SUDO chmod 600 "$MARKER"
echo "==> [pg-monitor] OK — marker written; setup-monitoring.sh will start the exporter with --collector.stat_statements"
