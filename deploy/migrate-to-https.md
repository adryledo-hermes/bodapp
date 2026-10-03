# Migrating Bodapp to HTTPS (Caddy reverse proxy)

One-time migration from *"app served directly on a port over HTTP"* to:

```
  Internet                    Hetzner CX22 (Ubuntu)
  ────────                    ─────────────────────────────────────────────
  browser ──► TCP 80/443 ──►   Caddy (systemd, host, NOT Docker)
                                    │  automatic Let's Encrypt certs (auto-renew)
                                    │  HTTP → HTTPS redirect + security headers
                                    ▼
                               127.0.0.1:3001  (loopback-only)
                                    ▼
                               bodapp-app container (Docker, port 3001)

  removed: browser ──► TCP 80/<old-port> ──► 0.0.0.0 ──► bodapp-app
```

**Principles**

- **Caddy lives on the host as a systemd service** — never in the app
  container, never in `docker-compose.yml`. `deploy/deploy.sh` therefore
  cannot restart or break TLS during app deploys (it only *warns*, read-only,
  if it sees Caddy is down).
- **The app is loopback-only** (`127.0.0.1:3001`) — not reachable from any
  network even if a firewall rule is wrong.
- **Firewall opens only 80 + 443** (plus SSH for you).

**Why the order below matters:** your current setup holds port **80**, which
Caddy needs. So Caddy is *installed and configured first but not started*;
the moment the app swap frees port 80, Caddy is started by hand (one-time).
App deploys after that never involve Caddy at all.

---

## Step 0 — Prerequisites

- A domain (e.g. `app.yourdomain.com`) with DNS access.
- SSH access to the server as a sudo-capable user.
- The HTTPS branch of this repo merged to `main` **last** (Step 6) — not before.

## Step 1 — DNS

Create the record **before** requesting certificates:

```
A    app.yourdomain.com    →    <SERVER_IP>
AAAA app.yourdomain.com    →    <SERVER_IPV6>     (only if you have IPv6)
```

```bash
dig +short app.yourdomain.com     # must print <SERVER_IP>
```

## Step 2 — Install Caddy on the server (once, not started yet)

```bash
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt update && sudo apt install -y caddy
sudo systemctl stop caddy      # port 80 is still held by the old app setup
```

> The package ships its own unit (equivalent to the repo's
> [`caddy/caddy.service`](caddy/caddy.service)) and creates the `caddy` user.
> `systemctl stop` right after install is expected — the old app still owns
> port 80, so Caddy would fail to bind until Step 7.

## Step 3 — Put the real Caddyfile in place and validate

```bash
sudo nano /etc/caddy/Caddyfile      # paste deploy/caddy/Caddyfile, then:
#   - replace app.yourdomain.com with your domain
#   - replace admin@yourdomain.com with your email

sudo caddy validate --config /etc/caddy/Caddyfile
# expect: "Valid configuration"
sudo systemctl enable caddy         # enable now, START comes in Step 7
```

## Step 4 — Update the pipeline secret (`ENV_FILE`)

The workflow rewrites the server's `.env` from the GitHub secret **on every
deploy**, so change the secret **before** merging (or the old URL comes back):

GitHub → **Settings → Environments → prod → `ENV_FILE` → Update**:

- `PUBLIC_BASE_URL="https://app.yourdomain.com"` (no trailing slash, no port)
  — this also flips session cookies to `Secure` automatically.
- **Delete** the obsolete `APP_PORT` line (the port is fixed at loopback
  `127.0.0.1:3001` now).

## Step 5 — Firewall: allow 80/443, retire the old app port

