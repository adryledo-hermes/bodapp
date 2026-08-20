# Bodapp v1.2.1 — Mobile nav, guest profile improvements, seating fixes, separate photos, rich invitations

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task (implementer + spec-review + quality-review per task, one atomic commit each).

**Goal:** Apply 11 UX/data fixes on top of the existing Bodapp panel: mobile nav drawer, structured guest fields (context dropdown, allergy multiselect, music split), intra-table guest re-seating, table sizing by capacity + two position bugs, separate guest-card vs wedding-gallery photos, invitation UX (disable already-invited guests, per-invitation editable frame/image/text, QRs under the invitation, no separate QR panel).

**Architecture:** extend Prisma schema with `Guest.musicGenres` (+ keep `musicPrefs` as favourite-song), `InvitationTemplate` gains per-invitation overrides (frame + image + text) OR a new `InvitationContent` JSON column on `Invitation`; split photo concepts: guest avatar (`Guest.photoUrl` stays) vs wedding gallery (`Photo` model). SeatingCanvas fixes are client-only logic (no schema). Drawer nav is a client component replacing the header nav on <lg.

**Tech Stack:** Next.js 16 App Router, TS, Tailwind, Prisma 7, zod, jose, vitest (+Playwright harness exists).

---

# Part A — Scope / decisions

| # | Request | Decision |
|---|---------|----------|
| 1 | Mobile: move menu from header to nav drawer | Client `MobileNavDrawer` (hamburger → slide-in panel w/ all panel links + locale + logout); header nav hidden on `lg:flex` only |
| 2 | relationshipContext as dropdown | Keep free text capability: a `<select>` with common Spanish contexts (familia, amigos, trabajo, universidad, infancia, vecinos, — otro (libre) —) that **includes an editable "otro" option**; column stays `String?` free text in DB |
| 3 | Allergies multiselect + free text | Comma-free UI: checkboxes of common allergies + "Otra (escribe)" input; stored as `String[]` (unchanged) via a new pure `buildAllergyTags` helper |
| 4 | Split musicPrefs → favourite song (free) + genres (multiselect) | Schema: rename semantics — `musicPrefs` stays as **genres** (String[]), ADD `favoriteSong String?`. Migration + form split + card display update. Pure helpers migrate values |
| 5 | Move guest within same table | `assignToTable` already PATCHes when dropping on a chair of same table? Currently early-returns when `fromTableId === targetTableId`. CHANGE: when same-table drop on a different chair → just update `seatNumber` (PATCH guest seatNumber); keep old seat cleared (duplicate-safe) |
| 6 | Adjust table size to capacity | Table node dimension derived from `capacity`: round tables get `Math.min(44, 8+capacity*3)` size; rectangle fixed ratio but width scales slightly. Pure helper `tableNodeSize(shape, capacity)` |
| 7 | Fix: changing shape/capacity moves table to origin & resets capacity | Root cause: `patchTable` overwrites `positionX/Y` with the **server's returned** values — if the server applies its own defaults (or the response omits them → `undefined`), state resets. FIX: `patchTable` must NOT touch `positionX/Y` unless `patch` actually contains them; and `toggleShape`/`changeCapacity` must not send `positionX/Y` in the payload. Also sqlite default-position issue check on server route |
| 8 | Separate guest profile photos vs wedding gallery | Keep `Guest.photoUrl` (profile, shown in card) + `Photo` model (wedding gallery, everyone uploads). Change: guest edit form uses `/api/photos` as today BUT labels it "foto de perfil"; the Fotos panel stays the shared wedding gallery (guests upload there via their invitation link? deferred — see non-goals). Ensure no cross-contamination in UI |
| 9 | Disable already-invited guests in invitation create form | In `InvitationsManager` create modal, guests with `invitationId != null` are rendered disabled + marked "ya invitada" (i18n). Server also rejects (invitationId already set → 409) |
| 10 | Beautiful invitation: personalizable frame + image per invitation | NEW per-invitation content: add `Invitation.content Json?` (frame: e.g. "flores"/"lino"; imageUrl: string|null; plus per-invitation text overrides {titleA,titleB,message,...}). Frame = CSS class presets (5 options — flores, lino, dorado, mínima, clásica) rendered on the public invitation. No new deps |
| 11 | Invitations panel: open+edit each invitation (text+image) / QRs under it, remove QR panel | Merge: `/invitaciones` becomes the single invitations hub: list → click → opens invitation detail with editable content (title, message, frame select, image upload) + QR below (preview + download). **DECIDED (user): remove `/qr` from the panel menu** (nav link + `nav.qr` i18n key removed); the `/qr` page/route is deleted and `/qr` URL redirects to `/invitaciones` so old links don't 404. QRs only appear inside the invitation detail. |

