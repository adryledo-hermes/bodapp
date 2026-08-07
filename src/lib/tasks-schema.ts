import { z } from "zod";

const categoryEnum = z.enum(["legal", "vendors", "timing", "gifts"]);
const priorityEnum = z.enum(["low", "medium", "high"]);
const statusEnum = z.enum(["todo", "in_progress", "done", "blocked"]);

/** date input may be an ISO string or null; coerced to a Date for the DB. */
const dateField = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : null));

/** Create a task: only title is required; everything else has a sensible default. */
export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(200),
  category: categoryEnum.default("legal"),
  priority: priorityEnum.default("medium"),
  status: statusEnum.default("todo"),
  dueDate: dateField,
  description: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

/** Update any subset of fields (used for status drag, inline edits, deletes). */
export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(200).optional(),
  category: categoryEnum.optional(),
  priority: priorityEnum.optional(),
  status: statusEnum.optional(),
  dueDate: dateField,
  description: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
