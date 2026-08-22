# PRD: Per-Guest RSVP, Children Tracking & Per-Guest Preferences

**Status:** Draft v1
**Date:** 2026-08-21
**Author:** Hermes Agent

---

## 1. Executive Summary

**Problem:** When a couple/family receives an invitation, all members currently share a single RSVP status, allergies, and music preferences. There's no way for individuals within a group to confirm separately, nor to track children vs adults.

**Proposed Solution:** Redesign the RSVP flow so each guest in an invitation can independently confirm/decline with per-guest allergies and music preferences. Add an `isChild` field to guests for separate counting/handling of children.

**Success Criteria:**
- Guest A can confirm while Guest B in the same invitation declines
- Each guest sees their own allergies/music chips, prefilled from their Guest row
- Children are visually separated in the RSVP form (distinct section)
- Panel dashboard shows adult vs child counts
- The RSVP form is responsive and works on mobile (guest-facing)

---

## 2. User Experience & Functionality

### User Personas
- **Invitee (Adult):** Receives an invitation for themselves + partner + kids. Wants to confirm for themselves but decline for kids, with personal allergies.
- **Couple (Host):** Sets per-guest `plusOneAllowed` and `isChild` in the panel. Sees RSVPs per-guest with individual dietary/music preferences.

### User Stories

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US1 | As an invitee, I want each person in my invitation to have their own confirm/decline toggle so I can say yes for me but no for my partner | - RSVP form lists each invited person individually with their own yes/no radios |
| US2 | As an invitee with kids, I want children to appear in a separate section so I can manage their attendance differently | - Guests with `isChild=true` are listed under "Niños" section |
| US3 | As a guest, I want to declare my own allergies and music preferences independent of others in my group | - Each guest in the RSVP form has their own allergies chips and music chips |
| US4 | As the couple, I want to mark a guest as a child in the panel so the RSVP reflects it | - Guest editor has an `isChild` checkbox (default false) |
| US5 | As the couple, I want the dashboard to show adults vs children counts | - Dashboard guests counters split into adults/children |

### Non-Goals
- Seat children at a separate table automatically (v2)
- Children's menu options in RSVP (v2)
- Age tracking beyond adult/child binary (v2)

---

## 3. Technical Specifications

### 3.1 Schema Changes

**Guest model** — add one field:
```
isChild  Boolean  @default(false)
```

No new model needed. The `rsvpStatus`, `allergies`, `musicPrefs`, `favoriteSong` fields already exist per-guest — they just weren't being used per-guest in the RSVP flow.

### 3.2 Data Model

Current state: Guests share an `invitationId` and the RSVP form sends one status + one set of allergies for "the group." The POST /api/rsvp updates **all guests with the same phone** to the same values.

**Fix:** The RSVP POST should accept an array of per-guest updates:
```json
{
  "guests": [
    { "id": "...", "rsvpStatus": "confirmed", "allergies": [...], "musicPrefs": [...] },
    { "id": "...", "rsvpStatus": "declined", "allergies": [], "musicPrefs": [] }
  ]
}
```

Each entry updates only its specific Guest row by `id`.

### 3.3 Integration Points

| Point | Current | Target |
|-------|---------|--------|
| POST /api/rsvp | Single status + allergies for phone-matched guests | Array of per-guest `{id, rsvpStatus, allergies, musicPrefs}` |
| InvitationPage UI | One set of RSVP buttons, allergies, music for "the group" | Per-guest row with individual controls |
| Panel — Guest editor | plusOneAllowed, no child flag | plusOneAllowed + isChild checkbox |
| Panel — Dashboard | Total guests count | Split into adults / children |
| Panel — Guests list | Child/adult not distinguished | Show child badge in guest cards |

### 3.4 Flow Diagram

```
Panel: Couple marks Guest X as child ✓
   ↓
Panel: Couple creates invitation linking Guests A, B, C (C is child)
   ↓
Guest receives link, opens invitation
   ↓
RSVP form renders:
  - "Adultos" section: Guest A (yes/no), Guest B (yes/no) — each with own allergies/music
  - "Niños" section: Guest C (yes/no) — no allergies/music (or simplified)
   ↓
Guest submits per-guest responses
   ↓
POST /api/rsvp with [{id: A, confirmed, allergies:[...]}, {id: B, declined}, {id: C, confirmed}]
   ↓
Each Guest row updated individually
   ↓
Page re-renders showing per-guest status
```

