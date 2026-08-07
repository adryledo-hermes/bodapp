"use client";

import { useState } from "react";
import type { GuestCardData } from "@/lib/guest-view";

const rsvpStyles: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-slate-200 text-slate-700" },
  confirmed: { label: "Confirmado", className: "bg-green-100 text-green-800" },
  declined: { label: "Declinó", className: "bg-red-100 text-red-800" },
  maybe: { label: "Quizás", className: "bg-amber-100 text-amber-800" },
};

function rsvpChip(status: string) {
  const cfg = rsvpStyles[status] ?? rsvpStyles.pending;
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

export default function GuestCard({ guest }: { guest: GuestCardData }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-label={`${guest.fullName}${flipped ? " — volver" : " — ver más"}`}
      className="group block w-full text-left [perspective:1200px] focus:outline-none"
    >
      <div
        className={`relative aspect-[3/4] w-full transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        {/* FRONT */}
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm [backface-visibility:hidden]">
          <p className="mb-2 text-3xl">🎴</p>
          <h3 className="text-center text-lg font-bold text-slate-900">
            {guest.fullName}
          </h3>
          {guest.alias && (
            <p className="mt-0.5 text-sm text-slate-500">
              <span className="text-slate-400">&ldquo;</span>
              {guest.alias}
              <span className="text-slate-400">&rdquo;</span>
            </p>
          )}

          <div className="mt-3">{rsvpChip(guest.rsvpStatus)}</div>

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
            tap para ver más ↗
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
                ➕ Acompañante: {guest.plusOneName || "sí"}
              </p>
            ) : (
              <p className="text-slate-500">Sin acompañante</p>
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
            volver ↺
          </p>
        </div>
      </div>
    </button>
  );
}