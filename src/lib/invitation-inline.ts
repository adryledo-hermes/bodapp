import { z } from "zod";

/**
 * Per-invitation personalization (v1.2.1): each invitation can override the
 * wedding-wide template with its own frame, image and copy. Pure + typed so the
 * editor, the public render and the API all share the same shape.
 */

/** Decorative frame presets. `cssClass` is applied to the invitation card. */
export const FRAME_OPTIONS = [
  { id: "flores", label: "Flores", cssClass: "inv-frame-flores" },
  { id: "lino", label: "Lino", cssClass: "inv-frame-lino" },
  { id: "dorado", label: "Dorado", cssClass: "inv-frame-dorado" },
  { id: "minima", label: "Mínima", cssClass: "inv-frame-minima" },
  { id: "clasica", label: "Clásica", cssClass: "inv-frame-clasica" },
  { id: "boho", label: "Bohemia", cssClass: "inv-frame-boho" },
] as const;

export type FrameId = (typeof FRAME_OPTIONS)[number]["id"];

export const DEFAULT_FRAME: FrameId = "clasica";

/** The fields a couple can override per invitation. */
export interface InvitationContent {
  frame: FrameId;
  imageUrl: string | null;
  titleA: string; // e.g. "Ana"
  titleB: string; // e.g. "Luis"
  message: string;
  date: string;
  time: string;
  venue: string;
  dressCode: string;
}

/** Merge arbitrary (possibly unknown/partial) per-invitation content. */
export function normalizeInvitationContent(raw: unknown): InvitationContent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const pickString = (key: string, fallback: string): string =>
    typeof r[key] === "string" ? (r[key] as string) : fallback;
  const frame =
    typeof r.frame === "string" &&
    FRAME_OPTIONS.some((f) => f.id === r.frame)
      ? (r.frame as FrameId)
      : DEFAULT_FRAME;
  return {
    frame,
    imageUrl:
      typeof r.imageUrl === "string" && r.imageUrl.trim()
        ? r.imageUrl.trim()
        : null,
    titleA: pickString("titleA", ""),
    titleB: pickString("titleB", ""),
    message: pickString("message", ""),
    date: pickString("date", ""),
    time: pickString("time", ""),
    venue: pickString("venue", ""),
    dressCode: pickString("dressCode", ""),
  };
}

/** Zod schema for PATCH /api/invitations/[id] (partial content update). */
export const invitationContentSchema = z.object({
  frame: z
    .enum(FRAME_OPTIONS.map((f) => f.id) as [FrameId, ...FrameId[]])
    .optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  titleA: z.string().max(200).optional(),
  titleB: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
  date: z.string().max(100).optional(),
  time: z.string().max(100).optional(),
  venue: z.string().max(300).optional(),
  dressCode: z.string().max(200).optional(),
});