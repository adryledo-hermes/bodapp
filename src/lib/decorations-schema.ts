import { z } from "zod";

/** Base shape for a decoration item (kind + label + canvas position). */
export const decorationBaseSchema = z.object({
  kind: z.string().min(1, "Tipo requerido"),
  label: z.string().trim().max(120).nullable().optional(),
  positionX: z.number().finite(),
  positionY: z.number().finite(),
});

export const decorationCreateSchema = decorationBaseSchema;
export const decorationUpdateSchema = decorationBaseSchema.partial();

export type DecorationInput = z.infer<typeof decorationBaseSchema>;
