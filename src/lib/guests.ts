import { z } from "zod";

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