### 3.5 UI Specifications

#### RSVP Form — Per-Guest Cards

```
┌──────────────────────────────────────┐
│  Confirma tu asistencia              │
│                                      │
│  ── Adultos ──                       │
│                                      │
│  ┌─ Ana López ───────────────────┐   │
│  │  ● Confirmo  ○ No podré       │   │
│  │                                │   │
│  │  Alergias: [Gluten] [Lácteos] │   │
│  │  Otro: _________________      │   │
│  │                                │   │
│  │  Música: [Rock] [Pop]         │   │
│  │  Otro: _________________      │   │
│  └────────────────────────────────┘   │
│                                      │
│  ┌─ Luis López ──────────────────┐   │
│  │  ● Confirmo  ○ No podré       │   │
│  │  (no allergies/music shown    │   │
│  │   when declined)              │   │
│  └────────────────────────────────┘   │
│                                      │
│  ── Niños ──                         │
│                                      │
│  ┌─ Carlitos (3) ───────────────┐   │
│  │  ● Viene  ○ No viene          │   │
│  │  (no allergies/music — child) │   │
│  └────────────────────────────────┘   │
│                                      │
│  [Guardar mi respuesta]              │
└──────────────────────────────────────┘
```

**Key decisions:**
- Children get simplified RSVP (confirm/decline only, no allergies/music)
- Declined guests show no allergies/music fields (collapsed)
- Per-guest allergies prefilled from DB if previously saved

### 3.6 Security & Privacy

- The cookie (`invitation_access`) already scopes which wedding + invitation the guest can modify
- The POST body must include guest IDs that belong to that invitation (server validates)
- A guest cannot modify another invitation's guests even by guessing IDs

---

## 4. Implementation Plan

### Phase 1: Schema & Backend

| Step | File(s) | Description |
|------|---------|-------------|
| 1 | `prisma/schema.prisma` | Add `isChild Boolean @default(false)` to Guest |
| 2 | Migration | Create `add_isChild_to_guest` migration |
| 3 | `src/app/api/rsvp/route.ts` | Accept per-guest array: `{guests: [{id, rsvpStatus, allergies, musicPrefs}]}` instead of single body |
| 4 | `src/lib/rsvp.ts` | Update `NormalizedRsvp` to array |
| 5 | `src/components/guests/GuestCard.tsx` | Show "👶 Niño" badge when `isChild=true` |
| 6 | Panel guest editor | Add `isChild` checkbox to create/edit guest form |

### Phase 2: Frontend — Per-Guest RSVP

| Step | File(s) | Description |
|------|---------|-------------|
| 7 | `src/components/invite/InvitationPage.tsx` | Complete rewrite of the RSVP section: render one card per guest with individual status toggle, allergies chips, music chips. Children section separate. |
| 8 | i18n | Add child-specific keys ("guest.status.child", "inv.childrenSection") |
| 9 | POST body update | Wire the per-guest state to the fetch body |

### Phase 3: Dashboard

| Step | File(s) | Description |
|------|---------|-------------|
| 10 | `src/lib/dashboard.ts` | Split guest counts into `adults` and `children` |
| 11 | `src/components/dashboard/DashboardView.tsx` | Show both counts |

---

## 5. Risks & Tradeoffs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large families = long form | Poor UX on mobile with 8+ guest cards | Collapse declined guests; scrollable sections |
| Existing RSVP data format breaks | Old submissions have single body, not array | Backwards-compatible: accept both formats for 1 release cycle |
| Children without allergies is a simplification | Some parents want to declare kid allergies | Add optional allergies for children in v1.1 |

---

## 6. Open Questions

1. Should children have their own allergies/music fields? (Current proposal: no, for simplicity)
2. How is "child" age defined? (Current: just a boolean set by the couple — no age field)
3. Existing RSVPs with `maybe` were migrated to `pending`. For guests who submitted `maybe` → now `pending`, should they re-confirm?

---

*End of PRD*