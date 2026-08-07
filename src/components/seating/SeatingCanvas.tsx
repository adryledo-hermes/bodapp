"use client";

import { useMemo, useState } from "react";
import {
  capacityStatus,
  parseTableShape,
  seatingConflictsByTable,
  type SeatingGuest,
  type SeatTable,
} from "@/lib/seating";

type Feedback = { kind: "ok" | "err"; text: string } | null;

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

function guestLabel(g: SeatingGuest): string {
  return g.alias || g.fullName;
}

// Spread newly-created tables across the canvas using a simple diagonal rhythm
// so they don't overlap when they all start at (0,0).
function defaultPosition(index: number): { positionX: number; positionY: number } {
  const positions = [
    { positionX: 16, positionY: 20 },
    { positionX: 50, positionY: 16 },
    { positionX: 84, positionY: 20 },
    { positionX: 33, positionY: 55 },
    { positionX: 67, positionY: 55 },
    { positionX: 16, positionY: 88 },
    { positionX: 50, positionY: 88 },
    { positionX: 84, positionY: 88 },
  ];
  return positions[index % positions.length];
}

export default function SeatingCanvas({
  tables: initialTables,
  guests: initialGuests,
}: {
  tables: SeatTable[];
  guests: SeatingGuest[];
}) {
  const [tables, setTables] = useState<SeatTable[]>(initialTables);
  const [unassigned, setUnassigned] = useState<SeatingGuest[]>(initialGuests);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Add-table form
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCapacity, setNewCapacity] = useState(8);
  const [newShape, setNewShape] = useState<"round" | "rectangle">("round");
  const [saving, setSaving] = useState(false);

  const conflictsByTable = useMemo(() => {
    const map = new Map<string, { a: string; b: string }[]>();
    for (const c of seatingConflictsByTable(tables)) {
      map.set(c.tableId, c.conflicts);
    }
    return map;
  }, [tables]);

  const namesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tables) {
      for (const g of t.guests) map.set(g.id, guestLabel(g));
    }
    for (const g of unassigned) map.set(g.id, guestLabel(g));
    return map;
  }, [tables, unassigned]);

  function flash(kind: "ok" | "err", text: string) {
    setFeedback({ kind, text });
  }

  /** Locate a guest anywhere (unassigned or on a table). */
  function locateGuest(guestId: string): {
    guest: SeatingGuest;
    fromTableId: string | null;
  } | null {
    const inUnassigned = unassigned.find((g) => g.id === guestId);
    if (inUnassigned) return { guest: inUnassigned, fromTableId: null };
    for (const t of tables) {
      const g = t.guests.find((x) => x.id === guestId);
      if (g) return { guest: g, fromTableId: t.id };
    }
    return null;
  }

  async function assignToTable(guestId: string, targetTableId: string) {
    const rel = locateGuest(guestId);
    if (!rel) return;
    // Dropping on the guest's own table is a no-op.
    if (rel.fromTableId === targetTableId) return;

    const prevTables = tables;
    const prevUnassigned = unassigned;

    setUnassigned(prev => prev.filter((g) => g.id !== guestId));
    setTables((prev) =>
      prev.map((t) => {
        if (t.id === targetTableId && !t.guests.some((g) => g.id === guestId)) {
          return { ...t, guests: [...t.guests, rel.guest] };
        }
        if (rel.fromTableId && t.id === rel.fromTableId) {
          return { ...t, guests: t.guests.filter((g) => g.id !== guestId) };
        }
        return t;
      })
    );

    let res: Response;
    try {
      res = await send(`/api/tables/${targetTableId}/guests`, "POST", {
        guestId,
      });
    } catch {
      setTables(prevTables);
      setUnassigned(prevUnassigned);
      flash("err", "Error de red: no se pudo guardar");
      return;
    }
    if (!res.ok) {
      setTables(prevTables);
      setUnassigned(prevUnassigned);
      flash("err", "No se pudo asignar el invitado. Reintenta.");
    }
  }

  /** Return a guest to the unassigned pool. */
  async function clearGuest(guestId: string) {
    const rel = locateGuest(guestId);
    if (!rel || !rel.fromTableId) return;

    const prevTables = tables;
    const prevUnassigned = unassigned;

    setTables((prev) =>
      prev.map((t) =>
        t.id === rel.fromTableId
          ? { ...t, guests: t.guests.filter((g) => g.id !== guestId) }
          : t
      )
    );
    setUnassigned((prev) => [...prev, rel.guest]);

    let res: Response;
    try {
      res = await send(`/api/tables/${rel.fromTableId}/guests`, "DELETE", {
        guestId,
      });
    } catch {
      setTables(prevTables);
      setUnassigned(prevUnassigned);
      flash("err", "Error de red: no se pudo guardar");
      return;
    }
    if (!res.ok) {
      setTables(prevTables);
      setUnassigned(prevUnassigned);
      flash("err", "No se pudo liberar al invitado. Reintenta.");
    }
  }

  async function addTable() {
    if (!newName.trim()) {
      flash("err", "Ponle un nombre a la mesa.");
      return;
    }
    setSaving(true);
    const pos = defaultPosition(tables.length);
    let res: Response;
    try {
      res = await send("/api/tables", "POST", {
        name: newName.trim(),
        shape: newShape,
        capacity: newCapacity,
        ...pos,
      });
    } catch {
      setSaving(false);
      flash("err", "Error de red: no se pudo guardar");
      return;
    }
    if (!res.ok) {
      setSaving(false);
      flash("err", "No se pudo crear la mesa.");
      return;
    }
    const { table } = await res.json();
    setTables((prev) => [
      ...prev,
      {
        id: table.id,
        name: table.name,
        shape: table.shape,
        capacity: table.capacity,
        positionX: table.positionX,
        positionY: table.positionY,
        guests: [],
      },
    ]);
    setNewName("");
    setNewCapacity(8);
    setShowForm(false);
    setSaving(false);
    flash("ok", "Mesa creada.");
  }

  async function removeTable(tableId: string) {
    const prevTables = tables;
    const prevUnassigned = unassigned;
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    setTables((prev) => prev.filter((t) => t.id !== tableId));
    setUnassigned((prev) => [...prev, ...table.guests]);

    let res: Response;
    try {
      res = await send(`/api/tables/${tableId}`, "DELETE");
    } catch {
      setTables(prevTables);
      setUnassigned(prevUnassigned);
      flash("err", "Error de red: no se pudo guardar");
      return;
    }
    if (!res.ok) {
      setTables(prevTables);
      setUnassigned(prevUnassigned);
      flash("err", "No se pudo eliminar la mesa.");
    }
  }

  async function patchTable(tableId: string, patch: Record<string, unknown>) {
    const prevTables = tables;
    let res: Response;
    try {
      res = await send(`/api/tables/${tableId}`, "PATCH", patch);
    } catch {
      setTables(prevTables);
      flash("err", "Error de red: no se pudo guardar");
      return;
    }
    if (!res.ok) {
      setTables(prevTables);
      flash("err", "No se pudo guardar el cambio de la mesa.");
      return;
    }
    const { table } = await res.json();
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId
          ? {
              ...t,
              name: table.name,
              shape: table.shape,
              capacity: table.capacity,
              positionX: table.positionX,
              positionY: table.positionY,
            }
          : t
      )
    );
  }

  function toggleShape(tableId: string, current: string | null | undefined) {
    const next = parseTableShape(current) === "round" ? "rectangle" : "round";
    void patchTable(tableId, { shape: next });
  }

  function changeCapacity(tableId: string, delta: number) {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;
    const next = Math.max(1, table.capacity + delta);
    void patchTable(tableId, { capacity: next });
  }

  function onDragStart(e: React.DragEvent, guestId: string) {
    e.dataTransfer.setData("text/plain", guestId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: React.DragEvent, tableId: string) {
    e.preventDefault();
    const guestId = e.dataTransfer.getData("text/plain");
    if (guestId) void assignToTable(guestId, tableId);
  }

  const totalPlanned = tables.reduce((n, t) => n + t.guests.length, 0);

  return (
    <div className="space-y-6">
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

      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {showForm ? "Cancelar" : "+ Añadir mesa"}
        </button>
        <span className="text-sm text-slate-500">
          {tables.length} mesa{tables.length === 1 ? "" : "s"} · {totalPlanned}{" "}
          invitado{totalPlanned === 1 ? "" : "s"} sentado
        </span>
      </div>

      {showForm && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Nombre</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputClassName}
              placeholder="Mesa 1"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Capacidad</span>
            <input
              type="number"
              min={1}
              value={newCapacity}
              onChange={(e) =>
                setNewCapacity(Math.max(1, Number(e.target.value) || 1))
              }
              className={`${inputClassName} w-24`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Forma</span>
            <select
              value={newShape}
              onChange={(e) =>
                setNewShape(e.target.value as "round" | "rectangle")
              }
              className={inputClassName}
            >
              <option value="round">Redonda</option>
              <option value="rectangle">Rectangular</option>
            </select>
          </label>
          <button
            onClick={addTable}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Crear mesa"}
          </button>
        </div>
      )}

      {tables.length === 0 && unassigned.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          Aún no hay mesas ni invitados. Crea una mesa para empezar a organizar
          el comedor.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          {/* ---- Canvas ---- */}
          <div className="relative min-h-[560px] rounded-2xl border border-slate-200 bg-slate-50 p-6">
            {tables.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                Sin mesas todavía. Crea la primera mesa con el botón superior.
              </div>
            ) : (
              tables.map((table) => {
                const cap = capacityStatus(table, table.guests.length);
                const conflicts = conflictsByTable.get(table.id) ?? [];
                const shape = parseTableShape(table.shape);
                return (
                  <div
                    key={table.id}
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, table.id)}
                    className={`absolute flex flex-col items-center justify-between gap-2 p-3 shadow-lg transition-colors ${
                      shape === "round"
                        ? "h-44 w-44 rounded-full"
                        : "h-36 w-52 rounded-xl"
                    } ${
                      cap.ok
                        ? "border-2 border-slate-300 bg-white"
                        : "border-2 border-red-400 bg-red-50 ring-2 ring-red-200"
                    }`}
                    style={{
                      left: `${table.positionX}%`,
                      top: `${table.positionY}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div className="flex w-full flex-col items-center">
                      <div className="flex w-full items-center justify-center gap-1">
                        <input
                          defaultValue={table.name}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== table.name) {
                              void patchTable(table.id, { name: v });
                            }
                          }}
                          className="w-24 truncate rounded bg-transparent text-center text-sm font-semibold text-slate-800 focus:bg-white"
                          aria-label="Nombre de la mesa"
                        />
                        <button
                          onClick={() => toggleShape(table.id, table.shape)}
                          title="Cambiar forma"
                          className="rounded border border-slate-200 px-1.5 text-xs text-slate-500 hover:bg-slate-100"
                        >
                          {shape === "round" ? "●" : "▭"}
                        </button>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <button
                          onClick={() => changeCapacity(table.id, -1)}
                          className="h-5 w-5 rounded border border-slate-200 hover:bg-slate-100"
                          aria-label="Reducir capacidad"
                        >
                          −
                        </button>
                        <span className={cap.ok ? "" : "font-semibold text-red-600"}>
                          {table.guests.length}/{table.capacity}
                        </span>
                        <button
                          onClick={() => changeCapacity(table.id, 1)}
                          className="h-5 w-5 rounded border border-slate-200 hover:bg-slate-100"
                          aria-label="Aumentar capacidad"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {!cap.ok && (
                      <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                        +{cap.over}
                      </span>
                    )}

                    {conflicts.length > 0 && (
                      <div className="w-full rounded-md bg-amber-100 px-2 py-1 text-center text-[11px] font-medium text-amber-800">
                        ⚠ No se llevan bien:{" "}
                        {conflicts
                          .map(
                            (c) =>
                              `${namesById.get(c.a) ?? c.a} y ${
                                namesById.get(c.b) ?? c.b
                              }`
                          )
                          .join(" · ")}
                      </div>
                    )}

                    {table.guests.length === 0 ? (
                      <span className="text-center text-[11px] text-slate-400">
                        Suelta aquí un invitado
                      </span>
                    ) : (
                      <div className="flex max-h-24 w-full flex-wrap content-start justify-center gap-1 overflow-y-auto">
                        {table.guests.map((g) => (
                          <span
                            key={g.id}
                            draggable
                            onDragStart={(e) => onDragStart(e, g.id)}
                            className="group inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800"
                            title={g.fullName}
                          >
                            {guestLabel(g)}
                            <button
                              onClick={() => void clearGuest(g.id)}
                              aria-label={`Quitar a ${guestLabel(g)} de la mesa`}
                              className="text-indigo-400 hover:text-red-600"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => void removeTable(table.id)}
                      className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-slate-200 text-xs text-slate-500 hover:bg-red-500 hover:text-white"
                      aria-label="Eliminar mesa"
                      title="Eliminar mesa"
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* ---- Unassigned pool ---- */}
          <aside className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              Invitados sin asignar ({unassigned.length})
            </h2>
            {unassigned.length === 0 ? (
              <p className="text-xs text-slate-400">
                Todos los invitados tienen mesa.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {unassigned.map((g) => (
                  <div
                    key={g.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, g.id)}
                    className="cursor-grab rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 active:cursor-grabbing"
                  >
                    {guestLabel(g)}
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}