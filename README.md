# Bodapp

Wedding management + invitation platform for **v1** on a Hetzner VPS.

Two surfaces:
- **Private couple panel** — guests (Pokémon-card view), seating planner, decoration/gift layer, task board.
- **Public invitation portal** — QR/link → phone → SMS OTP → personalized invitation + RSVP.

## v1 scope locks
- Multi-phone per invitation (couple/family): phone validated against the invitation's accepted phones *before* sending OTP.
- OTP via **Twilio SMS only** (no WhatsApp Business number).
- Couple's **bank account** shown on invitations.
- Photo upload: couple in v1, guests in v1.1.
- **No menu selection**, no CSV import, no 2FA, no GDPR tooling (all deferred to v2).
- No domain — served on IP/port over HTTP; invitations distributed by QR/link.

## Stack
Next.js 16 (App Router, webpack build), TypeScript, Tailwind + shadcn/ui, Framer Motion, Prisma + PostgreSQL, dnd-kit, Twilio, `qrcode`, next-intl, Docker Compose.

## Get started
```bash
cp .env.example .env   # fill real values
docker compose up -d    # start Postgres (if not already running)
npm install
npx prisma migrate dev
npm run dev
```

## Build & verify
```bash
npm run build   # uses webpack (Turbopack OOM-kills on the 1.9GB target box)
npm run lint
npm run typecheck
```

Deployment instructions: [`deploy/hetzner-setup.md`](deploy/hetzner-setup.md).

## Deploy (Docker Compose on Hetzner VPS)

- **One-click CI/CD deploy:** GitHub Actions → [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (SSH deploy: click *Run workflow* on the Actions tab, or auto on push to `main`). Configure the required secrets + one-time server setup in [`deploy/github-actions-deploy.md`](deploy/github-actions-deploy.md).
- **Manual runbook:** [`deploy/hetzner-setup.md`](deploy/hetzner-setup.md).
- **Image:** multi-stage `Dockerfile` — `node:20-alpine`, webpack build
  (`next build --webpack`), Next.js standalone `server.js`, runs as non-root,
  serves HTTP on port 3000.
- **Compose:** `docker-compose.yml` stacks `postgres` (healthchecked) +
  `migrate` (one-shot) + `app`; photos mount `./storage:/app/storage`.

```bash
cp .env.example .env          # fill real values (see runbook Step 4)
mkdir -p storage/photos && sudo chown -R 1001:1001 storage
docker compose up -d --build
docker compose run --rm migrate       # apply prisma/migrations
docker compose run --rm app npx --no-install prisma db seed   # optional demo couple
```

