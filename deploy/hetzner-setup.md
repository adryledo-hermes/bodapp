# Bodapp — Hetzner CX22 Deployment Runbook

Production serves **HTTPS via Caddy** (host systemd service, automatic
Let's Encrypt): the world hits `https://<domain>` on ports 80/443 → Caddy →
the app published **loopback-only on `127.0.0.1:3001`**. Invitations are
distributed by QR/link pointing at `https://<domain>` (from `PUBLIC_BASE_URL`).
Migrating from the old IP/HTTP setup? Follow [`migrate-to-https.md`](migrate-to-https.md).

This runbook takes you from a fresh Hetzner **CX22** (Ubuntu 22.04, ~2GB RAM,
40GB disk) to a running app + Postgres via Docker Compose.

> The Docker deploy is **prepared and committed**, but no live server has been
> provisioned yet. Follow the steps below on the real box once you have SSH
> access + credentials (Twilio, Hetzner Storage Box).

---

## 0. Prerequisites (on your laptop)

- A Hetzner CX22 **Ubuntu 22.04** server (Cloud Console → Create → CX22).
- A project with an SSH key added. Grab the server IP from the console.
- A **Twilio** account: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and a
  verified SMS-capable `TWILIO_PHONE_NUMBER` (E.164, e.g. `+1234567890`).
- A DNS **A record** for your domain, e.g. `app.yourdomain.com` → server IP (required: Let's Encrypt needs it to issue a certificate).

## 1. Connect

```bash
SSH_KEY=~/.ssh/id_ed25519
SERVER_IP=<your-hetzner-ip>      # replace

ssh -i "$SSH_KEY" root@$SERVER_IP
```

## 2. Install Docker Engine + Compose plugin

As `root` on Ubuntu 22.04:

```bash
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker --version && docker compose version
```

## 3. Clone the repo

```bash
apt-get install -y git
cd /opt
git clone git@github.com:adryledo-hermes/bodapp.git bodapp
cd bodapp
```

> If you use a **deploy key / PAT** instead of SSH-agent forwarding, use the
> `https://` clone URL and set the token as your git credential.

## 4. Configure environment

```bash
cp .env.example .env
```

Generate a strong session secret and edit `.env`:

```bash
openssl rand -hex 32          # → paste into SESSION_SECRET
```

Fill these values (never commit `.env`):

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://bodapp:PASSWORD@postgres:5432/bodapp?schema=public` | **Host = `postgres`** (compose service). Compose re-interpolates this from `POSTGRES_*` (below), so keep the user/password coherent. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `bodapp` / `bodapp` / `bodapp` | Credentials for the `postgres` service. `docker-compose.yml` interpolates all of these from `.env`, so all three (and `DATABASE_URL`) must agree. Change `POSTGRES_PASSWORD` for anything beyond local dev. |
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxx...` | From Twilio console |
| `TWILIO_AUTH_TOKEN` | `...` | From Twilio console |
| `TWILIO_PHONE_NUMBER` | `+123****7890` | Verified SMS-capable number |
| `SESSION_SECRET` | `hex from openssl` | 32+ random bytes |
| `PUBLIC_BASE_URL` | `https://app.yourdomain.com` | Builds invite/QR links; the https scheme also turns on secure session cookies. |
| `PHOTO_STORAGE_DIR` | *(leave unset)* | Optional. Unset = app default `/app/storage/photos` (matches the `photos/` subdir under the compose mount). If you set it, use `/app/storage/photos`. |

## 5. Prepare the photo storage directory

The app runs as a **non-root user (uid 1001)** and writes photos to the bind
mount `./storage → /app/storage`. Create it on the host and chown it to 1001
**before** starting, or the container won't be able to write:

```bash
mkdir -p storage/photos
chown -R 1001:1001 storage
chmod 775 storage
```

## 6. Build & start

```bash
docker compose up -d --build      # builds image, starts postgres + app
docker compose ps                  # both services healthy/running
```

## 7. Apply migrations + seed the couple

Migrations are applied by the `migrate` one-shot service (idempotent —
safe to re-run):

```bash
docker compose run --rm migrate        # npx prisma migrate deploy
```

Seed the demo wedding + couple account (email/password printed by the script):

```bash
docker compose run --rm app npx --no-install prisma db seed
```

> If you don't want the demo seed, skip it and create the wedding + couple via
> the `/login` → signup flow once the app is up (Step 9).

## 8. Open the firewall (80/443 only)

The app is published **loopback-only** (`127.0.0.1:3001`) — it must NOT be
firewalled open. Only Caddy needs the public internet: **TCP 80** (HTTP→HTTPS
redirect + Let's Encrypt challenge) and **TCP 443** (HTTPS). Full rules,
including SSH hardening and the ufw alternative:
[`hetzner-firewall.md`](hetzner-firewall.md).

```bash
# Hetzner Cloud Console → server → Firewalls → Create firewall, inbound:
#   TCP 80   from 0.0.0.0/0
#   TCP 443  from 0.0.0.0/0
#   TCP 22   from <YOUR_IP>/32      (SSH — your IP only)
# Outbound: allow all (default). Then attach the firewall to the server.
# Do NOT open 3000/3001/8080/5432.
```

## 9. Verify

```bash
# Liveness on the server, bypassing Caddy:
curl -I http://127.0.0.1:3001/healthz            # expect HTTP 200

# End-to-end through Caddy (from anywhere):
curl -I https://app.yourdomain.com/healthz       # expect 200
curl -I https://app.yourdomain.com/healthz | grep -i strict-transport  # HSTS header present
curl -I http://app.yourdomain.com                # expect redirect → https://

# Logs:
docker compose logs -f app
journalctl -u caddy -f

# Create the wedding + couple account through the UI:
#   https://app.yourdomain.com/login
```

**Verify the public invite flow end-to-end:**
1. In the panel, add **guests** with their phone numbers (E.164) and attach them
   to an **invitation** with the matching `acceptedPhones`.
2. From `https://app.yourdomain.com/w/<slug>/invite` get the public invite link/QR.
3. Open the invite on a phone, enter a guest's number → **Twilio SMS OTP** →
   personalized invitation + RSVP.
4. Check `docker compose logs app` for OTP send/verify activity.

## 10. Daily backups (Postgres → Storage Box)

Mount a Hetzner Storage Box with SSHFS and dump Postgres nightly. On the box:

```bash
apt-get install -y sshfs postgresql-client
mkdir -p /mnt/storagebox && chown root:root /mnt/storagebox

# /etc/fstab — replace with your Storage Box username:
#   root@<yourboxnum>.your-storagebox.de:/backup /mnt/storagebox fuse.sshfs \
#     _netdev,allow_other,IdentityFile=/root/.ssh/storagebox_ed25519,reconnect,defaults 0 0

systemctl daemon-reload && mount /mnt/storagebox
```

Create `/usr/local/bin/bodapp-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p /mnt/storagebox/bodapp
# Dump via the compose postgres service (no host psql needed):
docker compose -f /opt/bodapp/docker-compose.yml exec -T postgres \
  pg_dump -U bodapp -d bodapp | gzip > "/mnt/storagebox/bodapp/db_${STAMP}.sql.gz"
# Keep the 7 most recent dumps:
ls -1t /mnt/storagebox/bodapp/db_*.sql.gz | tail -n +8 | xargs -r rm -f
echo "Backup ok: db_${STAMP}.sql.gz"
```

```bash
chmod +x /usr/local/bin/bodapp-backup.sh
echo "0 3 * * * /usr/local/bin/bodapp-backup.sh >> /var/log/bodapp-backup.log 2>&1" \
  | crontab -
```

Photos live on `/opt/bodapp/storage` — back that directory up too (e.g. rsync
to the Storage Box), or move it onto the mounted Storage Box.

## 11. HTTPS behind Caddy (reverse proxy)

Production topology: **Caddy (host systemd service, ports 80/443, automatic
Let's Encrypt) → 127.0.0.1:3001 → app container**. The full setup — Caddyfile,
systemd unit, firewall rules and a step-by-step migration from the old
IP/HTTP setup — lives in:

- [`caddy/Caddyfile`](caddy/Caddyfile) — the proxy config (validated, production)
- [`caddy/caddy.service`](caddy/caddy.service) — systemd unit (the official
  Caddy package ships an equivalent one)
- [`migrate-to-https.md`](migrate-to-https.md) — install + migration plan
- [`hetzner-firewall.md`](hetzner-firewall.md) — allow only 80/443

On a fresh server you don't touch any of this by hand: set the
`CADDY_DOMAIN`/`CADDY_EMAIL` GitHub secrets and run the two pipelines —
business logic (`deploy.yml`) and, separately, **Infrastructure — Caddy**
(`infra.yml`, also auto-triggered by changes under `deploy/caddy/`). The
infrastructure workflow runs [`caddy/setup-caddy.sh`](caddy/setup-caddy.sh)
(install-if-missing → render from the secrets → `caddy validate` →
start/reload) and verifies `https://<domain>/healthz` end-to-end. App
deploys rebuild only the `bodapp-app` container — Caddy is config-only
(reloaded only when the secrets change). After any schema change,
`docker compose run --rm migrate` is still safe to re-run.

---

## Troubleshooting

- **Container exited / `DATABASE_URL is not set`** → confirm `.env` exists and
  is valid; `docker compose config` prints the resolved env.
- **Permission denied writing photos** → redo Step 5 (`chown -R 1001:1001 storage`).
- **OTP not arriving** → verify Twilio creds + that `TWILIO_PHONE_NUMBER` is
  SMS-capable and Twilio account is not in trial-messaging sandbox mode.
- **Out of memory during `next build`** → the image is built with the **webpack**
  build (`next build --webpack`); build on a machine/CI with more RAM, or use a
  Hetzner instance with swap. The built image runs fine on the 2GB CX22.
- **Rebuild after schema change** → edit schema → `npx prisma migrate dev` on
  your laptop → commit the migration → on the box `git pull`,
  `docker compose build && docker compose run --rm migrate && docker compose up -d`.
