# Bodapp v1.2 — Plan: Guest editing, visual seating, attachable decorations, per-group invitations, UI tests

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task (implementer + spec-review + quality-review per task, one atomic commit each).

**Goal:** Unblock the couple's pre-wedding workflow: editable guest profiles (with photo), a visual chair-based seating map (drag guest → chair, fixing table+seat in one motion), reliable table dragging, decorations attachable to tables (created with the table), and manual per-group invitation creation. Plus a Playwright UI-test harness.

**Architecture:** Extend the existing Prisma schema minimally (Guest.photoUrl, Invitation.guests relation); rework SeatingCanvas's seat interaction around always-visible chairs; add decoration.tableId optional FK; add an invitations management page (manual creation choosing guests). All writes reuse tenant-scoped API patterns already in place.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind, Prisma 7 (driver adapter), zod, jose, vitest (+ Playwright for UI smoke tests).

---

# Part A — PRD (concise)

## 1. Executive Summary
**Problem:** The couple cannot fully prepare the dining room map and invitations: guest data is read-only, seat assignment is a bare number input, table dragging is finicky, centerpieces aren't tied to tables, and invitations can only exist via the QR page without a creation flow.
**Solution:** A seating canvas with always-visible chairs (drag guest onto a chair = assign table+seat in one action), stable table dragging, editable guest profiles with optional photo, table-attached decorations (auto-created centerpiece), and an Invitations page where the couple manually creates a personalised invitation per group of guests.
**Success criteria:**
- 100% of table/seat assignments doable via drag onto chairs (seat-number input removed from primary flow).
- Moving a table keeps its guests and seats; no dropped-drag state loss.
- Each new Table has a centerpiece decoration automatically (kind=centerpiece) attached.
- An invitation can be created selecting ≥1 guests; QR page lists them per invitation.
- Playwright smoke test covers login → add guest → seat drag → create invitation (green in CI).

## 2. UX & Functionality
**Personas:** The couple (Adrián) — panel side. Guests — no change (public side untouched this round).

**User stories:**
- *As a couple, I want to edit a guest's details (name, phone, allergies, photo) so my data stays correct.*
  - AC: GuestCard has "Editar"; form prefilled; PATCH persists; photo uploads via existing photo storage; list refreshes.
- *As a couple, I want to see chairs around each table and drop a guest on a chair so their table+seat are set visually.*
  - AC: each table renders `capacity` chairs (round: around; rectangle: 2 rows); dropping an unassigned guest on chair n sets tableId + seatNumber=n in one PATCH; guest chip appears on that chair; duplicate-seat warning still shows.
- *As a couple, I want to drag a table smoothly so I can lay out the room.*
  - AC: pointer-drag moves the table node with live preview; drop persists positionX/Y; drag works reliably on first pointerdown (fix current flaky behavior); guest-drop and table-move don't conflict.
- *As a couple, I want decorations like a centerpiece attached to a table (auto-created) so the map is realistic.*
  - AC: creating a table also creates an attached centerpiece (decoration.kind=centerpiece, tableId set, position derived); decorations panel can (re)attach/de-attach decorations to tables; centerpiece moves with the table.
