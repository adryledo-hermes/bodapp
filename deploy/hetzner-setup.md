# Bodapp — Hetzner CX22 Deployment Runbook

v1 serves **over HTTP on an IP/port (port 3000), no domain**. Invitations are
distributed by QR/link that point at `http://<SERVER_IP>:3000`.

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
- (Recommended) Two DNS A records, e.g. `app.yourdomain.com` → server IP.

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
| `DATABASE_URL` | `postgresql://bodapp:bodapp@postgres:5432/bodapp?schema=public` | **Host = `postgres`** (compose service). Compose overrides this anyway, but keep it coherent. |
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxx...` | From Twilio console |
| `TWILIO_AUTH_TOKEN` | `...` | From Twilio console |
| `TWILIO_PHONE_NUMBER` | `+1234567890` | Verified SMS-capable number |
| `SESSION_SECRET` | `hex from openssl` | 32+ random bytes |
| `PUBLIC_BASE_URL` | `http://<SERVER_IP>:3000` | Used to build invite/QR links |
| `PHOTO_STORAGE_DIR` | `/app/storage` | Matches the compose volume mount |

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

## 8. Open the firewall

The default Hetzner firewall (or your `ufw`) must allow **TCP 3000** from the
public internet:

```bash
# Hetzner Cloud Console → Server → Firewalls → add inbound rule:
#   Type: TCP   Source: 0.0.0.0/0   Port: 3000
# ...or with ufw:
ufw allow 3000/tcp
ufw reload || true
```

## 9. Verify

```bash
# Health (app returns the login page):
curl -I http://$SERVER_IP:3000/login          # expect HTTP 200

# Logs:
docker compose logs -f app

# Create the wedding + couple account through the UI:
#   http://$SERVER_IP:3000/login
```

**Verify the public invite flow end-to-end:**
1. In the panel, add **guests** with their phone numbers (E.164) and attach them
   to an **invitation** with the matching `acceptedPhones`.
2. From `http://$SERVER_IP:3000/w/<slug>/invite` get the public invite link/QR.
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

## 11. (Later) Serve on port 80 + HTTPS behind a reverse proxy

You can keep running on port 3000 indefinitely. When you want port 80/443 and a
real domain, put a reverse proxy (Caddy is the easiest — it auto-provisions
Let's Encrypt certs) in front:

```
server <SERVER_IP> {
    reverse_proxy localhost:3000
}
```

Then set `PUBLIC_BASE_URL=https://app.yourdomain.com` in `.env`, rebuild, and
update invite/QR links. `docker compose run --rm migrate` is still safe to
re-run after any schema change.

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