---

# 2. Task list (bite-sized, TDD, atomic commits)

### Task 1 — Schema: music split + invitation content
**Files:** `prisma/schema.prisma` (Guest.favoriteSong String?; Invitation.content Json?); migration `<ts>_music_and_invite_content/migration.sql`; `npx prisma generate`.
- Guest: add `favoriteSong String?` (nullable). `musicPrefs` = genres (documented: now means genres).
- Invitation: add `content Json?` (nullable — when unset, falls back to wedding template).
- Commit `feat(schema): guest favorite song + per-invitation content`.

### Task 1 — Music split + relation dropdown + allergy multiselect in guest forms
**Files:** `src/lib/guests.ts` (schema: favoriteSong; genre + allergy option constants; `buildAllergyTags`, `buildGenreTags`, `splitList` reuse; constants `GUEST_CONTEXTS`, `ALLERGY_OPTIONS`, `GENRE_OPTIONS`, `MUSIC_GENRES`); `src/components/guests/GuestForm.tsx` + `GuestEditForm.tsx` (relationship select w/ "otro" free text; allergy checkboxes + free text; music genres multiselect + favoriteSong free); `src/components/guests/GuestCard.tsx` (display favorite song ♫ + genres chips); tests `tests/lib/guests.test.ts` (TDD on parse/build helpers); `src/lib/guest-view.ts` (add favoriteSong to GuestCardData + page mapping).
- Commit: `feat(guests): structured context, allergy multiselect, music split`

### Task 3 — Mobile navigation drawer
**Files:** `src/app/(panel)/layout.tsx` (extract `navLinks` fn already; keep header for lg+; add drawer trigger btn <lg); NEW `src/components/NavDrawer.tsx` (client: hamburger → fixed overlay + slide-in panel with all `navLinks` + LocaleSwitcher + LogoutButton; closes on link click; aria-label/trap focus); reuse `navLinks` from layout (move to `src/lib/nav.ts` pure helper with locale). CSS via Tailwind classes; no new deps.
- Commit: `feat(panel): mobile navigation drawer`

### Task 3 — Same-table re-seat + table size by capacity + position bug
**Files:** `src/components/seating/SeatingCanvas.tsx`:
- `assignToTable` : when drop on a chair of the SAME table → update only that guest's `seatNumber` (PATCH `/api/guests/[id]` seatNumber); keep duplicate warning.
- `tableNodeSize(shape, capacity)` pure helper in `src/lib/seating.ts`: round `48px min`? Actually decide: round: `w=h= min(64, 40 + capacity*4)px`; rectangle: `w=min(180, 90+capacity*4)`, `h=max(48, min(72, capacity*2))`; use via inline style (replace fixed h-44/w-44 etc).
- `patchTable`: **NEVER** apply `positionX/positionY` from response unless patch contains them; add `const keepPosition = patch.positionX === undefined && patch.positionY === undefined` then in the map: `positionX: keepPosition ? t.positionX : table.positionX`, etc. Same for `capacity`/`shape` (already only set if sent? verify both shapes).
- `toggleShape`/`changeCapacity`: ensure they send ONLY `{shape}` / `{capacity}` (no position).
- Check server table PATCH route returns the sanitized table — confirm it does NOT apply defaults on partial PATCH (read route; if it uses `normalizeTable` that forces capacity/shape/position defaults even for partial patches → fix route to only write provided keys).
- Tests: pure `tableNodeSize` TDD + update seating tests; verify `patchTable` merge logic by unit? (client fn not unit-tested — keep in Canvas, verify via Playwright if feasible).
- Commit: `fix(seating): same-table re-seat, size-by-capacity, stop position reset on shape/capacity change`

