/**
 * Pure, typed helpers for the task board. No React/Next imports here so this
 * module is unit-testable and free of server/client concerns (mirrors
 * src/lib/seating.ts and src/lib/decorations.ts).
 */

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high";
export type TaskCategory = "legal" | "vendors" | "timing" | "gifts";

export interface TaskStatusMeta {
  value: TaskStatus;
  label: string;
  /** Tailwind colour classes for the column / status badge. */
  color: string;
}

/** The four statuses in board (column) order, left to right. */
export const TASK_STATUSES: readonly TaskStatusMeta[] = [
  { value: "todo", label: "Por hacer", color: "bg-slate-100 text-slate-700" },
  { value: "in_progress", label: "En curso", color: "bg-blue-100 text-blue-700" },
  { value: "done", label: "Hecho", color: "bg-emerald-100 text-emerald-700" },
  { value: "blocked", label: "Bloqueado", color: "bg-red-100 text-red-700" },
];

export interface TaskPriorityMeta {
  value: TaskPriority;
  label: string;
  /** Sorting weight: higher = more urgent. */
  weight: number;
  /** Tailwind colour classes for the priority badge. */
  color: string;
}

/** The three priorities, low -> high. */
export const TASK_PRIORITIES: readonly TaskPriorityMeta[] = [
  { value: "low", label: "Baja", weight: 1, color: "bg-slate-100 text-slate-600" },
  { value: "medium", label: "Media", weight: 2, color: "bg-amber-100 text-amber-700" },
  { value: "high", label: "Alta", weight: 3, color: "bg-red-100 text-red-700" },
];

export interface TaskCategoryMeta {
  value: TaskCategory;
  label: string;
  emoji: string;
}

export const TASK_CATEGORIES: readonly TaskCategoryMeta[] = [
  { value: "legal", label: "Trámites legales", emoji: "📋" },
  { value: "vendors", label: "Proveedores", emoji: "🤝" },
  { value: "timing", label: "Timing del día", emoji: "⏱️" },
  { value: "gifts", label: "Regalos", emoji: "🎁" },
];

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/** A single seed row for the canonical Spanish checklist. */
export interface TaskSeed {
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  description?: string;
}

const TODO: TaskStatus = "todo";

/**
 * The canonical Spanish wedding checklist that couples seed their board with.
 * Spread across the four categories so the board looks alive on first load.
 */
export const TASKS_SEED: readonly TaskSeed[] = [
  // legal
  { title: "Llamar al juzgado", category: "legal", priority: "high", status: TODO, description: "Preguntar fechas y requisitos para la boda civil." },
  { title: "Pedir traslado de expediente", category: "legal", priority: "medium", status: TODO },
  { title: "Cita para casarse", category: "legal", priority: "high", status: TODO },
  { title: "Reunir documentación necesaria (DNI, certificados)", category: "legal", priority: "medium", status: TODO },
  { title: "Comprobar empadronamiento", category: "legal", priority: "low", status: TODO },
  // vendors
  { title: "Contratar catering", category: "vendors", priority: "high", status: TODO, description: "Menú, número de invitados y opciones de barra." },
  { title: "Reservar fotógrafo/vídeo", category: "vendors", priority: "high", status: TODO },
  { title: "Contratar música/DJ", category: "vendors", priority: "medium", status: TODO },
  { title: "Reservar flores y centros", category: "vendors", priority: "medium", status: TODO },
  { title: "Reservar transporte", category: "vendors", priority: "medium", status: TODO },
  { title: "Reservar el venue/lugar", category: "vendors", priority: "high", status: TODO },
  // timing
  { title: "Ensayo de la ceremonia", category: "timing", priority: "medium", status: TODO },
  { title: "Llegada de invitados", category: "timing", priority: "low", status: TODO },
  { title: "Cóctel", category: "timing", priority: "low", status: TODO },
  { title: "Cena", category: "timing", priority: "high", status: TODO },
  { title: "Discursos", category: "timing", priority: "medium", status: TODO },
  { title: "Primer baile", category: "timing", priority: "low", status: TODO },
  { title: "Barra libre", category: "timing", priority: "low", status: TODO },
  // gifts
  { title: "Crear lista de regalos", category: "gifts", priority: "medium", status: TODO },
  { title: "Regalos para padrinos/testigos", category: "gifts", priority: "medium", status: TODO },
  { title: "Detalles/recuerdos para invitados", category: "gifts", priority: "medium", status: TODO },
  { title: "Tarjetas de agradecimiento", category: "gifts", priority: "low", status: TODO },
];

/** A task that can be passed to sortTasks (shared by tests and the UI). */
export interface SortableTask {
  id: string;
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | number | Date | null | undefined;
}

/** A task serialized for the client UI (dates flattened to ISO strings). */
export interface TaskCardData {
  id: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  assigneeId: string | null;
  notes: string | null;
  createdAt: string;
}

/** Shallow-container helpers for the UI (stable lookup, no mutation). */

/** Extract a status' display metadata; falls back to the first status. */
export function statusMeta(status: string): TaskStatusMeta {
  return (
    TASK_STATUSES.find((s) => s.value === status) ??
    TASK_STATUSES[0]
  );
}

/** Extract a priority's display metadata; falls back to medium. */
export function priorityMeta(priority: string): TaskPriorityMeta {
  return (
    TASK_PRIORITIES.find((p) => p.value === priority) ??
    TASK_PRIORITIES[1]
  );
}

/** Extract a category's display metadata; falls back to the first category. */
export function categoryMeta(category: string): TaskCategoryMeta {
  return (
    TASK_CATEGORIES.find((c) => c.value === category) ??
    TASK_CATEGORIES[0]
  );
}

/**
 * Sort tasks by due date ascending (tasks without a due date sink to the
 * bottom), breaking ties by priority weight (high > medium > low). Returns a
 * new array; the input is never mutated.
 */
export function sortTasks<T extends SortableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const aTime = a.dueDate ? new Date(a.dueDate).getTime() : null;
    const bTime = b.dueDate ? new Date(b.dueDate).getTime() : null;

    if (aTime === null && bTime === null) {
      // No dates: fall through to the priority comparison below.
    } else if (aTime === null) {
      return 1; // nulls last
    } else if (bTime === null) {
      return -1;
    } else if (aTime !== bTime) {
      return aTime - bTime;
    }

    return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
  });
}
