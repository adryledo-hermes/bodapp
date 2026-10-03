#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Bodapp — idempotent Caddy provisioning. Safe to run on EVERY deploy.
#
# Driven by two GitHub environment secrets (see .github/workflows/deploy.yml):
#   CADDY_DOMAIN - public hostname, e.g. app.example.com
#   CADDY_EMAIL   - ACME/Let's Encrypt contact email
#
# What it does (each step no-ops when already done):
#   1. validates the two values (fail fast, not at cert-issuance time)
#   2. installs Caddy from the official repo if the binary is missing
#   3. renders the committed template (same directory: Caddyfile) with the
#      domain/email — no hand-editing of /etc/caddy/Caddyfile, ever
#   4. `caddy validate`s the render BEFORE replacing the live file
#   5. enables the systemd unit; start if stopped, reload ONLY if the config
#      actually changed (certs live in /var/lib/caddy and are never touched —
#      no cert churn, no ACME re-registration)
#   6. fails with port/journal diagnostics if the service is not active
#
# It NEVER touches the app container, docker-compose, or the database.
# Called by CI AFTER deploy/deploy.sh (on a migrating server the legacy
# container may hold :80 until the app swap), or by hand:
#   CADDY_DOMAIN=app.example.com CADDY_EMAIL=ops@example.com sudo -E ./deploy/caddy/setup-caddy.sh
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$HERE/Caddyfile"
DEST="/etc/caddy/Caddyfile"

# --- 1. require + sanity-check the inputs -----------------------------------
if [ -z "${CADDY_DOMAIN:-}" ] || [ -z "${CADDY_EMAIL:-}" ]; then
  echo "FATAL: CADDY_DOMAIN and CADDY_EMAIL must both be set" >&2
  echo "  (GitHub -> Settings -> Environments -> prod; export them for manual runs)" >&2
  exit 1
fi
case "$CADDY_DOMAIN" in
  *[!A-Za-z0-9.-]*) echo "FATAL: CADDY_DOMAIN '$CADDY_DOMAIN' has invalid characters" >&2; exit 1 ;;
esac
case "$CADDY_EMAIL" in
  ?*@?*.?*) ;;
  *) echo "FATAL: CADDY_EMAIL '$CADDY_EMAIL' is not an email address" >&2; exit 1 ;;
esac

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

# --- 2. install Caddy (official repo) if missing -----------------------------
if ! command -v caddy >/dev/null 2>&1; then
  echo "==> [caddy] installing Caddy from the official repository..."
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | $SUDO gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | $SUDO tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  $SUDO apt-get update -qq
  # postinst may fail to *start* on a migrating server where the legacy app
  # still holds :80 — fine, we configure and start it after the app swap.
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy || true
  command -v caddy >/dev/null 2>&1 || { echo "FATAL: caddy installation failed" >&2; exit 1; }
fi

# --- 3. render template -------------------------------------------------------
RENDERED="$(mktemp)"
trap 'rm -f "$RENDERED"' EXIT
content="$(cat "$TEMPLATE")"
rendered="${content//app.yourdomain.com/$CADDY_DOMAIN}"
rendered="${rendered//admin@yourdomain.com/$CADDY_EMAIL}"
printf '%s\n' "$rendered" > "$RENDERED"

# --- 4. validate the render BEFORE touching the live config -------------------
echo "==> [caddy] validating rendered config for $CADDY_DOMAIN..."
caddy validate --config "$RENDERED" --adapter caddyfile

# Dry-run: render + validate only (CI checks / testing), no system changes.
if [ "${CADDY_DRY_RUN:-}" = 1 ]; then
  echo "==> [caddy] dry run OK — rendered config valid for $CADDY_DOMAIN (no system changes)"
  exit 0
fi

# --- 5. install if changed, then start/reload --------------------------------
$SUDO install -d -m 0755 /etc/caddy
changed=0
if ! cmp -s "$RENDERED" "$DEST" 2>/dev/null; then
  $SUDO install -m 0644 "$RENDERED" "$DEST"
  changed=1
  echo "==> [caddy] $DEST updated"
else
  echo "==> [caddy] $DEST unchanged (no reload needed)"
fi

$SUDO systemctl enable caddy >/dev/null 2>&1 || true
if systemctl is-active --quiet caddy; then
  if [ "$changed" = 1 ]; then
    echo "==> [caddy] reloading (graceful; certificates untouched)..."
    $SUDO systemctl reload caddy
  fi
else
  echo "==> [caddy] starting service..."
  $SUDO systemctl start caddy
fi

# --- 6. verify it is actually up ----------------------------------------------
if ! systemctl is-active --quiet caddy; then
  echo "FATAL: caddy did not stay active. Port 80/443 likely already bound by" >&2
  echo "another process (legacy app container? see deploy/migrate-to-https.md):" >&2
  $SUDO ss -ltnp 2>/dev/null | grep -E ':(80|443) ' >&2 || true
  $SUDO journalctl -u caddy -n 30 --no-pager >&2 || true
  exit 1
fi
echo "==> [caddy] active — serving $CADDY_DOMAIN (ACME contact: $CADDY_EMAIL)"
