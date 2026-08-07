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
import { translate, type Locale } from "@/lib/i18n";

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

const STATUS_KEY: Record<TaskStatus, string> = {
  todo: "task.status.todo",
  in_progress: "task.status.in_progress",
  done: "task.status.done",
  blocked: "task.status.blocked",
};

const PRIORITY_KEY: Record<TaskPriority, string> = {
  low: "task.priority.low",
  medium: "task.priority.medium",
  high: "task.priority.high",
};

const CATEGORY_KEY: Record<TaskCategory, string> = {
  legal: "task.category.legal",
  vendors: "task.category.vendors",
  timing: "task.category.timing",
  gifts: "task.category.gifts",
};

/** Localised short date (e.g. "12 mar 2026") or "—". */
function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "en" ? "en-US" : "es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function TaskCard({
  task,
  onDelete,
  onEdit,
  locale,
}: {
  task: TaskCardData;
  onDelete: (id: string) => void;
  onEdit: (task: TaskCardData) => void;
  locale: Locale;
}) {
  const t = (key: string) => translate(locale, key);
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
          {t(PRIORITY_KEY[task.priority])}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          {cat.emoji} {t(CATEGORY_KEY[task.category])}
        </span>
        <span className="ml-auto text-[11px] text-slate-400">
          📅 {formatDate(task.dueDate, locale)}
        </span>
      </div>
      <p className="text-sm font-medium text-slate-800">{task.title}</p>
      {task.description ? (
        <p className="mt-1 text-xs text-slate-500">{task.description}</p>
      ) : null}
      <div className="mt-2 flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <button
          onClick={() => onEdit(task)}
          className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          {t("task.editBtn")}
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
        >
          {t("task.deleteBtn")}
        </button>
      </div>
    </div>
  );
}

