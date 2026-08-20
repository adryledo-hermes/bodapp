import { z } from "zod";

export const tableBaseSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  shape: z.string().default("round"),
  capacity: z.number().int().min(1).default(8),
  positionX: z.number().default(0),
  positionY: z.number().default(0),
});

export const tableCreateSchema = tableBaseSchema;
// IMPORTANT: no .default() here — a partial PATCH must ONLY write the fields
// the client actually sent. If defaults were present, changing the shape would
// silently also reset capacity → 8 and positionX/Y → 0 (the position/capacity
// reset bug).
export const tableUpdateSchema = z.object({
  name: z.string().min(1, "Nombre requerido").optional(),
  shape: z.string().optional(),
  capacity: z.number().int().min(1).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

export type TableInput = z.infer<typeof tableBaseSchema>;