"use client";

import { type RsvpStatus } from "@/lib/rsvp";
import type { InvitationView } from "@/lib/invitation-public";
import { ALLERGY_OPTIONS, MUSIC_GENRES } from "@/lib/guests";
import type { GuestDraft } from "./InvitationPage";

/** Props for the standalone GuestCard component. */
interface GuestCardProps {
  g: InvitationView["invitees"][number];
  draft: GuestDraft;
  primary: string;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onStatusChange: (id: string, status: RsvpStatus) => void;
  onUpdate: (id: string, patch: Partial<GuestDraft>) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export default function GuestCard({
  g,
  draft,
  primary,
  isExpanded,
  onToggle,
  onStatusChange,
  onUpdate,
  t,
}: GuestCardProps) {
  const isChild = !!(g as unknown as { isChild?: boolean }).isChild;
  const hasPlusOne = g.plusOneAllowed && !isChild;
  const declined = draft.rsvpStatus === "declined";
  const showDetails = isExpanded && !declined;

  function setStatus(s: RsvpStatus) { onStatusChange(g.id, s); }

  const btnBase = "rounded-lg border px-2.5 py-1 text-xs font-medium transition";

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <button
        type="button"
        onClick={() => onToggle(g.id)}
        className="w-full px-4 py-3 text-left transition hover:bg-slate-50 active:bg-slate-100"
      >
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
          <div className="min-w-0 sm:flex-1">
            <p className="text-sm font-semibold text-slate-900 break-words">
              {g.fullName}
              {isChild && (
                <span className="ml-1.5 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 leading-tight">
                  {t("inv.child")}
                </span>
              )}
            </p>
            {draft.rsvpStatus !== "pending" && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                {t("inv.currentResponse")}{" "}
                <span className="font-medium">
                  {t(
                    draft.rsvpStatus === "confirmed"
                      ? "guest.status.confirmed"
                      : draft.rsvpStatus === "declined"
                        ? "guest.status.declined"
                        : "guest.status.pending"
                  )}
                </span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setStatus("confirmed")}
              className={`${btnBase} ${
                draft.rsvpStatus === "confirmed"
                  ? "border-transparent text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              style={draft.rsvpStatus === "confirmed" ? { backgroundColor: primary } : undefined}
            >
              {t("inv.optConfirmed")}
            </button>
            <button
              type="button"
              onClick={() => setStatus("declined")}
              className={`${btnBase} ${
                draft.rsvpStatus === "declined"
                  ? "border-transparent bg-red-500 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t("inv.optDeclined")}
            </button>
            <svg
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                isExpanded ? "rotate-180" : ""
              }`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ${
          isExpanded ? "max-h-[999px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {showDetails && (
          <div className="border-t border-slate-100 px-4 py-3 space-y-3">
            {/* Allergies */}
            <fieldset>
              <legend className="mb-1.5 text-[11px] font-medium text-slate-600">
                {t("inv.allergiesLabel")}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {(ALLERGY_OPTIONS as readonly string[]).map((opt) => {
                  const active = draft.selectedAllergies.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        onUpdate(g.id, {
                          selectedAllergies: active
                            ? draft.selectedAllergies.filter((a: string) => a !== opt)
                            : [...draft.selectedAllergies, opt],
                        })
                      }
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                        active
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={draft.allergyOther}
                onChange={(e) => onUpdate(g.id, { allergyOther: e.target.value })}
                placeholder={t("inv.allergiesPlaceholder")}
                className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
              />
            </fieldset>

            {/* Music — only for adults */}
            {!isChild && (
              <fieldset>
                <legend className="mb-1.5 text-[11px] font-medium text-slate-600">
                  {t("inv.musicLabel")}
                </legend>
                <div className="flex flex-wrap gap-1">
                  {(MUSIC_GENRES as readonly string[]).map((opt) => {
                    const active = draft.selectedGenres.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() =>
                          onUpdate(g.id, {
                            selectedGenres: active
                              ? draft.selectedGenres.filter((m) => m !== opt)
                              : [...draft.selectedGenres, opt],
                          })
                        }
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                          active
                            ? "border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm"
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={draft.genreOther}
                  onChange={(e) => onUpdate(g.id, { genreOther: e.target.value })}
                  placeholder={t("inv.musicPlaceholder")}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
                />
              </fieldset>
            )}

            {/* Plus one */}
            {hasPlusOne && (
              <div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdate(g.id, { bringsPlusOne: true })}
                    className={`${btnBase} ${
                      draft.bringsPlusOne
                        ? "border-transparent text-white"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                    style={draft.bringsPlusOne ? { backgroundColor: primary } : undefined}
                  >
                    {t("inv.plusOneBring")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate(g.id, { bringsPlusOne: false, plusOneName: "" })}
                    className={`${btnBase} ${
                      !draft.bringsPlusOne
                        ? "border-transparent bg-red-500 text-white"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    {t("inv.plusOneNoBring")}
                  </button>
                </div>

                {draft.bringsPlusOne && (
                  <div className="mt-2">
                    <label className="mb-1 text-[11px] font-medium text-slate-600 block">
                      {t("inv.yourPlusOne")}
                    </label>
                    <input
                      type="text"
                      value={draft.plusOneName}
                      onChange={(e) => onUpdate(g.id, { plusOneName: e.target.value })}
                      placeholder={t("invman.plusOnePlaceholder")}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}