- *As a couple, I want to create a personalised invitation for a guest/group so each gets its QR.*
  - AC: Invitations page lists existing invitations; "Crear invitación" form picks title + guests (multi-select, each guest's phone included in acceptedPhones); creates Invitation + link to guest(s); QR page shows it immediately.
- *As a couple, I want the UI checked automatically so regressions are caught.*
  - AC: Playwright smoke suite on the panel flows; runs headless in CI.

**Non-goals:** guest-facing invitation redesign; seat auto-balancing; printable seating-map export (still v1.3); invitation design/layout editor per invitation (uses the single wedding template); role-based access beyond couple; public guest photo upload.

## 3. Technical Spec (delta only)
- **Schema:** `Guest.photoUrl String?`; `Invitation.tableId? none`; new relation `Invitation.guests Guest[]` (join: add `invitationId String?` to Guest + `guests Guest[]` on Invitation); `Decoration.tableId String?` + relation (nullable, keep free-floating decorations).
- **Migrations:** 3 small ALTERs generated manually (add column / relation) — no DB available locally; apply via `migrate deploy` on the VPS.
- **API:** 
  - `PATCH /api/guests/[id]` — extend guestSchema with photoUrl (+ invitationId?) (already tenant-scoped).
  - `POST /api/tables` — also inserts one centerpiece decoration in the same transaction.
  - `PATCH /api/decorations/[id]` — allow setting tableId (attach) / null (detach).
  - `POST /api/invitations` — create Invitation with title + guestIds (validates all guests belong to the wedding; sets acceptedPhones = union of guest phones); `DELETE /api/invitations/[id]`.
  - `GET /api/invitations` — list with guests (for QR page + invitations page).
- **Client:** SeatingCanvas rework (chair rendering + drag-to-chair + reliable table drag); GuestCard/Board edit modal incl. photo upload; DecorationsPlanner attach UI; new Invitations page (`/invitaciones`) + nav link; QR page uses the shared invitations list.
- **Storage:** guest photos reuse `src/lib/storage.ts` (PHOTO_STORAGE_DIR) with a `photo` field → store URL `/api/photos/[id]/file` or a dedicated guest-photo route (decide in task; prefer reusing the Photo model for simplicity).
- **Auth/security:** everything tenant-scoped via tenantWhere; ownership checks before PATCH/DELETE; file upload validation (type/size/traversal) as existing.
- **i18n:** all new strings in both es+en (parity test enforced).

## 4. Risks & Roadmap
- **Risk (medium):** HTML5 DnD chair interaction can be finicky cross-browser → mitigate with pointer-events + a fallback click-to-assign; Playwright test locks the happy path.
- **Risk (low):** schema relation Guest↔Invitation touches public RSVP flow → keep invitationId nullable & non-breaking; public loaders must still work with null invitationId.
- **Roadmap:** v1.2 this plan → v1.3 printable/exportable seating map + per-invitation template overrides → v2.0 multi-tenant polish.

---

# Part B — Implementation Plan (bite-sized tasks, TDD, atomic commits)

**Conventions:** run checks with `NODE_OPTIONS="--max-old-space-size=1024"` for tsc/vitest; DO NOT run `prisma migrate dev/db push` (no DB); write migrations manually under `prisma/migrations/<ts>_<name>/migration.sql` + `npx prisma generate`; `next build` OOMs on this box — verify with tsc + vitest + lint (build passes on VPS). Each task = one atomic commit + push. Two-stage review after each feature (spec → quality).

### Task 0: Playwright UI-test harness
**Files:** add devDep `@playwright/test`; `playwright.config.ts`; `tests/e2e/*.spec.ts`; CI note in README.
- Install: `npm i -D @playwright/test && npx playwright install chromium` (note: box RAM is tight — install browser only if it fits; else document CI-only).
- One smoke spec: setup → login → add guest → seat drag → create invitation, run against a dev server with a test DB env (document `TEST_DATABASE_URL`).
- Commit `test(e2e): playwright smoke harness`.

### Task 1: Guest editing + photo
**Files:** schema (Guest.photoUrl), migration, `src/lib/guests.ts` (photoUrl + invitationId), `PATCH /api/guests/[id]` (already partial — extend schema only), `src/components/guests/GuestCard.tsx` (edit button), new `GuestEditForm.tsx` (modal, incl. photo upload reusing storage/Photo), `GuestBoard.tsx` (edit wiring + refresh), i18n keys.
- TDD: pure `extendGuestSchema` additions; test photo URL validation.
- Commit `feat(guests): editable guest profile with photo`.

### Task 2: Chairs on canvas — drag guest to chair
**Files:** `src/components/seating/SeatingCanvas.tsx` (major rework of seat area), `src/lib/seating.ts` (chair layout helpers: `chairPositions(table)` pure — round circle / rectangle 2 rows; keep duplicates logic), tests in `tests/lib/seating.test.ts`.
- Chairs always visible around each table; drop unassigned guest on chair n → single PATCH guest {tableId, seatNumber:n} (existing `/api/tables/[id]/guests` or `/api/guests/[id]` — reuse cleanest, document); chip appears on chair; keep duplicate-seat warning; remove/inline the old numeric seat control.
- TDD: `chairPositions` correctness (n chairs, round vs rect, spacing), seat assignment helper.
- Commit `feat(seating): drag guests onto chairs (table+seat in one) and drop seat control`.

### Task 3: Reliable table dragging
**Files:** `SeatingCanvas.tsx` (table drag handlers), maybe small pure helper.
- Fix flaky drag: pointerdown on table starts move (ignore interactive children like buttons/selects), live position preview clamped 0–100%, pointerup persists via `PATCH /api/tables/[id]` (optimistic + rollback); ensure guest-drop targets still work (distinct affordance documented).
- Test: pure clamp/`dragDelta` helper if extracted; Playwright drag smoke if feasible.
- Commit `fix(seating): reliable table dragging on canvas`.

### Task 4: Attachable & auto-created decorations
**Files:** schema (Decoration.tableId relation), migration, `POST /api/tables` (create centerpiece in same tx), `PATCH /api/decorations/[id]` (attach tableId / detach null), `src/components/decorations/*` (attach UI: "adjuntar a mesa" select + centerpiece shown ON the table, moves with it), i18n.
- TDD: pure helper `defaultCenterpieceFor(table)` (position near table center).
- Commit `feat(decorations): attachable decorations; tables auto-create centerpiece`.

### Task 5: Manual invitation creation (per guest/group)
**Files:** schema (Guest.invitationId relation to Invitation + Invitation.guests), migration, `src/lib/invitations.ts` (pure: build acceptedPhones from guests, slug), `POST/GET/DELETE /api/invitations`, new `src/app/(panel)/invitaciones/page.tsx` + `InvitationsManager.tsx` (list + create modal with title + multi-select guests + summary of phones), QR page list source, i18n.
- TDD: `buildAcceptedPhones`, validation (guests belong to wedding), empty-selection rejected.
- Commit `feat(invitations): create per-group personalised invitations`.

### Task 6: Final polish + review pass
- i18n parity, empty states, responsive check, full suite green, README updated (invitations + seating + UI testing), one summary commit if needed.

---

## Validation (whole plan)
- `npx vitest run` — all green (existing 201 + new suites).
- `npx tsc --noEmit` — 0 errors (800MB heap; build run only on VPS).
- `npm run lint` — no new errors.
- Playwright smoke suite green (CI or local with test DB).
- Manual VPS deploy + checklist: edit guest w/ photo → chair drag → move table → centerpiece on table → create invitation → QR shows it.