export default function TaskBoard({
  initialTasks,
  locale,
}: {
  initialTasks: TaskCardData[];
  locale: Locale;
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

  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

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
      flash("err", t("common.networkError"));
      return;
    }
    if (!res.ok) {
      setTasks(prev);
      flash("err", t("task.errMove"));
    }
  }

  /** Create a task and append it server-confirmed. */
  async function createTask() {
    if (!form.title.trim()) {
      flash("err", t("task.errTitle"));
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
      flash("err", t("common.networkError"));
      return;
    }
    if (!res.ok) {
      setSaving(false);
      flash("err", t("task.errCreate"));
      return;
    }
    const { task } = await res.json();
    setTasks((prev) => [toCard(task), ...prev]);
    setForm(emptyForm);
    setShowForm(false);
    setSaving(false);
    flash("ok", t("task.okCreated"));
  }

  /** Save inline edits via PATCH with rollback. */
  async function saveEdit() {
    if (!editing) return;
    if (!editForm.title.trim()) {
      flash("err", t("task.errEmptyTitle"));
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
      flash("err", t("common.networkError"));
      setEditing(null);
      return;
    }
    if (!res.ok) {
      setTasks(prev);
      flash("err", t("task.errSave"));
      setEditing(null);
      return;
    }
    setEditing(null);
    flash("ok", t("task.okUpdated"));
  }

  /** Delete a task (optimistic) with rollback on failure. */
  async function deleteTask(id: string) {
    if (!window.confirm(t("task.confirmDelete"))) return;
    const prev = tasks;
    setTasks((prevList) => prevList.filter((t) => t.id !== id));
    let res: Response;
    try {
      res = await send(`/api/tasks/${id}`, "DELETE");
    } catch {
      setTasks(prev);
      flash("err", t("common.networkError"));
      return;
    }
    if (!res.ok) {
      setTasks(prev);
      flash("err", t("task.errDelete"));
    }
  }

  /** Seed the canonical checklist (idempotent server-side). */
  async function seedTasks() {
    if (tasks.length > 0) {
      if (!window.confirm(t("task.confirmSeed"))) {
        return;
      }
    }
    setSeeding(true);
    let res: Response;
    try {
      res = await send("/api/wedding/seed-tasks", "POST");
    } catch {
      setSeeding(false);
      flash("err", t("common.networkError"));
      return;
    }
    if (!res.ok) {
      setSeeding(false);
      flash("err", t("task.errSeed"));
      return;
    }
    const { inserted } = await res.json();
    if (inserted === 0) {
      flash("ok", t("task.okSeedEmpty"));
    } else {
      flash("ok", t("task.okSeedLoaded", { count: inserted }));
    }
    setSeeding(false);
    // Refresh from the server so the board reflects the newly seeded rows.
    try {
      const list = await fetch("/api/tasks");
      if (list.ok) {
        const { tasks: fresh } = await list.json();
        setTasks(fresh.map(toCard));
      }
    } catch {
      flash("ok", t("task.okSeedRefresh"));
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
          {tab("tablero", t("task.viewBoard"))}
          {tab("calendario", t("task.viewCalendar"))}
        </div>
        <div className="flex items-center gap-2">
          {tasks.length === 0 && (
            <button
              onClick={seedTasks}
              disabled={seeding}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {seeding ? t("task.loadingChecklist") : t("task.addChecklist")}
            </button>
          )}
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            {showForm ? t("common.cancel") : t("task.addTask")}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-500">{t("task.titleLabel")}</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputClassName}
              placeholder={t("task.titlePlaceholder")}
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">{t("task.categoryLabel")}</span>
            <select
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value as TaskCategory })
              }
              className={inputClassName}
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.emoji} {t(CATEGORY_KEY[c.value])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">{t("task.priorityLabel")}</span>
            <select
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: e.target.value as TaskPriority })
              }
              className={inputClassName}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {t(PRIORITY_KEY[p.value])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">{t("task.dueDateLabel")}</span>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={inputClassName}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-500">{t("task.descriptionLabel")}</span>
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
            {saving ? t("common.saving") : t("task.createTask")}
          </button>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="grid gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-500">{t("task.titleLabel")}</span>
            <input
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className={inputClassName}
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">{t("task.priorityLabel")}</span>
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
                  {t(PRIORITY_KEY[p.value])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">{t("task.statusLabel")}</span>
            <select
              value={editForm.status}
              onChange={(e) =>
                setEditForm({ ...editForm, status: e.target.value as TaskStatus })
              }
              className={inputClassName}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(STATUS_KEY[s.value])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">{t("task.dueDateLabel")}</span>
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
            <span className="text-slate-500">{t("task.categoryLabel")}</span>
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
                  {c.emoji} {t(CATEGORY_KEY[c.value])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-500">{t("task.descriptionLabel")}</span>
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
              {t("common.save")}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
          <p className="mb-3 text-lg">{t("task.emptyTitle")}</p>
          <p className="mx-auto mb-4 max-w-md">{t("task.emptyBody")}</p>
          <button
            onClick={seedTasks}
            disabled={seeding}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {seeding ? t("task.loadingChecklist") : t("task.loadChecklist")}
          </button>
        </div>
      ) : (
        <>
          {/* Kanban board */}
          {view === "tablero" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {TASK_STATUSES.map((col) => {
                const colTasks = sorted.filter((task) => task.status === col.value);
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
                        {t(STATUS_KEY[col.value])}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
                        {colTasks.length}
                      </span>
                    </div>
                    <div className="flex min-h-[80px] flex-col gap-2">
                      {colTasks.length === 0 ? (
                        <p className="px-1 text-xs text-slate-400">
                          {t("task.dropHere")}
                        </p>
                      ) : (
                        colTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onDelete={(id) => void deleteTask(id)}
                            onEdit={openEdit}
                            locale={locale}
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
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <span className="w-full shrink-0 text-xs font-medium text-slate-500 sm:w-28">
                      {task.dueDate ? formatDate(task.dueDate, locale) : t("task.noDate")}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${prio.color}`}
                    >
                      {t(PRIORITY_KEY[task.priority])}
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {cat.emoji} {t(CATEGORY_KEY[task.category])}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.color}`}>
                      {t(STATUS_KEY[task.status])}
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
