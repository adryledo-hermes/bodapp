import { z } from "zod";

export const tableBaseSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  shape: z.string().default("round"),
  capacity: z.number().int().min(1).default(8),
  positionX: z.number().default(0),
  positionY: z.number().default(0),
});

export const tableCreateSchema = tableBaseSchema;
export const tableUpdateSchema = tableBaseSchema.partial();

export type TableInput = z.infer<typeof tableBaseSchema>;