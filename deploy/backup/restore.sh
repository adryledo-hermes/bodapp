#!/usr/bin/env bash
# ------------------------------------------------------------------
# Bodapp backup RESTORE — the easy path (INFRASTRUCTURE)
#
#   restore.sh                     # newest backup → disposable Postgres
#                                  #   (bodapp-pg-restore, loopback :5433)
#   restore.sh list                # what's in the bucket, newest last
#   restore.sh <file>              # a specific one (remote name or local
#                                  #   .enc / already-decrypted .dump)
#   restore.sh down                # remove the disposable database
#   restore.sh --test-restore      # automated weekly: restore + smoke
#                                  #   checks + teardown + report to R2
#   restore.sh latest --into-prod --yes   # DESTRUCTIVE: into the LIVE db
#                                  #   (prints the app stop/start procedure;
#                                  #    this script never touches the app)
#
# Decryption needs the age PRIVATE key — default
# /root/.config/bodapp-backup/backup.key, override with --key-file PATH.
# That file is a convenience copy for the VPS: the authoritative key
# lives OUTSIDE the VPS and the bucket (README §Keys).
# ------------------------------------------------------------------
set -Eeuo pipefail

usage() { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; }

MODE_SRC="" TEST=0 LIST=0 DOWN=0 INTO_PROD=0 YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    down) DOWN=1 ;;
    list) LIST=1 ;;
    --test-restore) TEST=1 ;;
    --into-prod) INTO_PROD=1 ;;
    --yes) YES=1 ;;
    --key-file) AGE_KEY_FILE="$2"; shift ;;
    -*) echo "unknown flag: $1 (see --help)" >&2; exit 2 ;;
    *) MODE_SRC="$1" ;;
  esac
  shift
done

log() { echo "[restore] $*"; }

ENVF="${BACKUP_ENV:-/opt/bodapp-backup/backup.env}"
[ -f "$ENVF" ] || { echo "FATAL: $ENVF not found" >&2; exit 1; }
# shellcheck disable=SC1090
. "$ENVF"

: "${R2_BUCKET:?R2_BUCKET missing in $ENVF}"
R2_REMOTE="${R2_REMOTE:-bodapp-r2}"
APP_DB_CONTAINER="${APP_DB_CONTAINER:-bodapp-postgres}"
RCLONE_CONFIG="${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}"
AGE_KEY_FILE="${AGE_KEY_FILE:-/root/.config/bodapp-backup/backup.key}"
RESTORE_CONTAINER="${RESTORE_CONTAINER:-bodapp-pg-restore}"
RESTORE_PORT="${RESTORE_PORT:-5433}"
export RCLONE_CONFIG
BUCKET="$R2_REMOTE:$R2_BUCKET"

alert() {
  local msg="[bodapp-restore] $1"
  echo "ALERT: $msg" >&2
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    curl -fsS -m 15 -X POST -H 'Content-Type: application/json' \
      -d "{\"content\":\"$msg\",\"text\":\"$msg\"}" \
      "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
}

[ "$DOWN" = 1 ] && { docker rm -f "$RESTORE_CONTAINER" >/dev/null 2>&1 || true; log "disposable database removed"; exit 0; }

for cmd in docker rclone age; do
  command -v "$cmd" >/dev/null || { echo "FATAL: missing dependency '$cmd'" >&2; exit 1; }
done
[ -f "$RCLONE_CONFIG" ] || { echo "FATAL: rclone config missing: $RCLONE_CONFIG" >&2; exit 1; }

if [ "$LIST" = 1 ]; then
  log "backups in $BUCKET (oldest → newest):"
  rclone lsl "$BUCKET" | grep '\.dump\.enc$' || { echo "(none)"; exit 1; }
  exit 0
fi

# --- resolve the source ----------------------------------------------------
REMOTE=1
if [ -z "$MODE_SRC" ] || [ "$MODE_SRC" = latest ]; then
  MODE_SRC="$(rclone lsf "$BUCKET" --files-only --sort name | grep '\.dump\.enc$' | tail -n 1 || true)"
  [ -n "$MODE_SRC" ] || { alert "no *.dump.enc found in $BUCKET"; exit 1; }
  log "newest backup: $MODE_SRC"
elif [ -f "$MODE_SRC" ]; then
  REMOTE=0
  log "using local file: $MODE_SRC"
else
  log "using remote backup: $MODE_SRC"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- fetch + decrypt -------------------------------------------------------
case "$MODE_SRC" in
  *.dump)
    DUMP="$MODE_SRC"   # already-decrypted dump, use as-is
    ;;
  *.enc)
    SRC_ENC="$TMP/$MODE_SRC"
    if [ "$REMOTE" = 1 ]; then
      rclone copyto "$BUCKET/$MODE_SRC" "$SRC_ENC" >/dev/null
    else
      cp "$MODE_SRC" "$SRC_ENC"
    fi
    [ -f "$AGE_KEY_FILE" ] || {
      alert "age private key not found at $AGE_KEY_FILE — needed to decrypt. Install it (README §Keys) or pass --key-file PATH"
      exit 1
    }
    DUMP="$TMP/data.dump"
    age --decrypt --identity "$AGE_KEY_FILE" --output "$DUMP" "$SRC_ENC"
    [ -s "$DUMP" ] || { alert "decrypted output empty"; exit 1; }
    ;;
  *)
    echo "FATAL: unrecognized source '$MODE_SRC' (want *.dump.enc, *.dump, or 'latest')" >&2
    exit 2
    ;;
