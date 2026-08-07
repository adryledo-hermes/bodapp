"use client";

import { useState } from "react";
import type { GuestCardData } from "@/lib/guest-view";
import { translate, type Locale } from "@/lib/i18n";

const rsvpStyles: Record<string, { key: string; className: string }> = {
  pending: { key: "guest.status.pending", className: "bg-slate-200 text-slate-700" },
  confirmed: { key: "guest.status.confirmed", className: "bg-green-100 text-green-800" },
  declined: { key: "guest.status.declined", className: "bg-red-100 text-red-800" },
  maybe: { key: "guest.status.maybe", className: "bg-amber-100 text-amber-800" },
};

function rsvpChip(status: string, locale: Locale) {
  const cfg = rsvpStyles[status] ?? rsvpStyles.pending;
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.className}`}
    >
      {translate(locale, cfg.key)}
    </span>
  );
}

export default function GuestCard({
  guest,
  locale,
}: {
  guest: GuestCardData;
  locale: Locale;
}) {
  const [flipped, setFlipped] = useState(false);

  const t = (key: string) => translate(locale, key);

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-label={`${guest.fullName}${flipped ? t("guest.tapBack") : t("guest.tapMore")}`}
      className="group block w-full text-left [perspective:1200px] focus:outline-none"
    >
      <div
        className={`relative aspect-[3/4] w-full transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        {/* FRONT */}
        <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm [backface-visibility:hidden]">
          <p className="mb-2 text-3xl">🎴</p>
          <h3 className="max-w-full text-center text-base font-bold break-words text-slate-900 sm:text-lg">
            {guest.fullName}
          </h3>
          {guest.alias && (
            <p className="mt-0.5 text-sm text-slate-500">
              <span className="text-slate-400">&ldquo;</span>
              {guest.alias}
              <span className="text-slate-400">&rdquo;</span>
            </p>
          )}

          <div className="mt-3">{rsvpChip(guest.rsvpStatus, locale)}</div>

          {guest.allergies.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              {guest.allergies.map((a, i) => (
                <span
                  key={i}
                  title={a}
                  className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700"
                >
                  🚫 {a}
                </span>
              ))}
            </div>
          )}

          {guest.musicPrefs.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              {guest.musicPrefs.map((m, i) => (
                <span key={i} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs">
                  🎵 {m}
                </span>
              ))}
            </div>
          )}

          <p className="absolute bottom-3 text-[11px] text-slate-400">
            {t("guest.flipHint")}
          </p>
        </div>

        {/* BACK */}
        <div className="absolute inset-0 flex flex-col rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <h3 className="text-center text-sm font-semibold text-slate-900">
            {guest.fullName}
          </h3>

          <div className="mt-3 space-y-1.5 text-xs text-slate-700">
            {guest.relationshipContext && (
              <p>🗣 {guest.relationshipContext}</p>
            )}
            <p>📞 {guest.phone}</p>
            {guest.plusOneAllowed ? (
              <p className="text-green-700">
                ➕ {t("guest.plusOne")} {guest.plusOneName || t("guest.plusOneYes")}
              </p>
            ) : (
              <p className="text-slate-500">{t("guest.noPlusOne")}</p>
            )}
            {guest.notes && (
              <p className="line-clamp-3 italic text-slate-500">
                <span className="text-slate-400">&ldquo;</span>
                {guest.notes}
                <span className="text-slate-400">&rdquo;</span>
              </p>
            )}
          </div>

          <p className="mt-auto text-center text-[11px] text-indigo-400">
            {t("guest.back")}
          </p>
        </div>
      </div>
    </button>
  );
}
