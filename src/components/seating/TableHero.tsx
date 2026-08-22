"use client";

import type { SeatTable } from "@/lib/seating";
import { translate, type Locale } from "@/lib/i18n";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";

interface TableHeroProps {
  table: SeatTable;
  locale: Locale;
  onClose: () => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  onReleaseGuest: (guestId: string) => void;
}

export default function TableHero({
  table,
  locale,
  onClose,
  onUpdate,
  onRemove,
  onReleaseGuest,
}: TableHeroProps) {
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-12 sm:pt-20">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{table.name}</h2>
          <button onClick={onClose} className="tap-min rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <label className="block text-sm font-medium text-slate-700">
            {t("seating.nameLabel")}
            <input
              defaultValue={table.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== table.name) onUpdate({ name: v }); }}
              className={`mt-1 ${inputCls}`}
            />
          </label>

          {/* Capacity */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">{t("seating.capacityLabel")}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => onUpdate({ capacity: Math.max(1, table.capacity - 1) })}
                className="h-7 w-7 rounded border border-slate-300 text-sm hover:bg-slate-50">−</button>
              <span className="min-w-[3ch] text-center text-sm font-semibold">
                {table.guests.length}/{table.capacity}
              </span>
              <button onClick={() => onUpdate({ capacity: table.capacity + 1 })}
                className="h-7 w-7 rounded border border-slate-300 text-sm hover:bg-slate-50">+</button>
            </div>
          </div>

          {/* Shape */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">{t("seating.shapeLabel")}</span>
            <button onClick={() => onUpdate({ shape: table.shape === "round" ? "rectangle" : "round" })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              {table.shape === "round" ? "● " + t("seating.shapeRound") : "▭ " + t("seating.shapeRectangle")}
            </button>
          </div>

          {/* Guests */}
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">{t("seating.guestsTitle")}</p>
            {table.guests.length === 0 ? (
              <p className="text-xs text-slate-400">{t("seating.dropGuest")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {table.guests.map((g) => (
                  <div key={g.id} className="flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-800">
                    <span className="font-semibold">{g.seatNumber ?? "–"}</span>
                    <span>{g.alias || g.fullName}</span>
                    <button onClick={() => onReleaseGuest(g.id)}
                      className="ml-1 text-indigo-400 hover:text-red-600">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attached decorations */}
          {table.decorations && table.decorations.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">{t("seating.decorationTitle")}</p>
              <div className="flex flex-wrap gap-2">
                {table.decorations.map((d) => (
                  <span key={d.id} className="rounded-full bg-fuchsia-50 px-3 py-1 text-xs text-fuchsia-700">
                    {d.kind === "centerpiece" ? "🕯️" : d.kind === "giftTable" ? "🎁" : d.kind === "photoWall" ? "📸" : "✨"} {d.label ?? d.kind}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Delete */}
          <button onClick={onRemove}
            className="tap-min rounded-lg bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-100">
            {t("seating.deleteTable")}
          </button>
        </div>
      </div>
    </div>
  );
}