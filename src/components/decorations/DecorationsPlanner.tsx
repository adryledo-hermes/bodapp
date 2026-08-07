"use client";

import { useState } from "react";
import SeatingCanvas from "@/components/seating/SeatingCanvas";
import DecorationLayer, {
  type DecorationItem,
} from "@/components/decorations/DecorationLayer";
import type { SeatingGuest, SeatTable } from "@/lib/seating";
import { translate, type Locale } from "@/lib/i18n";

type ViewMode = "mesas" | "decoracion";

/**
 * Planner page: a toggle that lets the couple switch between the seating view
 * (full SeatingCanvas) and the decoration view (DecorativeLayer over static
 * table shapes) on the same canvas area.
 */
export default function DecorationsPlanner({
  tables,
  guests,
  decorations,
  locale,
}: {
  tables: SeatTable[];
  guests: SeatingGuest[];
  decorations: DecorationItem[];
  locale: Locale;
}) {
  const [mode, setMode] = useState<ViewMode>("mesas");

  const t = (key: string) => translate(locale, key);

  const tab = (value: ViewMode, label: string) => (
    <button
      onClick={() => setMode(value)}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        mode === value
          ? "bg-indigo-600 text-white"
          : "bg-white text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="inline-flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
        {tab("mesas", t("decor.tabMesas"))}
        {tab("decoracion", t("decor.tabDecoracion"))}
      </div>

      {mode === "mesas" ? (
        <SeatingCanvas tables={tables} guests={guests} locale={locale} />
      ) : (
        <DecorationLayer tables={tables} decorations={decorations} locale={locale} />
      )}
    </div>
  );
}
