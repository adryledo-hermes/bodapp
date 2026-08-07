"use client";

import { useState } from "react";
import {
  DECORATION_KINDS,
  DECORATION_KIND_ORDER,
  defaultKindPosition,
  normalizeDecoration,
  type DecorationKind,
} from "@/lib/decorations";
import { parseTableShape, type SeatTable } from "@/lib/seating";
import { plural, translate, type Locale } from "@/lib/i18n";

/**
 * A decoration row as the client needs it (matches the Prisma scalar output).
 */
export interface DecorationItem {
  id: string;
  kind: string;
  label: string | null;
  positionX: number;
  positionY: number;
}

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

/** Recompute absolute -> percentage position from a drop event on the canvas. */
function positionFromEvent(
  e: React.DragEvent<HTMLDivElement>
): { positionX: number; positionY: number } {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  return {
    positionX: Math.max(0, Math.min(100, Math.round(x * 10) / 10)),
    positionY: Math.max(0, Math.min(100, Math.round(y * 10) / 10)),
  };
}

const KIND_KEY: Record<DecorationKind, string> = {
  centerpiece: "decor.kind.centerpiece",
  giftTable: "decor.kind.giftTable",
  photoWall: "decor.kind.photoWall",
  danceFloor: "decor.kind.danceFloor",
  other: "decor.kind.other",
};

/**
 * The decoration & gift placement layer: shows tables as static background
 * shapes and lets the couple place/move decoration zones on top of them.
 */
export default function DecorationLayer({
  tables,
  decorations: initialDecorations,
  locale,
}: {
  tables: SeatTable[];
  decorations: DecorationItem[];
  locale: Locale;
}) {
  const [decorations, setDecorations] = useState<DecorationItem[]>(
    initialDecorations.map((d) => {
      const n = normalizeDecoration(d);
      return { id: d.id, ...n };
    })
  );
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Add-item form state.
  const [showForm, setShowForm] = useState(false);
  const [newKind, setNewKind] = useState<DecorationKind>("centerpiece");
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const pl = (key: string, n: number) => plural(locale, key, n);

  function flash(kind: "ok" | "err", text: string) {
    setFeedback({ kind, text });
  }

  async function addDecoration() {
    setSaving(true);
    const pos = defaultKindPosition(100, 100, decorations.length);
    let res: Response;
    try {
      res = await send("/api/decorations", "POST", {
        kind: newKind,
        label: newLabel.trim() || null,
        ...pos,
      });
    } catch {
      setSaving(false);
      flash("err", t("common.networkError"));
      return;
    }
    if (!res.ok) {
      setSaving(false);
      flash("err", t("decor.errAdd"));
      return;
    }
    const { decoration } = await res.json();
    const n = normalizeDecoration(decoration);
    setDecorations((prev) => [
      ...prev,
      { id: decoration.id, kind: n.kind, label: n.label, positionX: n.positionX, positionY: n.positionY },
    ]);
    setNewKind("centerpiece");
    setNewLabel("");
    setShowForm(false);
    setSaving(false);
    flash("ok", t("decor.okAdded"));
  }

  async function removeDecoration(id: string) {
    const prev = decorations;
    setDecorations((list) => list.filter((d) => d.id !== id));
    let res: Response;
    try {
      res = await send(`/api/decorations/${id}`, "DELETE");
    } catch {
      setDecorations(prev);
      flash("err", t("common.networkError"));
      return;
    }
    if (!res.ok) {
      setDecorations(prev);
      flash("err", t("decor.errDelete"));
    }
  }

  async function moveDecoration(id: string, positionX: number, positionY: number) {
    const prev = decorations;
    setDecorations((list) =>
      list.map((d) => (d.id === id ? { ...d, positionX, positionY } : d))
    );
    let res: Response;
    try {
      res = await send(`/api/decorations/${id}`, "PATCH", { positionX, positionY });
    } catch {
      setDecorations(prev);
      flash("err", t("common.networkError"));
      return;
    }
    if (!res.ok) {
      setDecorations(prev);
      flash("err", t("decor.errPos"));
    }
  }

  function onDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const pos = positionFromEvent(e);
    void moveDecoration(id, pos.positionX, pos.positionY);
  }

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
          {showForm ? t("common.cancel") : t("decor.addDecoracion")}
        </button>
        <span className="text-sm text-slate-500">
          {decorations.length} {pl("decor.elements", decorations.length)}{" "}
          {t("decor.dragHint")}
        </span>
      </div>

      {showForm && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">{t("decor.typeLabel")}</span>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as DecorationKind)}
              className={inputClassName}
            >
              {DECORATION_KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {DECORATION_KINDS[k].emoji} {t(KIND_KEY[k])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">{t("decor.labelOptional")}</span>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className={`${inputClassName} w-56`}
              placeholder={t("decor.labelPlaceholder")}
            />
          </label>
          <button
            onClick={addDecoration}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("common.add")}
          </button>
        </div>
      )}

      {/* ---- Canvas with static table shapes + draggable decorations ---- */}
      <div
        className="relative min-h-[560px] rounded-2xl border border-slate-200 bg-slate-50 p-6"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Static table shapes (background context only, not interactive). */}
        {tables.map((table) => {
          const shape = parseTableShape(table.shape);
          return (
            <div
              key={table.id}
              aria-hidden
              className={`pointer-events-none absolute flex items-center justify-center border-2 border-slate-300 bg-white/60 text-xs text-slate-400 ${
                shape === "round"
                  ? "h-24 w-24 rounded-full"
                  : "h-20 w-36 rounded-xl"
              }`}
              style={{
                left: `${table.positionX}%`,
                top: `${table.positionY}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {table.name}
            </div>
          );
        })}

        {decorations.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            {t("decor.empty")}
          </div>
        ) : (
          decorations.map((d) => {
            const meta = DECORATION_KINDS[d.kind as DecorationKind] ?? DECORATION_KINDS.other;
            return (
              <div
                key={d.id}
                draggable
                onDragStart={(e) => onDragStart(e, d.id)}
                className="group absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab flex-col items-center rounded-xl border border-fuchsia-300 bg-white/95 px-3 py-2 shadow-md transition-colors hover:border-fuchsia-400 active:cursor-grabbing"
                style={{ left: `${d.positionX}%`, top: `${d.positionY}%` }}
                title={t("decor.dragTitle")}
              >
                <span className="text-2xl leading-none">{meta.emoji}</span>
                <span className="mt-1 max-w-[140px] truncate text-center text-[11px] font-medium text-slate-700">
                  {d.label}
                </span>
                <button
                  onClick={() => void removeDecoration(d.id)}
                  className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white hover:bg-red-500 group-hover:flex"
                  aria-label={t("decor.deleteAria", { label: d.label ?? "" })}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
