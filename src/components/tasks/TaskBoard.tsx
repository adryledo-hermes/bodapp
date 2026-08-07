"use client";

import { useState } from "react";
import {
  sortTasks,
  statusMeta,
  priorityMeta,
  categoryMeta,
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_CATEGORIES,
  type TaskCardData,
  type TaskStatus,
  type TaskPriority,
  type TaskCategory,
} from "@/lib/tasks";

type Feedback = { kind: "ok" | "err"; text: string } | null;
type ViewMode = "tablero" | "calendario";

const inputClassName =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";

async function send(
  url: string,
  method: string,
  body?: unknown
): Promise<Response> {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

interface FormState {
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  description: string;
}

const emptyForm: FormState = {
  title: "",
  category: "legal",
  priority: "medium",
  status: "todo",
  dueDate: "",
  description: "",
};

/** Localised short date (e.g. "12 mar 2026") or "—". */
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function TaskCard({
  task,
  onDelete,
  onEdit,
}: {
  task: TaskCardData;
  onDelete: (id: string) => void;
  onEdit: (task: TaskCardData) => void;
}) {
  const prio = priorityMeta(task.priority);
  const cat = categoryMeta(task.category);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:shadow active:cursor-grabbing"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${prio.color}`}
        >
          {prio.label}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          {cat.emoji} {cat.label}
        </span>
        <span className="ml-auto text-[11px] text-slate-400">
          📅 {formatDate(task.dueDate)}
        </span>
      </div>
      <p className="text-sm font-medium text-slate-800">{task.title}</p>
      {task.description ? (
        <p className="mt-1 text-xs text-slate-500">{task.description}</p>
      ) : null}
      <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onEdit(task)}
          className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          ✏️ Editar
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
        >
          🗑️ Eliminar
        </button>
      </div>
    </div>
  );
}

