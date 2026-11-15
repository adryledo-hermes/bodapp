#!/usr/bin/env bash
# ------------------------------------------------------------------
# Provision daily encrypted backups to Cloudflare R2 — INFRASTRUCTURE.
# Idempotent: safe to re-run any time (workflow input `setup_backup`,
# push touching deploy/backup/**, or by hand on the server).
#
#   1. installs age + rclone (apt, static-binary fallback)
#   2. installs scripts into /opt/bodapp-backup + backup.env (from the
#      example; you fill the R2 credentials + age public key ONCE)
#   3. writes root's rclone config (600) pointing at the R2 endpoint —
#      the token must be scoped to the backup bucket only
#   4. installs systemd units; enables the daily timer always, the
#      weekly test-restore timer only if the age PRIVATE key is present
#      (the automated test must decrypt — README §Keys)
#   5. runs ONE real backup end-to-end as the health gate
#
# Fails fast with an exact TODO checklist while backup.env is incomplete.
# ------------------------------------------------------------------
set -Eeuo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR=/opt/bodapp-backup
ENVF=$INSTALL_DIR/backup.env
KEY_FILE=/root/.config/bodapp-backup/backup.key
RCLONE_CONF=/root/.config/rclone/rclone.conf
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

log()  { echo "[setup-backup] $*"; }
fail() { echo "[setup-backup] TODO: $*" >&2; }

# --- 1. dependencies -------------------------------------------------------
if ! command -v age >/dev/null 2>&1; then
  log "installing age (apt)"
  $SUDO apt-get update -qq >/dev/null 2>&1 || true
  $SUDO apt-get install -y -qq age >/dev/null 2>&1 || true
fi
if ! command -v age >/dev/null 2>&1; then
  log "apt age unavailable — installing the official static binary"
  curl -fsSL -o /tmp/age.tgz https://github.com/FiloSottile/age/releases/download/v1.2.1/age-v1.2.1-linux-amd64.tar.gz
  $SUDO tar -xzf /tmp/age.tgz -C /usr/local/bin --strip-components=1 age/age age/age-keygen
fi
if ! command -v rclone >/dev/null 2>&1; then
  log "installing rclone (apt)"
  $SUDO apt-get update -qq >/dev/null 2>&1 || true
  $SUDO apt-get install -y -qq rclone >/dev/null 2>&1 || true
fi
if ! command -v rclone >/dev/null 2>&1; then
  log "apt rclone unavailable — installing the official static binary"
  curl -fsSL -o /tmp/rclone.zip https://downloads.rclone.org/rclone-current-linux-amd64.zip
  python3 - <<'PY'
import zipfile, pathlib
z = zipfile.ZipFile('/tmp/rclone.zip')
src = next(n for n in z.namelist() if n.endswith('/rclone') and n.count('/') == 1)
pathlib.Path('/tmp/rclone.bin').write_bytes(z.read(src))
PY
  $SUDO install -m755 /tmp/rclone.bin /usr/local/bin/rclone
fi
command -v age >/dev/null   || { fail "age could not be installed (apt or static)"; exit 1; }
command -v rclone >/dev/null || { fail "rclone could not be installed (apt or static)"; exit 1; }

# --- 2. install files ------------------------------------------------------
$SUDO mkdir -p "$INSTALL_DIR" "$(dirname "$KEY_FILE")" "$(dirname "$RCLONE_CONF")"
$SUDO install -m755 "$SRC_DIR/backup.sh" "$SRC_DIR/restore.sh" "$SRC_DIR/check-freshness.sh" "$INSTALL_DIR/"
$SUDO install -m644 "$SRC_DIR"/systemd/bodapp-backup.service \
                    "$SRC_DIR"/systemd/bodapp-backup.timer \
                    "$SRC_DIR"/systemd/bodapp-backup-test.service \
                    "$SRC_DIR"/systemd/bodapp-backup-test.timer \
                    /etc/systemd/system/
if [ ! -f "$ENVF" ]; then
  $SUDO install -m600 "$SRC_DIR/backup.env.example" "$ENVF"
  log "created $ENVF — fill the TODO values below, then re-run"