esac

# --- disposable restore (default, and the automated test) -------------------
IMAGE="$(docker inspect -f '{{.Config.Image}}' "$APP_DB_CONTAINER" 2>/dev/null || true)"
IMAGE="${IMAGE:-postgres:16-alpine}"

run_disposable() {
  docker rm -f "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$RESTORE_CONTAINER" \
    -e POSTGRES_USER=bodapp -e POSTGRES_PASSWORD=restore-test-only \
    -e POSTGRES_DB=bodapp \
    -p "127.0.0.1:${RESTORE_PORT}:5432" "$IMAGE" >/dev/null \
    || { alert "could not start the disposable postgres container ($IMAGE)"; return 1; }
  local i
  for i in $(seq 30); do
    docker exec "$RESTORE_CONTAINER" pg_isready -U bodapp -d bodapp >/dev/null 2>&1 && break
    if [ "$i" = 30 ]; then
      docker rm -f "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
      alert "disposable postgres never became ready"
      return 1
    fi
    sleep 1
  done
  # Fresh empty DB: restore errors would be real. pg_restore still exits 0
  # with warnings sometimes, so the smoke check below is the hard gate.
  docker exec -i "$RESTORE_CONTAINER" pg_restore -U bodapp -d bodapp --no-owner < "$DUMP" \
    || log "pg_restore returned non-zero — continuing to smoke checks (they are the gate)"
  return 0
}

smoke_checks() {
  local tables total
  tables="$(docker exec "$RESTORE_CONTAINER" psql -U bodapp -d bodapp -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
  if [ "${tables:-0}" -lt 1 ]; then
    alert "smoke check FAILED: 0 tables in the restored database"
    return 1
  fi
  total="$(docker exec -i "$RESTORE_CONTAINER" psql -U bodapp -d bodapp -tA 2>/dev/null <<'SQL' | awk '{s+=$1} END{print s+0}'
SELECT format('SELECT count(*) FROM public.%I', c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 1 LIMIT 300 \gexec
SQL
)"
  log "smoke checks: $tables tables, ~$total rows"
}

if [ "$TEST" = 1 ]; then
  T0="$SECONDS"
  run_disposable
  SMOKE_OK=1
  smoke_checks || SMOKE_OK=0
  TABLES="$(docker exec "$RESTORE_CONTAINER" psql -U bodapp -d bodapp -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null || echo 0)"
  docker rm -f "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
  RESULT=ok; [ "$SMOKE_OK" = 1 ] || RESULT=failed
  cat > "$TMP/test-restore.json" <<JSON
{
  "last_test_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source_name": "$MODE_SRC",
  "tables": ${TABLES:-0},
  "result": "$RESULT",
  "duration_s": $((SECONDS - T0))
}
JSON
  rclone copyto "$TMP/test-restore.json" "$BUCKET/test-restore.json" >/dev/null
  if [ "$RESULT" != ok ]; then
    alert "WEEKLY TEST-RESTORE FAILED for $MODE_SRC (disposable DB, 0 tables?)"
    exit 1
  fi
  log "TEST-RESTORE OK: $MODE_SRC → disposable DB ($((SECONDS - T0))s), report uploaded to R2"
  exit 0
fi

# --- interactive / explicit restore ----------------------------------------
if [ "$INTO_PROD" = 1 ]; then
  if [ "$YES" != 1 ]; then
    cat >&2 <<'EOM'
REFUSING: --into-prod overwrites the LIVE database.
Re-run with --yes if you really mean it. Procedure (this script never
touches the app container — stop/start it yourself):

  docker stop bodapp-app
  sudo /opt/bodapp-backup/restore.sh latest --into-prod --yes
  docker start bodapp-app
EOM
    exit 2
  fi
  DB_USER="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$APP_DB_CONTAINER" 2>/dev/null \
    | awk -F= '$1=="POSTGRES_USER"{print $2}')"; DB_USER="${DB_USER:-bodapp}"
  DB_NAME="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$APP_DB_CONTAINER" 2>/dev/null \
    | awk -F= '$1=="POSTGRES_DB"{print $2}')"; DB_NAME="${DB_NAME:-bodapp}"
  log "RESTORING INTO THE LIVE DATABASE: $APP_DB_CONTAINER / $DB_NAME"
  docker exec -i "$APP_DB_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" \
    --clean --if-exists --no-owner < "$DUMP" \
    || alert "pg_restore into prod reported errors — VERIFY THE APP before starting it"
  tables="$(docker exec "$APP_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
  [ "${tables:-0}" -ge 1 ] || { alert "prod restore smoke check: 0 tables — DO NOT start the app, investigate"; exit 1; }
  log "PROD RESTORE DONE ($tables tables). Start the app: docker start bodapp-app"
  exit 0
fi

run_disposable
smoke_checks || exit 1
log "RESTORE OK — disposable database is up:"
log "  connect:  docker exec -it $RESTORE_CONTAINER psql -U bodapp -d bodapp"
log "  from host: psql -h 127.0.0.1 -p $RESTORE_PORT -U bodapp -d bodapp"
log "  remove:   sudo /opt/bodapp-backup/restore.sh down"