Full rules: [`hetzner-firewall.md`](hetzner-firewall.md). Summary — inbound
**TCP 80** and **TCP 443** from `0.0.0.0/0`, **TCP 22** from your IP only,
outbound allow-all, everything else denied. **Do not open 3001.** Any rule for
the old app port (3000/8080, if it exists and isn't 80) can be removed after
Step 7 succeeds.

## Step 6 — Merge the HTTPS branch → pipeline swaps the app to `127.0.0.1:3001`

Merge the PR / push `main`. CI then runs `deploy/deploy.sh`, which:

1. builds the new image **while the old container still serves**,
2. runs `prisma migrate deploy`,
3. recreates **only the app container** with `-p 127.0.0.1:3001:3001`
   (Postgres untouched) — **this is the moment the old port-80 binding is
   released,**
4. gates on `GET http://127.0.0.1:3001/healthz` and asserts the port is
   still loopback-only (rolls the image back if the gate fails).

Manual alternative (no CI):

```bash
cd /opt/bodapp
git pull
docker compose up -d --build
# → old public port dies here; go straight to Step 7
```

> ⚠️ Expect a **brief window (roughly 10–60 s)** between the swap and Step 7 in
> which the site is unreachable — this is the one-time cutover. If the old
> container was started by a raw `docker run -p 80:3000` (not compose), remove
> it first: `docker ps` → `docker rm -f <that-container>`.

## Step 7 — Start Caddy (one-time, immediately after Step 6)

```bash
sudo systemctl start caddy
systemctl is-active --quiet caddy && echo caddy up
sudo journalctl -u caddy -n 50 -f      # watch the certificate being obtained
```

Caddy binds 80/443, obtains the Let's Encrypt certificate (seconds) and starts
proxying to `127.0.0.1:3001`. From here on, **nothing in the deploy pipeline
ever touches Caddy again.**

## Step 8 — Verify

```bash
# Liveness, bypassing Caddy (on the server):
curl -I http://127.0.0.1:3001/healthz            # 200

# End-to-end:
curl -I http://app.yourdomain.com                # 308 → https://
curl -I https://app.yourdomain.com/healthz       # 200
curl -sI https://app.yourdomain.com/healthz | grep -i strict-transport  # HSTS present
openssl s_client -connect app.yourdomain.com:443 -servername app.yourdomain.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -enddate        # issuer Let's Encrypt, ~90 days out

# Port exposure from outside (must FAIL):
curl -m 3 http://<SERVER_IP>:3001/healthz

# Logs:
docker compose ps
journalctl -u caddy -n 20
```

In a browser: padlock on `https://app.yourdomain.com/login`, and a redirect
from `http://app.yourdomain.com`.

## Step 9 — Regenerate invite links / QR codes

Old invitations embed the previous `http://<IP>:<port>` origin; those links
**die when the old port is closed** (there is nothing listening to redirect
them). After `PUBLIC_BASE_URL` changes:

- Re-open each invitation in the panel and re-download its **QR code** /
  copy the fresh link (they are built from the current `PUBLIC_BASE_URL`).
- Existing couple/guest **sessions are invalidated in practice**: cookies now
  carry `Secure` and the origin changed — everyone just logs in again.

## Rollback plan (if Step 7/8 fails)

1. `sudo systemctl stop caddy` (frees 80/443).
2. GitHub secret `ENV_FILE`: restore the old `PUBLIC_BASE_URL`
   (e.g. `http://<SERVER_IP>:80`) and old `APP_PORT` if you had one.
3. Revert the merge commit on `main` (pipeline redeploys the old compose,
   which re-opens the old host port), or on the server:
   `git checkout <old-sha> && docker compose up -d --build`.
4. Re-open the old app port in the firewall.

## Appendix — equivalent plain `docker run` (no compose)

```bash
docker run -d --name bodapp-app \
  --restart unless-stopped --init \
  --network bodapp_default \            # compose network → reaches `postgres`
  --env-file .env \                     # DATABASE_URL points at host `postgres`
  -p 127.0.0.1:3001:3001 \
  -v "$PWD/storage:/app/storage" \
  bodapp-app:latest
```

The important line is `-p 127.0.0.1:3001:3001` — loopback-only host binding,
port 3001 on both sides. Never publish it as `-p 3001:3001` or `-p 0.0.0.0:…`.

## Day-2 operations

| Task | What you do |
|---|---|
| App deploy | Push `main` / run the workflow — **only the app container** is rebuilt and restarted; Caddy untouched. |
| Certificate renewal | Nothing — Caddy renews automatically (~30 days before expiry). |
| Caddyfile change | Edit `/etc/caddy/Caddyfile`, `caddy validate …`, `systemctl reload caddy`. Never via the app pipeline. |
| Caddy upgrade | `apt update && apt upgrade caddy` — rare, manual. |
| Check proxy health | `systemctl status caddy`, `journalctl -u caddy -f` |