export default function TaskBoard({
  initialTasks,
}: {
  initialTasks: TaskCardData[];
}) {
  const [tasks, setTasks] = useState<TaskCardData[]>(initialTasks);
  const [view, setView] = useState<ViewMode>("tablero");
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Edit state: the task being edited (or null)
  const [editing, setEditing] = useState<TaskCardData | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);

  const [seeding, setSeeding] = useState(false);

  function flash(kind: "ok" | "err", text: string) {
    setFeedback({ kind, text });
  }

  function updateTask(id: string, patch: Partial<TaskCardData>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  /** Persistent status change (from the Kanban drag) with rollback. */
  async function moveStatus(id: string, status: TaskStatus) {
    const prev = tasks;
    updateTask(id, { status });
    let res: Response;
    try {
      res = await send(`/api/tasks/${id}`, "PATCH", { status });
    } catch {
      setTasks(prev);
      flash("err", "Error de red: no se pudo mover la tarea");
      return;
    }
    if (!res.ok) {
      setTasks(prev);
      flash("err", "No se pudo cambiar el estado. Reintenta.");
    }
  }

  /** Create a task and append it server-confirmed. */
  async function createTask() {
    if (!form.title.trim()) {
      flash("err", "Ponle un título a la tarea.");
      return;
    }
    setSaving(true);
    let res: Response;
    try {
      res = await send("/api/tasks", "POST", {
        title: form.title.trim(),
        category: form.category,
        priority: form.priority,
        dueDate: form.dueDate || null,
        description: form.description.trim() || null,
      });
    } catch {
      setSaving(false);
      flash("err", "Error de red: no se pudo guardar");
      return;
    }
    if (!res.ok) {
      setSaving(false);
      flash("err", "No se pudo crear la tarea.");
      return;
    }
    const { task } = await res.json();
    setTasks((prev) => [toCard(task), ...prev]);
    setForm(emptyForm);
    setShowForm(false);
    setSaving(false);
    flash("ok", "Tarea creada.");
  }

  /** Save inline edits via PATCH with rollback. */
  async function saveEdit() {
    if (!editing) return;
    if (!editForm.title.trim()) {
      flash("err", "El título no puede estar vacío.");
      return;
    }
    const prev = tasks;
    const patched: Partial<TaskCardData> = {
      title: editForm.title.trim(),
      category: editForm.category,
      priority: editForm.priority,
      status: editForm.status,
      dueDate: editForm.dueDate || null,
      description: editForm.description.trim() || null,
    };
    updateTask(editing.id, patched);

    let res: Response;
    try {
      res = await send(`/api/tasks/${editing.id}`, "PATCH", patched);
    } catch {
      setTasks(prev);
      flash("err", "Error de red: no se pudo guardar");
      setEditing(null);
      return;
    }
    if (!res.ok) {
      setTasks(prev);
      flash("err", "No se pudo guardar la tarea.");
      setEditing(null);
      return;
    }
    setEditing(null);
    flash("ok", "Tarea actualizada.");
  }

  /** Delete a task (optimistic) with rollback on failure. */
  async function deleteTask(id: string) {
    if (!window.confirm("¿Eliminar esta tarea?")) return;
    const prev = tasks;
    setTasks((prevList) => prevList.filter((t) => t.id !== id));
    let res: Response;
    try {
      res = await send(`/api/tasks/${id}`, "DELETE");
    } catch {
      setTasks(prev);
      flash("err", "Error de red: no se pudo eliminar");
      return;
    }
    if (!res.ok) {
      setTasks(prev);
      flash("err", "No se pudo eliminar la tarea.");
    }
  }

  /** Seed the canonical checklist (idempotent server-side). */
  async function seedTasks() {
    if (tasks.length > 0) {
      if (!window.confirm("Ya hay tareas. ¿Añadir la checklist de todas formas?")) {
        return;
      }
    }
    setSeeding(true);
    let res: Response;
    try {
      res = await send("/api/wedding/seed-tasks", "POST");
    } catch {
      setSeeding(false);
      flash("err", "Error de red: no se pudo cargar la checklist");
      return;
    }
    if (!res.ok) {
      setSeeding(false);
      flash("err", "No se pudo cargar la checklist.");
      return;
    }
    const { inserted } = await res.json();
    if (inserted === 0) {
      flash("ok", "Ya tenías tareas: no se duplicó nada.");
    } else {
      flash("ok", `Checklist cargada (${inserted} tareas).`);
    }
    setSeeding(false);
    // Refresh from the server so the board reflects the newly seeded rows.
    const list = await fetch("/api/tasks");
    if (list.ok) {
      const { tasks: fresh } = await list.json();
      setTasks(fresh.map(toCard));
    }
  }

  const sorted = sortTasks(tasks);

  function openEdit(task: TaskCardData) {
    setEditing(task);
    setEditForm({
      title: task.title,
      category: task.category,
      priority: task.priority,
      status: task.status,
      dueDate: (task.dueDate || "").slice(0, 10),
      description: task.description ?? "",
    });
  }

  const tab = (value: ViewMode, label: string) => (
    <button
      onClick={() => setView(value)}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        view === value
          ? "bg-indigo-600 text-white"
          : "bg-white text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`rounded-lg px-4 py-2 text-sm ${
            feedback.kind === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          {tab("tablero", "🗂️ Tablero")}
          {tab("calendario", "📅 Calendario")}
        </div>
        <div className="flex items-center gap-2">
          {tasks.length === 0 && (
            <button
              onClick={seedTasks}
              disabled={seeding}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {seeding ? "Cargando…" : "📋 Cargar checklist de boda"}
            </button>
          )}
          {tasks.length > 0 && (
            <button
              onClick={seedTasks}
              disabled={seeding}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="Re-añadir la checklist (no duplica)"
            >
              {seeding ? "Cargando…" : "📋 Añadir checklist"}
            </button>
          )}
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            {showForm ? "Cancelar" : "+ Añadir tarea"}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-500">Título *</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputClassName}
              placeholder="Contratar florista…"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Categoría</span>
            <select
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value as TaskCategory })
              }
              className={inputClassName}
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Prioridad</span>
            <select
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: e.target.value as TaskPriority })
              }
              className={inputClassName}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Fecha límite</span>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={inputClassName}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-500">Descripción</span>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className={inputClassName}
              rows={2}
            />
          </label>
          <button
            onClick={createTask}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Crear tarea"}
          </button>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="grid gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-500">Título *</span>
            <input
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className={inputClassName}
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Prioridad</span>
            <select
              value={editForm.priority}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  priority: e.target.value as TaskPriority,
                })
              }
              className={inputClassName}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Estado</span>
            <select
              value={editForm.status}
              onChange={(e) =>
                setEditForm({ ...editForm, status: e.target.value as TaskStatus })
              }
              className={inputClassName}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Fecha límite</span>
            <input
              type="date"
              value={editForm.dueDate}
              onChange={(e) =>
                setEditForm({ ...editForm, dueDate: e.target.value })
              }
              className={inputClassName}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-500">Categoría</span>
            <select
              value={editForm.category}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  category: e.target.value as TaskCategory,
                })
              }
              className={inputClassName}
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-500">Descripción</span>
            <textarea
              value={editForm.description}
              onChange={(e) =>
                setEditForm({ ...editForm, description: e.target.value })
              }
              className={inputClassName}
              rows={2}
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Guardar
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
          <p className="mb-3 text-lg">🗂️ Sin tareas todavía</p>
          <p className="mx-auto mb-4 max-w-md">
            Carga la checklist de boda con un clic o añade tu primera tarea para
            empezar a organizarlo todo.
          </p>
          <button
            onClick={seedTasks}
            disabled={seeding}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {seeding ? "Cargando…" : "📋 Cargar checklist de boda"}
          </button>
        </div>
      ) : (
        <>
          {/* Kanban board */}
          {view === "tablero" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {TASK_STATUSES.map((col) => {
                const colTasks = sorted.filter((t) => t.status === col.value);
                return (
                  <div
                    key={col.value}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) void moveStatus(id, col.value);
                    }}
                    className={`rounded-2xl border border-slate-200 p-3 ${col.color.split(" ")[0]}`}
                  >
                    <div className="mb-3 flex items-center justify-between px-1">
                      <span className="text-sm font-semibold text-slate-700">
                        {col.label}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
                        {colTasks.length}
                      </span>
                    </div>
                    <div className="flex min-h-[80px] flex-col gap-2">
                      {colTasks.length === 0 ? (
                        <p className="px-1 text-xs text-slate-400">
                          Suelta aquí una tarea
                        </p>
                      ) : (
                        colTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onDelete={(id) => void deleteTask(id)}
                            onEdit={openEdit}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Calendar (simple grouped-by-date list) */}
          {view === "calendario" && (
            <div className="space-y-4">
              {sorted.map((task) => {
                const prio = priorityMeta(task.priority);
                const cat = categoryMeta(task.category);
                const st = statusMeta(task.status);
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <span className="w-28 shrink-0 text-xs font-medium text-slate-500">
                      {task.dueDate ? formatDate(task.dueDate) : "Sin fecha"}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${prio.color}`}
                    >
                      {prio.label}
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {cat.emoji} {cat.label}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.color}`}>
                      {st.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                      {task.title}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => openEdit(task)}
                        className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => void deleteTask(task.id)}
                        className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Normalise an API task row ({dueDate: ISO|null, dates}) into TaskCardData. */
function toCard(t: Record<string, unknown>): TaskCardData {
  return {
    id: String(t.id),
    title: String(t.title),
    description: (t.description as string | null) ?? null,
    category: (t.category ?? "legal") as TaskCategory,
    priority: (t.priority ?? "medium") as TaskPriority,
    status: (t.status ?? "todo") as TaskStatus,
    dueDate: (t.dueDate as string | null) ?? null,
    assigneeId: (t.assigneeId as string | null) ?? null,
    notes: (t.notes as string | null) ?? null,
    createdAt: String(t.createdAt ?? ""),
  };
}
