# Migrating Bodapp to HTTPS (Caddy reverse proxy)

Target architecture:

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

## What is automated vs manual

| Step | Who does it |
|---|---|
| Caddy install + Caddyfile render (domain/email) + `validate` + start/reload | **Automatic** — [`caddy/setup-caddy.sh`](caddy/setup-caddy.sh), run by the **Infrastructure pipeline** (`.github/workflows/infra.yml`) from the `CADDY_DOMAIN` / `CADDY_EMAIL` secrets |
| `PUBLIC_BASE_URL=https://<domain>` in the server `.env` | **Automatic** — the business-logic pipeline derives it from `CADDY_DOMAIN` on every deploy (cannot drift from Caddy) |
| App swap to `127.0.0.1:3001`, migrations, health gate, rollback | **Automatic** — the business-logic pipeline ([`deploy.sh`](deploy.sh), `.github/workflows/deploy.yml`) |
| End-to-end `https://<domain>/healthz` verification | **Automatic** — hard TLS gate in the Infrastructure pipeline |
| DNS A record for the domain | **Manual** (your DNS provider) |
| Firewall: open 80/443, lock SSH | **Manual, once per server** ([`hetzner-firewall.md`](hetzner-firewall.md)) |
| Docker + repo clone + deploy SSH key | **Manual, once per server** ([`hetzner-setup.md`](hetzner-setup.md) steps 1–3, [`github-actions-deploy.md`](github-actions-deploy.md)) |
| Re-sharing invite QR codes after the domain change | **Manual, once** (last step below) |

**Two pipelines, strictly separated** — they never build, restart or verify
each other's components, and share no server-side working state:

- **Business logic** — `deploy.yml`: app image, migrations, the `bodapp-app`
  container, `.env`. Writes only `/opt/bodapp` + Docker.
- **Infrastructure** — `infra.yml`: Caddy, `/etc/caddy/Caddyfile`,
  certificates, the TLS gate. Writes only `/etc/caddy` + `/tmp` (its assets
  are copied from the runner checkout, never via git on the server).

**Principles**

- **Caddy lives on the host as a systemd service** — never in the app
  container, never in `docker-compose.yml`. It is *config-only*
  infrastructure: `setup-caddy.sh` installs it once and re-renders/reloads it
  only when the domain/email secrets change; app deploys never restart it and
  never touch certificates (`/var/lib/caddy`).
- **The app is loopback-only** (`127.0.0.1:3001`) — not reachable from any
  network even if a firewall rule is wrong.
- **Firewall opens only 80 + 443** (plus SSH for you) — the one console step.

## Fresh server: zero manual Caddy steps

1. DNS: `A app.example.com → <SERVER_IP>`.
2. Firewall: attach the rule set from [`hetzner-firewall.md`](hetzner-firewall.md) (80/443 + SSH).
3. Server basics once: Docker + repo clone + deploy key
   ([`hetzner-setup.md`](hetzner-setup.md), [`github-actions-deploy.md`](github-actions-deploy.md)).
4. GitHub `prod` environment secrets: `DEPLOY_HOST` / `DEPLOY_USER` /
   `DEPLOY_SSH_KEY` / `ENV_FILE` **plus `CADDY_DOMAIN` and `CADDY_EMAIL`**.
5. **Business logic:** push `main` (or *Run workflow* on `deploy.yml`) → the
   app deploys onto loopback `127.0.0.1:3001`, green on `/healthz`.
6. **Infrastructure:** run *Infrastructure — Caddy* (`infra.yml` — it also
   auto-triggers whenever `deploy/caddy/**` changes) → Caddy installed,
   certificate obtained, green only when the end-to-end TLS gate passes.

Either order works on a fresh server — the two runs share no state. No Caddy
file is ever hand-edited on the server.

## Migrating the EXISTING server (port 80 currently held by the app)

The two pipelines are run **in order** (strict separation — one workflow
each, never a combined run):

```
1. deploy.yml (business logic): write .env → force PUBLIC_BASE_URL →
   deploy.sh swaps the app to 127.0.0.1:3001, freeing :80
2. infra.yml (Infrastructure — Caddy): setup-caddy.sh
   install/render/validate/start → end-to-end TLS gate
```

Before merging, do the manual bits:

