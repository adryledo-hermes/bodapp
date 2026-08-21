import { z } from "zod";
import { HEX_COLOR_RE } from "@/lib/invitation";

/** Colors of the invitation — primary and accent restricted to hex strings. */
export const templateColorsSchema = z.object({
  primary: z.string().max(20).regex(HEX_COLOR_RE).optional(),
  accent: z.string().max(20).regex(HEX_COLOR_RE).optional(),
});

/**
 * Partial update shape for the invitation template content. All fields are
 * optional so a partial payload is valid; the route normalizes missing fields
 * against DEFAULT_TEMPLATE before persisting.
 */
export const templateUpdateSchema = z.object({
  titleA: z.string().max(200).optional(),
  titleB: z.string().max(200).optional(),
  message: z.string().max(5000).optional(),
  date: z.string().max(60).optional(),
  time: z.string().max(60).optional(),
  venue: z.string().max(300).optional(),
  dressCode: z.string().max(200).optional(),
  schedule: z.string().max(3000).optional(),
  directions: z.string().max(2000).optional(),
  accommodation: z.string().max(2000).optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  sections: z.array(z.string().max(500)).optional(),
  colors: templateColorsSchema.optional(),
});

/** Update shape for the couple's bank account (stored on the Wedding row). */
export const weddingBankSchema = z.object({
  bankAccount: z.string().max(120).nullable().optional(),
});

/**
 * Body accepted by POST /api/invitation-template: the template content plus an
 * (optional) bank account to persist on the Wedding. Sending it here lets the
 * "Guardar y publicar" button atomically save both.
 */
export const templateSaveSchema = z.object({
  content: templateUpdateSchema.optional(),
  bankAccount: z.string().max(120).nullable().optional(),
});

export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;
export type WeddingBankInput = z.infer<typeof weddingBankSchema>;
export type TemplateSaveInput = z.infer<typeof templateSaveSchema>;
