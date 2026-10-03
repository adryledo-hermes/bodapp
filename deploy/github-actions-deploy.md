# One-click deploy from GitHub Actions

The repository ships a CI/CD pipeline (`.github/workflows/deploy.yml`) that deploys
the app to your Hetzner VPS **over SSH** — no self-hosted runner, no registry, no
extra infra. You click **"Run workflow"** on the Actions tab (or push to `main`)
and it:

1. Connects to the VPS over SSH.
2. Ensures the repo is cloned (or clones it) into `REPO_DIR`.
3. Writes the server `.env` from a GitHub **secret** (`ENV_FILE`).
4. Runs `deploy/deploy.sh`: fetches latest code → builds the new image **while
   the old container keeps serving** → runs `prisma migrate deploy` →
   gracefully recreates **only the app container** (Postgres keeps running;
   the app is loopback-only on `127.0.0.1:3001`) → gates on
   `http://127.0.0.1:3001/healthz`, rolls the image back if the gate fails,
   and warns (never fails) if Caddy/HTTPS is unreachable.

**Scope:** only the Bodapp stack is ever rebuilt/restarted. **Caddy** (the
host systemd service terminating TLS) is installed once and never touched by
this pipeline — see [`migrate-to-https.md`](migrate-to-https.md).

## 0. What you need beforehand

- A Hetzner VPS (see [`hetzner-setup.md`](hetzner-setup.md) for OS/Docker install).
- The repo pushed to GitHub (this app: `adryledo-hermes/bodapp`).
- Your real values for every secret in `.env.example`.

## 1. One-time server setup (do this once, on the VPS)

```bash
# 1. Docker Engine + compose plugin already installed (see hetzner-setup.md).

# 2. Clone the repo where the deploy will live (default /opt/bodapp):
sudo apt install -y git
sudo mkdir -p /opt/bodapp && sudo chown "$USER" /opt/bodapp
git clone https://github.com/adryledo-hermes/bodapp.git /opt/bodapp

# 3. Pre-create the photo-storage dir and make it writable by the container's
#    non-root user (uid 1001):
mkdir -p /opt/bodapp/storage/photos && sudo chown -R 1001:1001 /opt/bodapp/storage
```

> The pipeline writes `.env` automatically each deploy from the GitHub secret, so
> you do **not** need to create `.env` manually on the server.

## 2. Create a deploy SSH key (local machine)

Generate a dedicated keypair for the workflow (do **not** reuse your personal key):

```bash
ssh-keygen -t ed25519 -C "bodapp-github-actions" -f ~/.ssh/bodapp_deploy -N ""
```

- **Public key** → add to the VPS user you'll SSH as (e.g. `deploy` or your user):

  ```bash
  ssh-copy-id -i ~/.ssh/bodapp_deploy.pub <user>@<VPS_IP>
  # or manually append the .pub contents to ~/.ssh/authorized_keys
  ```

- **Private key** (`~/.ssh/bodapp_deploy`) → paste into the GitHub secret
  `DEPLOY_SSH_KEY` below.

## 3. Configure a GitHub environment and its secrets

The workflow reads its secrets from a GitHub **environment** named `prod`
(job-level `environment: prod`). Create it and add the secrets there.

**Create the environment:** **Settings → Environments → New environment** → name it
`prod` → **Save**. (Optionally set *Deployment branches* to `main` and add *Required
reviewers* if you want an approval gate before deploys.)

Then under **Settings → Environments → prod → Environment secrets → Add secret**,
add each of these:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | VPS IP or hostname, e.g. `116.203.12.34` |
| `DEPLOY_USER` | SSH user you added the public key to (e.g. `deploy` or `root`) |
| `DEPLOY_SSH_KEY` | **Private** key content of `~/.ssh/bodapp_deploy` (the PEM/OpenSSH text) |
| `ENV_FILE` | The **entire contents of your server `.env`** — copy the `.env` you'd create from `.env.example` with all real values (DATABASE_URL/POSTGRES_*, TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER, SESSION_SECRET, PUBLIC_BASE_URL, …). Keep this in sync with what the app needs. **`PUBLIC_BASE_URL` must be `https://<domain>`** once Caddy is in front (see migrate-to-https.md); delete any obsolete `APP_PORT` line. |

Optional:

| Secret | Default | Notes |
|---|---|---|
| `DEPLOY_PORT` | `22` | SSH port if non-standard |
| `REPO_DIR` | `/opt/bodapp` | Where the repo lives on the VPS |
| `REPO_URL` | `https://github.com/adryledo-hermes/bodapp.git` | Override if forks/copies |

## 4. Deploy

- **Manual / one-click:** open the **Actions** tab → select **"Deploy to Hetzner"** →
  **Run workflow** → choose branch (default `main`) → **Run workflow**.
- **Automatic:** every push to `main` triggers a deploy (remove the `push:` trigger
  in the workflow if you want manual-only).

## 5. Verify

The run prints the health gate (`http://127.0.0.1:3001/healthz`), the
loopback-only port assertion and, when configured, the end-to-end https probe.
Then in a browser:
- `https://<your-domain>/login` — panel loads over TLS with a valid certificate.
- `http://<your-domain>` — must **redirect** to https.
- `PUBLIC_BASE_URL` inside `ENV_FILE` must be exactly `https://<your-domain>`
  (it builds invite/QR links and enables secure session cookies). The app port
  is fixed at loopback `127.0.0.1:3001`; `APP_PORT` no longer exists.

## Troubleshooting

- **`docker: command not found` / compose plugin** → install Docker Engine + the
  compose plugin on the VPS first (hetzner-setup.md).
- **SSH permission denied** → confirm `DEPLOY_SSH_KEY` is the **private** key and
  its **public** half is in the `DEPLOY_USER`'s `authorized_keys`; check `DEPLOY_HOST`
  / `DEPLOY_USER` / `DEPLOY_PORT`.
- **App comes up but health probe fails** → the pipeline prints logs on
  failure and rolls back to the previous image; SSH in and run
  `cd /opt/bodapp && docker compose logs --tail=100 app`.
- **`502 Bad Gateway` from https://** → Caddy is up but the app container is
  down/unhealthy: `cd /opt/bodapp && docker compose ps && docker compose logs --tail=100 app`.
- **Certificate error / `curl: (60)`** → Let's Encrypt issuance failed:
  `caddy validate --config /etc/caddy/Caddyfile`, `journalctl -u caddy -n 100`,
  and confirm the DNS A record + firewall ports 80/443 — see
  [`migrate-to-https.md`](migrate-to-https.md) and
  [`hetzner-firewall.md`](hetzner-firewall.md).
- **`ENV_FILE` secret not available / empty on manual run from a non-default branch** →
  the job is guarded with `if: github.ref == 'refs/heads/main'`, so a manual "Run workflow"
  from another branch is skipped (not executed). Always deploy `main`. If you need other
  branches, set **Deployment branches** on the `prod` environment and relax that guard.
- **`.env` not matching DB** → `DATABASE_URL` and `POSTGRES_PASSWORD` inside
  `ENV_FILE` must agree with each other (compose re-interpolates from the same vars).
