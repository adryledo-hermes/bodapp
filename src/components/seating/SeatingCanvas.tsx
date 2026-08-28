"use client";

import { useMemo, useRef, useState } from "react";
import {
  capacityStatus,
  chairPositions,
  duplicateSeats,
  parseTableShape,
  seatingConflictsByTable,
  tableNodeSize,
  type SeatingGuest,
  type SeatTable,
} from "@/lib/seating";
import { plural, translate, type Locale } from "@/lib/i18n";
import TableHero from "./TableHero";

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
  locale,
}: {
  tables: SeatTable[];
  guests: SeatingGuest[];
  locale: Locale;
}) {
  const [tables, setTables] = useState<SeatTable[]>(initialTables);
  const [unassigned, setUnassigned] = useState<SeatingGuest[]>(initialGuests);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selectedTable, setSelectedTable] = useState<SeatTable | null>(null);

  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const pl = (key: string, n: number) => plural(locale, key, n);

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

  // Seat numbers used by more than one guest at the same table (per table).
  const duplicatesByTable = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const d of duplicateSeats(tables)) {
      map.set(d.tableId, new Set(d.seats));
    }
    return map;
  }, [tables]);

  // Size each table node from its shape + capacity (bigger tables look bigger).
  const sizesById = useMemo(() => {
    const map = new Map<string, { width: number; height: number }>();
    for (const t of tables) map.set(t.id, tableNodeSize(t));
    return map;
  }, [tables]);

  // ---- Table repositioning (drag) ----
  // INTERACTION CHOICE: tables are moved with POINTER events while guests are
  // moved with HTML5 drag-and-drop. The two never conflict: the pointer
  // handlers power table repositioning, and the existing dataTransfer
  // drag/drop handlers keep powering guest assignment. A pointer-down that
  // lands on an interactive element (button/input/select/draggable chip)
  // never starts a table move.
  const [drag, setDrag] = useState<null | {
    tableId: string;
    startX: number;
    startY: number;
    originPctX: number;
    originPctY: number;
    originTables: SeatTable[];
  }>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  function onTablePointerDown(e: React.PointerEvent, table: SeatTable) {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, [draggable='true']")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDrag({
      tableId: table.id,
      startX: e.clientX,
      startY: e.clientY,
      originPctX: table.positionX,
      originPctY: table.positionY,
      // Snapshot for rollback if the PATCH fails.
      originTables: tables,
    });
    // Capture the pointer so dragging continues smoothly even when the cursor
    // leaves the canvas bounds — otherwise pointermove/pointerup stop firing
    // and the table gets stuck mid-drag (the "flaky" table dragging symptom).
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Very old engines / touch edge cases: drag still works without capture.
    }
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clampPct = (v: number) => Math.min(100, Math.max(0, v));
    const positionX = clampPct(
      drag.originPctX + ((e.clientX - drag.startX) / rect.width) * 100
    );
    const positionY = clampPct(
      drag.originPctY + ((e.clientY - drag.startY) / rect.height) * 100
    );
    setTables((prev) =>
      prev.map((t) =>
        t.id === drag.tableId ? { ...t, positionX, positionY } : t
      )
    );
  }

  function onCanvasPointerUp() {
    if (!drag) return;
    const { tableId, originTables } = drag;
    setDrag(null);
    const table = tables.find((t) => t.id === tableId);
    const orig = originTables.find((t) => t.id === tableId);
    if (!table || !orig) return;
    // No actual movement → nothing to persist.
    if (
      table.positionX === orig.positionX &&
      table.positionY === orig.positionY
    ) {
      return;
    }
    // Optimistic position is already in state; persist + rollback on failure.
    void (async () => {
      let res: Response;
      try {
        res = await send(`/api/tables/${tableId}`, "PATCH", {
          positionX: table.positionX,
          positionY: table.positionY,
        });
      } catch {
        setTables(originTables);
        flash("err", t("common.networkError"));
        return;
      }
      if (!res.ok) {
        setTables(originTables);
        flash("err", t("seating.errPatch"));
        return;
      }
      const { table: saved } = await res.json();
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? { ...t, positionX: saved.positionX, positionY: saved.positionY }
            : t
        )
      );
    })();
  }

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

  async function assignToTable(
    guestId: string,
    targetTableId: string,
    seatNumber?: number | null
  ) {
    const rel = locateGuest(guestId);
    if (!rel) return;

    // A generic drop on the table body (no specific chair) should assign the
    // guest the FIRST available free seat (1..capacity), not leave them unseated.
    let effectiveSeat = seatNumber ?? null;
    if (effectiveSeat === null) {
      const target = tables.find((t) => t.id === targetTableId);
      if (target) {
        const taken = new Set(
          target.guests
            .map((g) => g.seatNumber)
            .filter((n): n is number => typeof n === "number" && n >= 1)
        );
        for (let i = 1; i <= target.capacity; i++) {
          if (!taken.has(i)) {
            effectiveSeat = i;
            break;
          }
        }
      }
    }

    // Dropping on a chair of the guest's OWN table = re-seat within the same
    // table: keep the table, just change the seat number (one PATCH).
    if (rel.fromTableId === targetTableId) {
      if (seatNumber === undefined || seatNumber === rel.guest.seatNumber) {
        return; // same seat / generic table drop → no-op
      }
      const prevTables = tables;
      setTables((prev) =>
        prev.map((t) =>
          t.id === targetTableId
            ? {
                ...t,
                guests: t.guests.map((g) =>
                  g.id === guestId ? { ...g, seatNumber } : g
                ),
              }
            : t
        )
      );
      let res: Response;
      try {
        res = await send(`/api/guests/${guestId}`, "PATCH", { seatNumber });
      } catch {
        setTables(prevTables);
        flash("err", t("common.networkError"));
        return;
      }
      if (!res.ok) {
        setTables(prevTables);
        flash("err", t("seating.errSeat"));
      }
      return;
    }

    const prevTables = tables;
    const prevUnassigned = unassigned;

    setUnassigned(prev => prev.filter((g) => g.id !== guestId));
    setTables((prev) =>
      prev.map((t) => {
        if (t.id === targetTableId && !t.guests.some((g) => g.id === guestId)) {
          return {
            ...t,
            guests: [
              ...t.guests,
              { ...rel.guest, seatNumber: effectiveSeat ?? rel.guest.seatNumber },
            ],
          };
        }
        if (rel.fromTableId && t.id === rel.fromTableId) {
          return { ...t, guests: t.guests.filter((g) => g.id !== guestId) };
        }
        return t;
      })
    );
    // Sync hero panel
    setSelectedTable((prev) => {
      if (!prev) return prev;
      if (prev.id === targetTableId) {
        return { ...prev, guests: [...prev.guests, { ...rel.guest, seatNumber: effectiveSeat ?? rel.guest.seatNumber }] };
      }
      if (rel.fromTableId && prev.id === rel.fromTableId) {
        return { ...prev, guests: prev.guests.filter((g) => g.id !== guestId) };
      }
      return prev;
    });

    let res: Response;
    try {
      res = await send(`/api/tables/${targetTableId}/guests`, "POST", {
        guestId,
        // Send the seat number regardless (effectiveSeat is computed for generic
        // drops); the server assigns the seat explicitly when provided.
        seatNumber: effectiveSeat ?? undefined,
      });
    } catch {
      setTables(prevTables);
      setUnassigned(prevUnassigned);
      flash("err", t("common.networkError"));
      return;
    }
    if (!res.ok) {
      setTables(prevTables);
      setUnassigned(prevUnassigned);
      flash("err", t("seating.errAssign"));
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
    // Sync the hero panel if the removed guest was in the selected table
    setSelectedTable((prev) =>
      prev && prev.id === rel.fromTableId
        ? { ...prev, guests: prev.guests.filter((g) => g.id !== guestId) }
        : prev
    );

    let res: Response;
    try {
      res = await send(`/api/tables/${rel.fromTableId}/guests`, "DELETE", {
        guestId,
      });
    } catch {
      setTables(prevTables);
      setUnassigned(prevUnassigned);
      flash("err", t("common.networkError"));
      return;
    }
    if (!res.ok) {
      setTables(prevTables);
      setUnassigned(prevUnassigned);
      flash("err", t("seating.errRelease"));
    }
  }

  async function addTable() {
    if (!newName.trim()) {
      flash("err", t("seating.errName"));
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
      flash("err", t("common.networkError"));
      return;
    }
    if (!res.ok) {
      setSaving(false);
      flash("err", t("seating.errCreate"));
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
    flash("ok", t("seating.okCreated"));
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
      flash("err", t("common.networkError"));
      return;
    }
    if (!res.ok) {
      setTables(prevTables);
      setUnassigned(prevUnassigned);
      flash("err", t("seating.errDelete"));
    }
  }

  async function patchTable(tableId: string, patch: Record<string, unknown>) {
    const prevTables = tables;
    let res: Response;
    try {
      res = await send(`/api/tables/${tableId}`, "PATCH", patch);
    } catch {
      setTables(prevTables);
      flash("err", t("common.networkError"));
      return;
    }
    if (!res.ok) {
      setTables(prevTables);
      flash("err", t("seating.errPatch"));
      return;
    }
    const { table } = await res.json();
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId
          ? {
              ...t,
              // ONLY apply the fields this PATCH actually touched — never
              // clobber position/capacity/shape with values the server may
              // echo back from defaults (the reset-on-change bug).
              name: patch.name !== undefined ? table.name : t.name,
              shape: patch.shape !== undefined ? table.shape : t.shape,
              capacity:
                patch.capacity !== undefined ? table.capacity : t.capacity,
              positionX:
                patch.positionX !== undefined ? table.positionX : t.positionX,
              positionY:
                patch.positionY !== undefined ? table.positionY : t.positionY,
            }
          : t
      )
    );
    // Sync the hero panel so its controls (shape/capacity/name) reflect the
    // live table state instead of the snapshot taken when it was opened.
    setSelectedTable((prev) => {
      if (!prev || prev.id !== tableId) return prev;
      return {
        ...prev,
        name: patch.name !== undefined ? table.name : prev.name,
        shape: patch.shape !== undefined ? table.shape : prev.shape,
        capacity: patch.capacity !== undefined ? table.capacity : prev.capacity,
        positionX: patch.positionX !== undefined ? table.positionX : prev.positionX,
        positionY: patch.positionY !== undefined ? table.positionY : prev.positionY,
      };
    });
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
          {showForm ? t("common.cancel") : t("seating.addTable")}
        </button>
        <span className="text-sm text-slate-500">
          {tables.length} {pl("seating.table", tables.length)} · {totalPlanned}{" "}
          {pl("seating.seated", totalPlanned)}
        </span>
      </div>

      {showForm && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">{t("seating.nameLabel")}</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputClassName}
              placeholder="Mesa 1"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">{t("seating.capacityLabel")}</span>
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
            <span className="text-slate-500">{t("seating.shapeLabel")}</span>
            <select
              value={newShape}
              onChange={(e) =>
                setNewShape(e.target.value as "round" | "rectangle")
              }
              className={inputClassName}
            >
              <option value="round">{t("seating.shapeRound")}</option>
              <option value="rectangle">{t("seating.shapeRectangle")}</option>
            </select>
          </label>
          <button
            onClick={addTable}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("seating.createTable")}
          </button>
        </div>
      )}

      {tables.length === 0 && unassigned.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          {t("seating.emptyAll")}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          {/* ---- Canvas ---- */}
          <div
            ref={canvasRef}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            className="relative min-h-[560px] touch-none select-none rounded-2xl border border-slate-200 bg-slate-50 p-6"
          >
            {tables.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                {t("seating.emptyCanvas")}
              </div>
            ) : (
              tables.map((table) => {
                const cap = capacityStatus(table, table.guests.length);
                const conflicts = conflictsByTable.get(table.id) ?? [];
                const shape = parseTableShape(table.shape);
                const nodeSize = sizesById.get(table.id) ?? { width: 52, height: 52 };
                return (
                  <div
                    key={table.id}
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, table.id)}
                    onPointerDown={(e) => onTablePointerDown(e, table)}
                    onClick={() => setSelectedTable(table)}
                    title={t("seating.moveHint")}
                    className={`absolute flex touch-none cursor-grab flex-col items-center justify-between gap-2 p-3 shadow-lg transition-colors active:cursor-grabbing ${
                      drag && drag.tableId === table.id
                        ? "z-10 ring-2 ring-indigo-400"
                        : ""
                    } ${
                      shape === "round" ? "rounded-full" : "rounded-xl"
                    } ${
                      cap.ok
                        ? "border-2 border-slate-300 bg-white"
                        : "border-2 border-red-400 bg-red-50 ring-2 ring-red-200"
                    }`}
                    style={{
                      left: `${table.positionX}%`,
                      top: `${table.positionY}%`,
                      width: nodeSize.width,
                      height: nodeSize.height,
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
                          aria-label={t("seating.tableNameAria")}
                        />
                        <button
                          onClick={() => toggleShape(table.id, table.shape)}
                          title={t("seating.toggleShapeTitle")}
                          className="rounded border border-slate-200 px-1.5 text-xs text-slate-500 hover:bg-slate-100"
                        >
                          {shape === "round" ? "●" : "▭"}
                        </button>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <button
                          onClick={() => changeCapacity(table.id, -1)}
                          className="h-5 w-5 rounded border border-slate-200 hover:bg-slate-100"
                          aria-label={t("seating.decreaseCapacityAria")}
                        >
                          −
                        </button>
                        <span className={cap.ok ? "" : "font-semibold text-red-600"}>
                          {table.guests.length}/{table.capacity}
                        </span>
                        <button
                          onClick={() => changeCapacity(table.id, 1)}
                          className="h-5 w-5 rounded border border-slate-200 hover:bg-slate-100"
                          aria-label={t("seating.increaseCapacityAria")}
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
                        ⚠ {t("seating.conflictLabel")}{" "}
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

                    {/* Decorations attached to this table (e.g. its centerpiece).
                        Rendered on top of the table — they travel with it. */}
                    {table.decorations && table.decorations.length > 0 && (
                      <div className="flex max-w-full flex-wrap items-center justify-center gap-1 overflow-hidden">
                        {table.decorations.map((dec) => (
                          <span
                            key={dec.id}
                            title={dec.label ?? dec.kind}
                            className="rounded-full bg-fuchsia-50 px-1.5 py-0.5 text-xs"
                          >
                            {dec.kind === "centerpiece"
                              ? "🕯️"
                              : dec.kind === "giftTable"
                                ? "🎁"
                                : dec.kind === "photoWall"
                                  ? "📸"
                                  : dec.kind === "danceFloor"
                                    ? "🪩"
                                    : "✨"}{" "}
                            <span className="text-fuchsia-700">{dec.label}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {table.guests.length === 0 ? (
                      <span className="text-center text-[11px] text-slate-400">
                        {t("seating.dropGuest")}
                      </span>
                    ) : (
                      <span className="text-center text-[10px] font-semibold text-slate-500">
                        {table.guests.length}/{table.capacity}
                      </span>
                    )}

                    <button
                      onClick={() => void removeTable(table.id)}
                      className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-slate-200 text-xs text-slate-500 hover:bg-red-500 hover:text-white"
                      aria-label={t("seating.deleteTableAria")}
                      title={t("seating.deleteTableAria")}
                    >
                      ✕
                    </button>

                    {/* Always-visible chairs: dropping a guest on a chair seats
                        them at this table AND fixes their seat number in one
                        action. The table body itself remains a generic drop
                        target (no seat number). */}
                    {chairPositions(table).map((chair) => {
                      const occupant = table.guests.find(
                        (g) => g.seatNumber === chair.seatNumber
                      );
                      const occupiedByOther =
                        occupant && occupant.id !== drag?.tableId;
                      return (
                        <div
                          key={chair.seatNumber}
                          draggable={!!occupant}
                          onDragStart={(e) => {
                            if (occupant) {
                              onDragStart(e, occupant.id);
                            }
                          }}
                          onDragOver={onDragOver}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const guestId = e.dataTransfer.getData("text/plain");
                            if (guestId) {
                              void assignToTable(guestId, table.id, chair.seatNumber);
                            }
                          }}
                          title={occupant ? occupant.fullName : t("seating.chairHint", { seat: chair.seatNumber })}
                          className={`absolute flex items-center justify-center rounded-full border text-[10px] font-semibold transition-colors ${
                            occupiedByOther
                              ? "border-indigo-300 bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300"
                              : occupant
                                ? "border-slate-300 bg-white text-slate-400 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-500 cursor-grab active:cursor-grabbing"
                                : "border-slate-300 bg-white text-slate-400 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-500"
                          }`}
                          style={{
                            width: 26,
                            height: 26,
                            left: `calc(50% + ${chair.offsetX}% - 13px)`,
                            top: `calc(50% + ${chair.offsetY}% - 13px)`,
                          }}
                        >
                          {occupant ? occupant.fullName.charAt(0) : chair.seatNumber}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {/* ---- Unassigned pool ---- */}
          <aside className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              {t("seating.unassigned", { count: unassigned.length })}
            </h2>
            {unassigned.length === 0 ? (
              <p className="text-xs text-slate-400">
                {t("seating.allAssigned")}
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
    {selectedTable && (
        <TableHero
          table={selectedTable}
          locale={locale}
          onClose={() => setSelectedTable(null)}
          onUpdate={(patch) => void patchTable(selectedTable.id, patch)}
          onRemove={() => { setSelectedTable(null); void removeTable(selectedTable.id); }}
          onReleaseGuest={(guestId) => void clearGuest(guestId)}
        />
      )}
    </div>
  );
}
