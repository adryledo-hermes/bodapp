#!/usr/bin/env bash
# ------------------------------------------------------------------
# Backup FRESHNESS PROBER — runs on a machine INDEPENDENT of the VPS,
# with a READ-ONLY R2 credential, so that losing the VPS still alerts.
#
#   exit 0 + no output  → everything healthy (safe to run silently)
#   exit 1 + reasons    → alert-worthy (missing / stale / failed)
#
# Checks:
#   1. at least one *.dump.enc exists in the bucket
#   2. newest dump age ≤ MAX_AGE_HOURS (default 48 — one missed day
#      is tolerated, two are not)
#   3. manifest.json last_success_utc agrees (the backup job's own record)
#   4. test-restore.json exists, result == ok, and is ≤ TEST_MAX_DAYS old
#
# Usage (Hermes cron / manual):
#   RCLONE_CONFIG=/path/to/read-only-rclone.conf R2_BUCKET=bodapp-backups \
#     ./check-freshness.sh
# ------------------------------------------------------------------
set -Eeuo pipefail

: "${RCLONE_CONFIG:?set RCLONE_CONFIG to a read-only rclone config file}"
: "${R2_BUCKET:?set R2_BUCKET (e.g. bodapp-backups)}"
R2_REMOTE="${R2_REMOTE:-bodapp-r2}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-48}"
TEST_MAX_DAYS="${TEST_MAX_DAYS:-14}"
export RCLONE_CONFIG

command -v rclone >/dev/null || { echo "FAIL: rclone not installed on this host"; exit 1; }
BUCKET="$R2_REMOTE:$R2_BUCKET"
problems=()

age_hours() { # ISO8601 (…Z) → full hours old; -1 if unparseable
  local e
  e="$(date -u -d "$1" +%s 2>/dev/null)" || { echo -1; return; }
  echo $(( ($(date -u +%s) - e) / 3600 ))
}
jget() { # json-string field from stdin
  python3 -c 'import json,sys; print(json.load(sys.stdin).get(sys.argv[1],""))' "$1" 2>/dev/null || true
}

# --- 1/2. newest dump exists and is fresh ----------------------------------
NEWEST="$(rclone lsf "$BUCKET" --files-only 2>/dev/null | grep '\.dump\.enc$' | tail -n 1 || true)"
if [ -z "$NEWEST" ]; then
  problems+=("FAIL: no *.dump.enc objects in $BUCKET — backups never ran, or everything was pruned")
else
  # lsl line: "<date> <time>  <size> <name>" — last field is the name
  # (bucket filenames never contain spaces).
  TS="$(rclone lsl "$BUCKET" 2>/dev/null | awk -v n="$NEWEST" '$NF == n {print $1" "$2; exit}' || true)"
  H="$(age_hours "${TS:-}")"
  if [ "$H" -lt 0 ]; then
    problems+=("FAIL: cannot parse the timestamp of $NEWEST ('$TS')")
  elif [ "$H" -gt "$MAX_AGE_HOURS" ]; then
    problems+=("FAIL: newest backup is ${H}h old (limit ${MAX_AGE_HOURS}h): $NEWEST")
  fi
fi

# --- 3. the backup job's own success record --------------------------------
if MAN="$(rclone cat "$BUCKET/manifest.json" 2>/dev/null)"; then
  LAST="$(printf '%s' "$MAN" | jget last_success_utc)"
  if [ -z "$LAST" ]; then
    problems+=("FAIL: manifest.json has no last_success_utc")
  else
    H="$(age_hours "$LAST")"
    if [ "$H" -lt 0 ]; then
      problems+=("FAIL: manifest.json last_success_utc unparseable ('$LAST')")
    elif [ "$H" -gt "$MAX_AGE_HOURS" ]; then
      problems+=("FAIL: last successful backup was ${H}h ago (limit ${MAX_AGE_HOURS}h) — the job is failing or stopped")
    fi
  fi
else
  problems+=("FAIL: manifest.json unreadable/missing in $BUCKET")
fi

# --- 4. periodic restore verification --------------------------------------
if TR="$(rclone cat "$BUCKET/test-restore.json" 2>/dev/null)"; then
  RES="$(printf '%s' "$TR" | jget result)"
  TST="$(printf '%s' "$TR" | jget last_test_utc)"
  if [ "$RES" != "ok" ]; then
    problems+=("FAIL: last test-restore result='$RES' (source: $(printf '%s' "$TR" | jget source_name))")
  fi
  D=$(( ($(date -u +%s) - $(date -u -d "${TST:-1970-01-01T00:00:00Z}" +%s)) / 86400 ))
  if [ "$D" -gt "$TEST_MAX_DAYS" ]; then
    problems+=("FAIL: last successful test-restore is ${D}d old (limit ${TEST_MAX_DAYS}d) — weekly restore timer not running")
  fi
else
  problems+=("FAIL: test-restore.json missing — the weekly restore verification never ran")
fi

if [ "${#problems[@]}" -gt 0 ]; then
  printf '%s\n' "${problems[@]}"
  exit 1
fi
exit 0   # healthy: print nothing (silent probers don't spam)
