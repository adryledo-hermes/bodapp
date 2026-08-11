import { z } from "zod";

/** Base shape for a decoration item (kind + label + canvas position). */
export const decorationBaseSchema = z.object({
  kind: z.string().min(1, "Tipo requerido"),
  label: z.string().trim().max(120).nullable().optional(),
  positionX: z.number().finite(),
  positionY: z.number().finite(),
  // Attach to a table (string id) or detach it (null). Used by the seating
  // canvas so centerpieces travel with their table.
  tableId: z.string().min(1).nullable().optional(),
});

export const decorationCreateSchema = decorationBaseSchema;
export const decorationUpdateSchema = decorationBaseSchema.partial();

export type DecorationInput = z.infer<typeof decorationBaseSchema>;
