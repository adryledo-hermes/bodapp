/**
 * Pure, typed helpers for guest RSVP (Task 10). No React/Next/Prisma imports
 * here so this module is unit-testable and free of server concerns (mirrors
 * src/lib/invitation.ts and src/lib/guest-view.ts).
 */

/** The 4 possible RSVP states, mirroring the Prisma RSVPStatus enum. */
export type RsvpStatus = "confirmed" | "declined" | "maybe" | "pending";

/** All known statuses, kept in display order. */
export const RSVP_STATUS_VALUES: RsvpStatus[] = [
  "confirmed",
  "declined",
  "maybe",
  "pending",
];

/** Spanish labels for each status (used by the RSVP controls). */
export const RSVP_STATUSES: { value: RsvpStatus; label: string }[] = [
  { value: "confirmed", label: "Confirmo asistencia" },
  { value: "declined", label: "No podré asistir" },
  { value: "maybe", label: "Quizás" },
  { value: "pending", label: "Pendiente" },
];

/** The cleaned, safe shape a guest submits for RSVP. */
export interface NormalizedRsvp {
  rsvpStatus: RsvpStatus;
  allergies: string[];
  musicPrefs: string[];
}

export function isRsvpStatus(v: unknown): v is RsvpStatus {
  return (
    typeof v === "string" && (RSVP_STATUS_VALUES as string[]).includes(v)
  );
}

/**
 * Coerce an arbitrary (unknown) value into a clean list of trimmed, non-empty,
 * de-duplicated strings — used for allergies and musicPrefs.
 */
function toStringList(raw: unknown): string[] {
  const source: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? [raw]
      : [];
  const cleaned: string[] = [];
  for (const item of source) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (!cleaned.includes(trimmed)) cleaned.push(trimmed);
  }
  return cleaned;
}

/**
 * Validate and clean raw RSVP input into a safe shape. An unknown/absent
 * status falls back to "pending"; allergies and musicPrefs default to [] and
 * are coerced from strings or arrays. Does not mutate the input.
 */
export function normalizeRsvpInput(raw: unknown): NormalizedRsvp {
  const r = (raw ?? {}) as Record<string, unknown>;
  const status = isRsvpStatus(r.rsvpStatus) ? r.rsvpStatus : "pending";
  return {
    rsvpStatus: status,
    allergies: toStringList(r.allergies),
    musicPrefs: toStringList(r.musicPrefs),
  };
}

/**
 * Simple transition guard. Guests are expected to be able to change their
 * RSVP at any time (even a "confirmed" guest might later decline), so any
 * valid next status is allowed from any current status. Returns false only
 * for an invalid next status.
 */
export function allowedRsvpTransitions(
  _current: RsvpStatus,
  next: string
): boolean {
  return isRsvpStatus(next);
}