fi

# Read a var from the root-owned env file without eval (works via sudo).
env_get() { $SUDO grep -E "^$1=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- || true; }

# --- 3. validate configuration --------------------------------------------
TODO=0
for v in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET AGE_PUBKEY; do
  val="$(env_get "$v")"
  case "$val" in
    ""|"#"*|"# "*) fail "$v is empty in $ENVF"; TODO=1 ;;
  esac
done
PUB="$(env_get AGE_PUBKEY)"
if [ -n "$PUB" ] && [ "${PUB#age1}" = "$PUB" ]; then
  fail "AGE_PUBKEY must be an age public key (starts with 'age1'), got: ${PUB:0:12}…"; TODO=1
fi
if [ "$TODO" = 1 ]; then
  cat >&2 <<'EOM'
Fill these in (on the server):
  sudo nano /opt/bodapp-backup/backup.env
Get them:
  R2_*            Cloudflare dashboard → R2 → Manage R2 API Tokens →
                  Create API token → Custom permissions:
                  Object Read & Write, resources: ONLY the backup bucket.
                  Account ID: R2 overview page (right sidebar).
  AGE_PUBKEY      the public key from the backup README (private key stays
                  in your password manager — never in this file).
Then re-run:  sudo bash deploy/backup/setup-backup.sh
EOM
  exit 1
fi

ACCT="$(env_get R2_ACCOUNT_ID)"
AK="$(env_get R2_ACCESS_KEY_ID)"
SK="$(env_get R2_SECRET_ACCESS_KEY)"
BUCKET="$(env_get R2_BUCKET)"

# --- 4. rclone config (root, 600) -----------------------------------------
$SUDO tee "$RCLONE_CONF" >/dev/null <<CONF
[bodapp-r2]
type = s3
provider = Other
region = auto
access_key_id = $AK
secret_access_key = $SK
endpoint = https://$ACCT.r2.cloudflarestorage.com
CONF
$SUDO chmod 600 "$RCLONE_CONF"
log "rclone config written ($RCLONE_CONF, token scoped to r2://$BUCKET)"

if ! RCLONE_CONFIG="$RCLONE_CONF" rclone lsf "bodapp-r2:$BUCKET" --files-only >/dev/null 2>/tmp/r2err; then
  fail "cannot list r2://$BUCKET with the configured token:"
  sed 's/^/    /' /tmp/r2err >&2 || true
  echo "    Check: bucket exists; token is scoped to THIS bucket; Object Read & Write." >&2
  exit 1
fi
log "R2 reachability verified (bucket list OK)"

# --- 5. age private key (only for the automated weekly test-restore) ------
if [ -f "$KEY_FILE" ] && [ -s "$KEY_FILE" ]; then
  log "age private key present → weekly test-restore timer will be enabled"
  KEY_PRESENT=1
else
  log "NOTE: no private key at $KEY_FILE — daily backups still work (public"
  log "      key only), but the weekly TEST-RESTORE stays disabled."
  log "      To enable: sudo tee $KEY_FILE  (paste the key), chmod 600, re-run."
  KEY_PRESENT=0
fi

# --- 6. systemd timers -----------------------------------------------------
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now bodapp-backup.timer
if [ "$KEY_PRESENT" = 1 ]; then
  $SUDO systemctl enable --now bodapp-backup-test.timer
else
  $SUDO systemctl disable --now bodapp-backup-test.timer >/dev/null 2>&1 || true
fi

# --- 7. health gate: one real end-to-end backup ----------------------------
log "running the first backup end-to-end (dump → encrypt → upload → verify)…"
$SUDO bash "$INSTALL_DIR/backup.sh" || { fail "first backup FAILED — see the output above"; exit 1; }

log "next fires:"
$SUDO systemctl list-timers 'bodapp-backup*' --no-pager 2>/dev/null | sed -n '1,4p'
log "SETUP OK — daily backups active. Restore anytime: sudo $INSTALL_DIR/restore.sh"
