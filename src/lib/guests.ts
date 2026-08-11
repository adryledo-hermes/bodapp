import { z } from "zod";

/**
 * Validate a guest-photo URL. The couple can store EITHER an app-relative URL
 * served by the existing tenant-scoped photo endpoint (`/api/photos/<id>/file`)
 * OR an absolute http(s) URL (e.g. a CDN). Everything else — empty values,
 * bare relative paths, extra path segments, or non-http protocols — is
 * rejected so a malicious value can't be stored/served as an image source.
 */
export function isValidPhotoUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false; // empty / whitespace

  // App-relative: /api/photos/<id>/file with exactly one id segment.
  const appRelative = /^\/api\/photos\/[^/]+\/file$/.test(v);
  if (appRelative) return true;

  // Absolute http(s) URLs only — no javascript:/ftp:/etc.
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false; // not a parseable absolute URL and not the app-relative form
  }
}

/** Zod schema for a guest photo: valid URL or explicit null (photo removed). */
const photoUrlSchema = z
  .string()
  .refine(isValidPhotoUrl, "URL de foto inválida")
  .nullable()
  .optional();

export const guestSchema = z.object({
  fullName: z.string().min(1, "Nombre requerido"),
  alias: z.string().optional().nullable(),
  relationshipContext: z.string().optional().nullable(),
  phone: z
    .string()
    .min(5)
    .regex(/^\+?[0-9 ]{5,20}$/, "Teléfono inválido"),
  allergies: z.array(z.string()).default([]),
  musicPrefs: z.array(z.string()).default([]),
  paperInvitation: z.boolean().default(false),
  plusOneAllowed: z.boolean().default(false),
  plusOneName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  seatNumber: z.number().int().min(1).nullable().optional(),
  photoUrl: photoUrlSchema,
});

export type GuestInput = z.infer<typeof guestSchema>;

/**
 * Split a comma-separated form value (allergies, music prefs) into trimmed,
 * non-empty entries. PURE helper so the client form logic is unit-tested.
 */
export function splitList(input: string | null | undefined): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Shape a guest row for API/UI output. JSON fields are arrays already. */
export function serializeGuest(guest: unknown) {
  return guest;
}
