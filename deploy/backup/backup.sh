#!/usr/bin/env bash
# ------------------------------------------------------------------
# Bodapp → Cloudflare R2 daily backup — INFRASTRUCTURE ONLY
#
#   pg_dump -Fc (inside the DB container → version-matched)   →
#   age encryption (PUBLIC key only ever on this host)         →
#   rclone upload via the R2 S3 API (bucket-scoped token)      →
#   retention prune (≤ RETENTION_DAYS old AND ≤ MAX_TOTAL_BYTES) →
#   manifest.json (what the independent staleness prober reads)
#
# Runs from systemd timer bodapp-backup.timer (root, daily 03:30)
# or manually: sudo /opt/bodapp-backup/backup.sh
#
# EVERY failure path alerts: stderr (journalctl -u bodapp-backup.service)
# plus optional ALERT_WEBHOOK_URL (Discord {"content":…} / Slack {"text":…}
# compatible), then exits 1. Success is one log line + a manifest upload.
#
# The decryption key never travels with the data: R2 holds ciphertext
# only; this host needs the public key just to encrypt.
# ------------------------------------------------------------------
set -Eeuo pipefail

ENVF="${BACKUP_ENV:-/opt/bodapp-backup/backup.env}"
[ -f "$ENVF" ] || { echo "FATAL: $ENVF not found (run deploy/backup/setup-backup.sh)" >&2; exit 1; }
# shellcheck disable=SC1090
. "$ENVF"

: "${R2_BUCKET:?R2_BUCKET missing in $ENVF}"
: "${AGE_PUBKEY:?AGE_PUBKEY missing in $ENVF}"
R2_REMOTE="${R2_REMOTE:-bodapp-r2}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
# Hard cap on the SUM of all dumps kept in R2 (decimal bytes = 10 GB,
# Cloudflare's free tier). Over the cap → oldest dumps deleted until the
# remainder is under it; the newest dump is never removed.
MAX_TOTAL_BYTES="${MAX_TOTAL_BYTES:-10000000000}"
KEEP_LOCAL="${KEEP_LOCAL:-3}"
APP_DB_CONTAINER="${APP_DB_CONTAINER:-bodapp-postgres}"
LOCAL_DIR="${LOCAL_DIR:-/opt/bodapp-backup/local}"
RCLONE_CONFIG="${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}"
export RCLONE_CONFIG

log() { echo "[backup] $*"; }

alert() {
  local msg="[bodapp-backup] $1"
  echo "ALERT: $msg" >&2
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    curl -fsS -m 15 -X POST -H 'Content-Type: application/json' \
      -d "{\"content\":\"$msg\",\"text\":\"$msg\"}" \
      "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 \
      || echo "ALERT: webhook delivery failed (backup result unchanged)" >&2
  fi
}
trap 'alert "FAILED (line $LINENO): $BASH_COMMAND"' ERR

for cmd in docker rclone age python3; do
  command -v "$cmd" >/dev/null \
    || { alert "missing dependency '$cmd' — run: sudo bash deploy/backup/setup-backup.sh"; exit 1; }
done
[ -f "$RCLONE_CONFIG" ] \
  || { alert "rclone config missing: $RCLONE_CONFIG (setup-backup.sh writes it)"; exit 1; }

# --- database identity: introspected from the container, defaults match ----
# the compose file (POSTGRES_USER/POSTGRES_DB default to 'bodapp').
inspect_env() {
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$APP_DB_CONTAINER" 2>/dev/null \
    | awk -F= -v k="$1" '$1==k{print $2}'
}
DB_USER="$(inspect_env POSTGRES_USER || true)"; DB_USER="${DB_USER:-bodapp}"
DB_NAME="$(inspect_env POSTGRES_DB || true)";   DB_NAME="${DB_NAME:-bodapp}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

START="$SECONDS"
NAME="bodapp-$(date -u +%Y%m%dT%H%M%SZ).dump.enc"

log "dumping '$DB_NAME' from $APP_DB_CONTAINER (user $DB_USER, custom format)"
docker exec "$APP_DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$TMP/raw.dump"
[ -s "$TMP/raw.dump" ] || { alert "pg_dump produced an empty file"; exit 1; }
RAW_SIZE="$(stat -c %s "$TMP/raw.dump")"

log "encrypting with age (recipient-only — no private key on this host needed)"
age --encrypt --recipient "$AGE_PUBKEY" --output "$TMP/$NAME" "$TMP/raw.dump"
[ -s "$TMP/$NAME" ] || { alert "age produced no output"; exit 1; }