1. **DNS** — `dig +short app.example.com` must print your server IP
   (Let's Encrypt cannot issue without it).
2. **Firewall** — open TCP 80/443, lock SSH ([`hetzner-firewall.md`](hetzner-firewall.md)).
3. **Secrets** — set `CADDY_DOMAIN` + `CADDY_EMAIL`. `PUBLIC_BASE_URL` is now
   derived automatically (you may drop it from `ENV_FILE` — it is overridden
   anyway). Delete any obsolete `APP_PORT` line. Keep the rest of `ENV_FILE`.

Then **merge the branch / push `main`**: `deploy.yml` runs automatically.
When it is green, start the **Infrastructure — Caddy** workflow (*Run
workflow*). Expect a **brief window (roughly 10–60 s)** between the app swap
and certificate issuance — the one-time cutover. If `infra.yml` raced ahead
and failed on the port-80 conflict, that is expected: once `deploy.yml` is
green, *Re-run failed jobs* on `infra.yml` and it will succeed behind the
swapped app.

> **Edge:** if the legacy app was started by a raw `docker run -p 80:3000`
> (not compose), it still holds :80 after the swap and Caddy's start fails
> with a clear port diagnostic from `setup-caddy.sh`. Remove it —
> `docker ps` → `docker rm -f <container>` — and re-run `infra.yml`.

## Manual fallback (no CI / debugging)

Everything the pipeline does can be run by hand on the server:

```bash
cd /opt/bodapp
git pull
docker compose up -d --build                                   # app → 127.0.0.1:3001
CADDY_DOMAIN=app.example.com CADDY_EMAIL=ops@example.com \
  sudo -E bash deploy/caddy/setup-caddy.sh                     # Caddy end-to-end
curl -fsS https://app.example.com/healthz
```

`setup-caddy.sh` is idempotent: re-running changes nothing unless the
domain/email (or the template) changed, in which case it validates the new
config first and then does a graceful reload.

## Verify

```bash
# Liveness on the server, bypassing Caddy:
curl -I http://127.0.0.1:3001/healthz            # expect HTTP 200

# End-to-end through Caddy (from anywhere):
curl -I https://app.example.com/healthz          # expect 200
curl -I https://app.example.com/healthz | grep -i strict-transport   # HSTS present
curl -I http://app.example.com                   # expect redirect → https://
openssl s_client -connect app.example.com:443 -servername app.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -enddate        # issuer Let's Encrypt, ~90 days out

# Port exposure from outside (must FAIL):
curl -m 3 http://<SERVER_IP>:3001/healthz

# Logs:
docker compose ps
journalctl -u caddy -n 20
```

In a browser: padlock on `https://<domain>/login`.

## Regenerate invite links / QR codes

Old invitations embed the previous `http://<IP>:<port>` origin; those links
**die when the old port is closed** (nothing is listening to redirect them).
After the domain change:

- Re-open each invitation in the panel and re-download its **QR code** /
  copy the fresh link (built from the current `PUBLIC_BASE_URL`).
- Existing couple/guest **sessions are invalidated in practice**: cookies now
  carry `Secure` and the origin changed — everyone just logs in again.

## Rollback plan (if the cutover fails)

1. Revert the merge on `main` (or on the server: `git checkout <old-sha> &&
   docker compose up -d --build`) → the app reopens its old host port.
2. `sudo systemctl stop caddy` (frees 80/443) if it got that far.
3. GitHub secrets: unset `CADDY_DOMAIN`/`CADDY_EMAIL` (the pipeline then
   skips Caddy) and restore the old `PUBLIC_BASE_URL` in `ENV_FILE`.
4. Re-open the old app port in the firewall.
   The pipeline then behaves exactly as before the migration.

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
| App deploy | Push `main` / run `deploy.yml` — business logic only; Caddy untouched |
| Caddy / Caddyfile change | Edit `deploy/caddy/**` → `infra.yml` auto-triggers on push (or run it manually); it re-renders + gracefully reloads only if the config changed |
| Change domain or ACME email | Update the `CADDY_DOMAIN`/`CADDY_EMAIL` secrets → run `infra.yml` (or `setup-caddy.sh` by hand) |
| Certificate renewal | Nothing — Caddy renews automatically (~30 days before expiry) |
| Hand-edit Caddyfile | Only for changes not expressible in the template — and note the next deploy re-renders the template over it. Template changes belong in `deploy/caddy/Caddyfile` |
| Caddy upgrade | `apt update && apt upgrade caddy` — rare, manual |
| Check proxy health | `systemctl status caddy`, `journalctl -u caddy -f` |
