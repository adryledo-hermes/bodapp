# Bodapp — v1 Acceptance

Status: **v1 feature-complete**. All scope below is implemented, unit-tested (vitest ~159 tests), type-checked (`tsc --noEmit`), lint-clean, and builds (`next build --webpack`).

> This document records the v1 scope closures **verified in code** — it is not a
> live-deployment checklist. Live serving on a host is pending server provision
> + credentials (see [Docker deploy](#docker-deploy-artifacts)).

## Scope closures (confirmed in code)

| Area | v1 status | Where |
|------|-----------|-------|
| **Multi-phone per invitation** | ✅ Built. `acceptedPhones` allowlist is gated *before* any OTP is sent (`isPhoneAllowed`), so a couple/family invitation with several phones works. | `src/lib/otp.ts`, `src/lib/otp-flow.ts`, `src/app/api/otp/request/route.ts` |
| **OTP via SMS only** | ✅ Built. Twilio SMS is the only channel — explicitly **no WhatsApp Business number**. | `src/lib/otp-sms.ts` |
| **Couple bank account on invitations** | ✅ Built. Stored on the `Wedding` row, atomic with template publish, shown in the public invitation's bank-transfer section. | `src/lib/invitation-schema.ts`, `src/app/api/invitation-template/route.ts`, `src/components/invite/InvitationPage.tsx` |
| **Duo photo upload (v1)** | ✅ Built. Couple uploads photos (PNG/JPG/WEBP/GIF, ≤10 MB); served tenant-scoped. | `src/app/api/photos/*`, `src/lib/storage.ts` |
| **Guest photo upload (v1.1)** | ⛔ **NOT built** — deferred to v1.1 by design. | — |
| **Menu selection** | ⛔ Not built — deferred to v2. | — |
| **CSV import / 2FA / GDPR tooling** | ⛔ Not built — deferred to v2. | — |
| **No domain — IP/HTTP serve** | ✅ Built. Served on IP:port over HTTP; invitations distributed via QR code or link (`PUBLIC_BASE_URL`). | `src/lib/qr.ts`, `deploy/hetzner-setup.md`, `docker-compose.yml` |
| **ES/EN i18n** | ✅ Built. Full dictionary parity for both locales, server + client. | `src/lib/i18n.ts` |

## Public invitation flow (end-to-end)

1. Couple generates one **QR** per invitation (`/api/invitation/[id]/qr`, panel-authorized).
2. Guest scans / opens the link → `/w/[slug]/invite?g=<invitationId>`.
3. Guest enters a phone; it is checked against the invitation's `acceptedPhones` allowlist **before** any OTP is generated or sent (anti-probing: unknown link and disallowed phone return the same generic error).
4. A 6-digit OTP is sent via SMS (`src/lib/otp-sms.ts`); only its SHA-256 hash is persisted; rate-limited per phone (max 5/hr, sliding window).
5. Guest verifies the code → short-lived `invitation_access` cookie → personalized invitation + RSVP.

**RSVP authorization:** the guest's `invitationAccess` cookie (invitationId/weddingId/phone) is the only source of auth for `/api/rsvp`. Only the Guest row(s) whose phone matches the authenticated phone are updated — a family invitation never clobbers every member's allergies/music (FIX I-1).

## Multi-tenant security (verified)

- Every **panel** route requires a couple session (`requireSession`) and scopes every query/write with `tenantWhere` (weddingId from the session) or an explicit ownership `findFirst({ id, weddingId })` guard before update/delete.
- Photo file serving and photo DELETE are tenant-scoped; photo DELETE is additionally re-scoped on the write (`where: { id, weddingId }`) as defense-in-depth against TOCTOU.
- Public flows (OTP, RSVP) never take a tenant id from the request body for authorization.
- Template publish re-scopes the update to the session wedding inside the transaction.
- File upload: path-traversal guards + size (10 MB) + MIME allowlist in `src/lib/storage.ts` / `src/app/api/photos/route.ts`.
- Colors: primary/accent validated against a hex regex (`HEX_COLOR_RE`) before persist.
- No `dangerouslySetInnerHTML`; no hardcoded secrets in `src/`.

## Verification commands

```bash
npx tsc --noEmit                    # 0 errors
npm run lint                        # no errors
npx vitest run                      # all pass (~159)
npm run build                       # passes (webpack)
npm audit                           # 0 vulnerabilities
```

## Docker deploy artifacts

- Multi-stage **Dockerfile** (node:20-alpine, webpack build, standalone `server.js`, non-root, HTTP :3000).
- **docker-compose.yml** (postgres healthchecked + one-shot migrate + app; photos volume `./storage:/app/storage`).
- **Runbook:** `deploy/hetzner-setup.md`.
- **Live deploy is pending** — needs the Hetzner server provisioned and real credentials in `.env` (DB, Twilio, app base URL). No live DB / no Docker was available in the build environment, so deployment has not yet been exercised end-to-end.