log "uploading to r2://$R2_BUCKET/$NAME"
rclone copyto "$TMP/$NAME" "$R2_REMOTE:$R2_BUCKET/$NAME" --retries 3 >/dev/null
# Prove the object is really there — guards against silent remote failures.
BUCKET_LIST="$(rclone lsf "$R2_REMOTE:$R2_BUCKET" --files-only)"
grep -Fxq "$NAME" <<< "$BUCKET_LIST" \
  || { alert "upload verification failed: $NAME not listed in the bucket"; exit 1; }

# A few local copies for instant restores; everything durable lives in R2.
mkdir -p "$LOCAL_DIR"
cp "$TMP/$NAME" "$LOCAL_DIR/$NAME"
mapfile -t LOCALS < <(ls -1t "$LOCAL_DIR"/*.dump.enc 2>/dev/null || true)
for ((i = KEEP_LOCAL; i < ${#LOCALS[@]}; i++)); do
  rm -f "${LOCALS[$i]}"
done

# Retention in R2 — two rules; BOTH only ever touch *.dump.enc:
#   1. age:  drop dumps older than RETENTION_DAYS (default 30).
#   2. size: if MORE THAN ONE dump exists and they sum to
#            >= MAX_TOTAL_BYTES (default 10 GB = R2 free tier), drop the
#            OLDEST until the rest sum to under the cap. The newest dump
#            is NEVER deleted (a restore must always be possible) and a
#            lone dump is never touched.
# manifest.json / test-restore.json are refreshed every run and are
# deliberately NOT pruned. Belt-and-braces: configure an R2 lifecycle
# rule "delete objects older than N+5 days" (README §Retention) so
# nothing grows unbounded even if this script stops.
log "pruning R2 objects older than ${RETENTION_DAYS}d"
rclone delete "$R2_REMOTE:$R2_BUCKET" --min-age "${RETENTION_DAYS}d" --include "*.dump.enc"

log "pruning R2 dumps if they sum to over $(numfmt --to=si "$MAX_TOTAL_BYTES")"
PRUNE_PY='
import json, sys
from datetime import datetime, timezone

cap = int(sys.argv[1])
dumps = [f for f in json.load(sys.stdin) if f["Name"].endswith(".dump.enc")]

def age_key(f):
    # Fail SAFE: an unparseable timestamp sorts as NEWEST, so it is the
    # last thing ever deleted rather than the first.
    try:
        when = datetime.fromisoformat(f["ModTime"].replace("Z", "+00:00"))
        return (0, when, f["Name"])
    except Exception:
        return (1, datetime(1970, 1, 1, tzinfo=timezone.utc), f["Name"])

dumps.sort(key=age_key)  # oldest first
total = sum(f["Size"] for f in dumps)
while len(dumps) > 1 and total >= cap:
    victim = dumps.pop(0)
    total -= victim["Size"]
    print(victim["Name"])
'
PRUNE_VICTIMS="$(rclone lsjson "$R2_REMOTE:$R2_BUCKET" --files-only \
  | python3 -c "$PRUNE_PY" "$MAX_TOTAL_BYTES")"
while IFS= read -r victim; do
  [ -n "$victim" ] || continue
  log "retention: total over $(numfmt --to=si "$MAX_TOTAL_BYTES") — deleting oldest dump $victim"
  rclone deletefile "$R2_REMOTE:$R2_BUCKET/$victim"
done <<< "$PRUNE_VICTIMS"

DUMP_SECS=$((SECONDS - START))
ENC_SIZE="$(stat -c %s "$TMP/$NAME")"
cat > "$TMP/manifest.json" <<JSON
{
  "schema": 1,
  "last_success_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "last_name": "$NAME",
  "last_size_bytes": $ENC_SIZE,
  "last_raw_bytes": $RAW_SIZE,
  "last_dump_seconds": $DUMP_SECS,
  "retention_days": $RETENTION_DAYS
}
JSON
rclone copyto "$TMP/manifest.json" "$R2_REMOTE:$R2_BUCKET/manifest.json" >/dev/null

log "OK: $NAME ($(numfmt --to=iec "$ENC_SIZE" 2>/dev/null || echo "$ENC_SIZE B") encrypted, raw $(numfmt --to=iec "$RAW_SIZE" 2>/dev/null || echo "$RAW_SIZE B"), dump ${DUMP_SECS}s, retention ${RETENTION_DAYS}d)"
