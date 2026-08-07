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

Deployment instructions: `deploy/hetzner-setup.md`.
