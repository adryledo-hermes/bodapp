import { z } from "zod";

/** Per-invitation text/image overrides; visual design comes from the template. */
export interface InvitationContent {
  imageUrl: string | null;
  titleA: string;
  titleB: string;
  message: string;
  date: string;
  time: string;
  venue: string;
  dressCode: string;
  schedule: string;
  directions: string;
  accommodation: string;
}

export function normalizeInvitationContent(raw: unknown): InvitationContent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof r[key] === "string" ? String(r[key]) : "");
  return {
    imageUrl: typeof r.imageUrl === "string" && r.imageUrl.trim() ? r.imageUrl.trim() : null,
    titleA: text("titleA"), titleB: text("titleB"), message: text("message"),
    date: text("date"), time: text("time"), venue: text("venue"),
    dressCode: text("dressCode"), schedule: text("schedule"),
    directions: text("directions"), accommodation: text("accommodation"),
  };
}

export const invitationContentSchema = z.object({
  imageUrl: z.string().max(500).nullable().optional(),
  titleA: z.string().max(200).optional(), titleB: z.string().max(200).optional(),
  message: z.string().max(2000).optional(), date: z.string().max(100).optional(),
  time: z.string().max(100).optional(), venue: z.string().max(300).optional(),
  dressCode: z.string().max(200).optional(), schedule: z.string().max(3000).optional(),
  directions: z.string().max(2000).optional(), accommodation: z.string().max(2000).optional(),
});