### Task 4 — Separate guest profile vs wedding gallery
- `src/components/guests/GuestEditForm.tsx`: label the photo control "Foto de perfil"; keep guest_photo route (reuse `/api/photos` but it's wedding-scoped gallery... DECISION: keep using /api/photos for guest profile URL (it IS tenant-scoped and fine), but DOCUMENT in code that profile photos point at /api/photos/<id>/file while the FOTOS panel is the shared wedding gallery).
- Lori note: no schema change (Guest.photoUrl already separate from Photo rows). Add i18n labels: `guest.photoIsProfile`, `photos.guestGalleryTitle` etc.
- This task is mostly copy + i18n clarity; no functional change.
- Commit: `docs(ui): distinguish guest profile photo vs wedding gallery`

### T5 — Invitation creation: disable already-invited guests
- `src/app/api/invitations/route.ts` POST: reject if any guest `invitationId != null` → 409 `{error:"already invited"}`.
- `InvitationsManager.tsx`: guest option `disabled={guest.invitationId!=null}` + badge "ya invitada" (invman.alreadyInvited); filter them from selection set on load.
- i18n: `invman.alreadyInvited`.
- tests: unit? (route not unit-tested; rely on tsc/build) — maybe add pure `canInvite(guests)` helper + test.
- Commit: `feat(invitations): prevent double-inviting a guest`

### T6 — Rich per-invitation editor (frame + image + text) + QR under invitation (merge panels)
- Schema already has `Invitation.content Json?` (Task 0). NEW `src/lib/invitation-inline.ts`: `FRAME_OPTIONS` (flores/ lino / minimal / clasico / boho with label + css class), `INLINE_FIELDS` (titleA,titleB,message,date,time,venue,dressCode...), `normalizeInvitationContent(raw)` (pure, merge w/ template defaults), `invitationContentSchema` (zod) for PATCH.
- `src/app/api/invitations/[id]/route.ts`: add PATCH (update title? NO — title readonly; update `content` JSON) + GET single.
- NEW `src/components/invitations/InvitationDetail.tsx` (client): opened from manager card: left column form (frame select w/ preview swatches, image URL input w/ upload via /api/photos reuse, text fields titleA/B, message, date, venue, dressCode...), right column **live QR** (`/api/invitation/[id]/qr` img + download link) + Save button.
- `src/app/(panel)/invitaciones/page.tsx`: render InvitationDetail when invitation selected (server fetch content), pass holidays.
- Public invitation render: `src/lib/invitation-public-db.ts` + the invite page component (`src/app/invite/[token]/...`?) — apply `frame` css class + `imageUrl` + per-invitation text override when invitation has content; else template fallback.
- Remove QR page + nav: **DECIDED — remove `/qr` from the panel menu.** Delete `src/app/(panel)/qr/page.tsx` + `QrPanel.tsx`, drop `nav.qr` from i18n (both langs), remove the nav link; `/qr` 301-redirects to `/invitaciones` (add `redirect("/invitaciones")` stub page or next.config redirect). Keep `/api/invitation/[id]/qr` (now embedded).
- i18n: new inv*.keys (frame, image, preview, save...) BOTH lang.
- Tests: `tests/lib/invitation-inline.test.ts` TDD normalize + frame list + defaults.
- Commit: `feat(invitations): rich per-invitation editor (frame/image/text) + QR inline; drop separate QR panel`

### T7 — Final polish & review
- Update README (nav drawer, invitation hub, music split). One summary commit.
- Full suite green: tsc 0, vitest all, lint no new errs, Playwright smoke still passes.

---

# 3. Verification per task
- `NODE_OPTIONS="--max-old-space-size=1024" npx vitest run` — all green (currently 219).
- `NODE_OPTIONS="--max-old-space-size=800" npx tsc --noEmit` — 0 errors (box RAM permitting).
- `npm run lint` — no new errors (OOM-caveat on dev box).
- `npm run build` — NOT on dev box (OOM); verified on VPS deploy.
- Playwright smoke (welcome) green after T2 (nav layout changes could break it — check header link selectors).

# 4. Risks / open questions
- **QR panel removal** — is `/qr` still wanted as a separate view? User said "QRs must be under the invitation when I select one from the Invitations panel instead of a different panel" → remove QR panel, keep URL redirect (next.config or page redirect) to `/invitaciones`.
- **Invitation.image storage** — reuse `/api/photos` (tenant-scoped) and store its URL in invitation.content.imageUrl. No new storage code.
- **Relationship dropdown** — "otro" custom text keeps DB free-form; no migration.
- **Table drag on mobile** — already fixed (touch-none); Task 3's size change must keep the touch-none class.
- **Guest photos: "separate storage"** — profile vs gallery are ALREADY separate (Guest.photoUrl string vs Photo table); the ask is mostly about NOT having the guest edit control save into the wedding gallery — keeping as-is + clarity labels. Flag to user if they wanted a THIRD storage bucket (separate files per guest) — not needed.

---

# 5. Execution order
T0 (schema) → T1 (forms/schema UI) → T2 (nav) → T3 (seating fixes) → T4 (clarify photos) → T5 (invitation creation guard) → T6 (rich editor + merge QR) → T7 (docs).
Each: implementer → spec-review → quality-review → commit on `main` (push). Two-stage review per feature.