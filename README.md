# Bodapp

Wedding management + invitation platform for **v1** on a Hetzner VPS.

Two surfaces:
- **Private couple panel** — dashboard, guests (editable Pokémon-card view + photos), seating planner (move tables, drag guests onto chairs), decoration/gift layer, task board, invitations manager.
- **Public invitation portal** — QR/link → phone → SMS OTP → personalized invitation + RSVP.

## v1 scope locks
- Multi-phone per invitation (couple/family): phone validated against the invitation's accepted phones *before* sending OTP.
- Invitations are created **manually per guest/couple/group** in the panel (Invitations manager); each gets its own QR code.
- Seating: always-visible chairs around each table — dropping a guest on a chair seats them AND fixes their seat number in one action; tables are draggable; every table auto-creates its attached centerpiece decoration.
- OTP via **Twilio SMS only** (no WhatsApp Business number).
- Couple's **bank account** shown on invitations.
- Photo upload: couple in v1, guests in v1.1 (guest photos now supported).
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

## Features (v1.2.1)
- **Guests**: editable Pokémon-style cards with **profile photo** (shown only on the card); **relationship context dropdown** (Familia, Amigos, Trabajo… + "Otro" free text); **allergy multiselect** (common options + free text); **music split** — genres multiselect + free-text favourite song. Search/filter by name, RSVP, allergy, table.
- **Seating**: always-visible chairs — drop a guest on a chair to seat them AND fix seat number in one action; re-seat a guest within the same table by dropping on another chair; tables draggable (incl. mobile, `touch-action: none`); **table size scales with capacity**; shape/capacity changes no longer reset position or capacity (PATCH writes only the changed field); duplicate-seat + capacity + conflict warnings.
- **Invitations**: per-guest/group invitations created manually (**already-invited guests are disabled** in the picker); each invitation can be opened and personalised — **decorative frame** (flores/lino/dorado/mínima/clásica/bohemia), **own image** and **text overrides** (names, message, date, venue, dress code) — with its **QR underneath** and a download link (the old QR panel is gone; `/qr` redirects to `/invitaciones`).
- **Dashboard** (`/panel`): guests/tables/invitations/tasks summary + next pending task.
- **Decorations**: decorations attachable to tables; every table auto-creates its centerpiece.
- **Tasks**: Kanban + calendar views, pre-seeded Spanish wedding checklist.
- **Public portal**: QR → phone → SMS OTP → personalised invitation + RSVP.

## Usage
1. Open the app; at `/` choose **Log in** (existing couple) or **Create a new couple** (self-registration at `/setup`).
2. Navigate: **mobile** uses a hamburger → slide-in drawer; **desktop** shows the links inline in the header.
3. **Guests** — add/edit guests (profile photo, context, allergies, music). Cards flip for details.
3. **Tables** — create tables, drag them around, drop guests on chairs.
4. **Invitations** — create per-group invitations, open one to personalise (frame/image/text) and download its QR.
5. **Tasks / Decorations / Photos** — plan and track the wedding.

## Roadmap
- ✅ **v1.2.1 (in progress)** — UX improvements: mobile nav drawer, guest context dropdown + allergy multiselect + music split (genres + favourite song), seating fixes (same-table re-seat, table size by capacity, position reset bug), separate profile photo vs wedding gallery, invitation panel upgrades (disable already-invited, rich per-invitation editor with frame/image/text, QR inline, QR panel removed).
- ✅ **v1.2** — Dashboard, per-guest seat numbers + draggable tables, attachable decorations (auto centerpiece), invitations per group, guest editing + photos, Playwright harness.
- ✅ **v1.1** — Multi-couple self-registration, welcome screen, configurable session expiry, logout, cookie/OTP hardening.
- ⬜ **v1.3** — Seating-map PDF export, guest relations UI, CSV import, OTP delivery dashboard, email notifications, 2FA, PWA.

## Testing
- **Unit tests:** `npm test` (vitest — pure libs: slugs, seating, OTP, i18n parity, …).
- **E2E UI tests (Playwright):** `npm run test:e2e` — see [`tests/e2e/README.md`](tests/e2e/README.md) (DB-free smoke on the welcome page; DB-backed flows added per feature).

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

