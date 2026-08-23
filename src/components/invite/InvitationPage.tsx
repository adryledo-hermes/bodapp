"use client";

import { useEffect, useState, useCallback } from "react";
import { isValidHexColor } from "@/lib/invitation";
import { type RsvpStatus } from "@/lib/rsvp";
import type { InvitationView } from "@/lib/invitation-public";
import { ALLERGY_OPTIONS, MUSIC_GENRES, mergeCustomTags } from "@/lib/guests";
import { translate, type Locale } from "@/lib/i18n";
import LocaleSwitcher from "@/components/LocaleSwitcher";

interface InvitationPageProps {
  view: InvitationView;
  locale: Locale;
}

const FALLBACK_PRIMARY = "#B76E79";
const FALLBACK_ACCENT = "#F7E7CE";

const STATUS_KEY: Record<string, string> = {
  confirmed: "guest.status.confirmed",
  declined: "guest.status.declined",
  pending: "guest.status.pending",
};

/** Per-guest RSVP draft state for the form. */
interface GuestDraft {
  rsvpStatus: RsvpStatus;
  selectedAllergies: string[];
  allergyOther: string;
  selectedGenres: string[];
  genreOther: string;
}

function initDraft(g: InvitationView["invitees"][number]): GuestDraft {
  return {
    rsvpStatus: g.rsvpStatus !== "pending" ? g.rsvpStatus : "pending",
    selectedAllergies: (ALLERGY_OPTIONS as readonly string[]).filter((a) =>
      g.allergies.includes(a)
    ),
    allergyOther:
      g.allergies.find((a) => !(ALLERGY_OPTIONS as readonly string[]).includes(a)) ?? "",
    selectedGenres: (MUSIC_GENRES as readonly string[]).filter((m) =>
      g.musicPrefs.includes(m)
    ),
    genreOther:
      g.musicPrefs.find((m) => !(MUSIC_GENRES as readonly string[]).includes(m)) ?? "",
  };
}

export default function InvitationPage({ view, locale }: InvitationPageProps) {
  const [currentView, setCurrentView] = useState<InvitationView>(view);
  const { content, wedding, invitees, greeting, bankAccount } = currentView;

  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  const primary = isValidHexColor(content.colors.primary)
    ? content.colors.primary
    : FALLBACK_PRIMARY;
  const accent = isValidHexColor(content.colors.accent)
    ? content.colors.accent
    : FALLBACK_ACCENT;

  // Per-guest draft state
  const [drafts, setDrafts] = useState<Record<string, GuestDraft>>(() => {
    const map: Record<string, GuestDraft> = {};
    for (const g of invitees) {
      map[g.id] = initDraft(g);
    }
    return map;
  });

  // Accordion: which guest cards have their details panel expanded
  const [expandedGuests, setExpandedGuests] = useState<Set<string>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Update the countdown every 30 seconds.
  useEffect(() => {
    if (!content.date) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [content.date]);

  const countdown = (() => {
    if (!content.date) return null;
    const target = new Date(`${content.date}T${content.time || "00:00"}`).getTime();
    const diff = target - now;
    if (!Number.isFinite(target) || diff <= 0) return null;
    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff % 86_400_000) / 3_600_000);
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    return { days, hours, minutes };
  })();

  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const coupleTitle =
    [content.titleA, content.titleB].filter(Boolean).join(" & ") ||
    [wedding.coupleNameA, wedding.coupleNameB].filter(Boolean).join(" & ") ||
    t("inv.ours");

  // Split invitees into adults and children
  const adults = invitees.filter((g) => !g.isChild);
  const children = invitees.filter((g) => g.isChild);

  const toggleExpand = useCallback((id: string) => {
    setExpandedGuests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const updateGuest = useCallback(
    (id: string, patch: Partial<GuestDraft>) => {
      setDrafts((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...patch },
      }));
    },
    []
  );

  const setStatusAndExpand = useCallback(
    (id: string, status: RsvpStatus) => {
      updateGuest(id, { rsvpStatus: status });
      setExpandedGuests((prev) => {
        if (prev.has(id)) return prev;
        return new Set(prev).add(id);
      });
    },
    [updateGuest]
  );

  const hasPending = Object.values(drafts).some((d) => d.rsvpStatus === "pending");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasPending) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const gs = Object.entries(drafts).map(([id, d]) => ({
        id,
        rsvpStatus: d.rsvpStatus,
        allergies: mergeCustomTags(d.selectedAllergies, d.allergyOther),
        musicPrefs: mergeCustomTags(d.selectedGenres, d.genreOther),
      }));
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guests: gs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: "error", text: data.error || t("inv.errSave") });
        return;
      }
      if (data.view) setCurrentView(data.view);
      setMessage({ kind: "success", text: t("inv.okSaved") });
    } catch {
      setMessage({ kind: "error", text: t("inv.errNetwork") });
    } finally {
      setSubmitting(false);
    }
  }

  const detail = (label: string, value: string) =>
    value ? (
      <p className="text-sm">
        <span className="font-semibold text-slate-500">{label}: </span>
        {value}
      </p>
    ) : null;

  /** Render one guest's accordion-style RSVP card. */
  function GuestCard({
    g,
    draft,
  }: {
    g: InvitationView["invitees"][number];
    draft: GuestDraft;
  }) {
    const isChild = !!(g as unknown as { isChild?: boolean }).isChild;
    const declined = draft.rsvpStatus === "declined";
    const isExpanded = expandedGuests.has(g.id);
    const showDetails = isExpanded && !declined;

    return (
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        {/* Clickable header — toggles accordion */}
        <button
          type="button"
          onClick={() => toggleExpand(g.id)}
          className="w-full px-4 py-3 text-left transition hover:bg-slate-50 active:bg-slate-100"
        >
          <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap sm:gap-3">
            {/* Name — full width on mobile so it doesn't compress */}
            <div className="w-full min-w-0 sm:w-auto sm:flex-1">
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
                  <span className="font-medium">{t(STATUS_KEY[draft.rsvpStatus])}</span>
                </p>
              )}
            </div>

            {/* Status buttons — below name on mobile, beside on sm+ */}
            <div className="flex shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setStatusAndExpand(g.id, "confirmed")}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition whitespace-nowrap ${
                  draft.rsvpStatus === "confirmed"
                    ? "border-transparent text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
                style={
                  draft.rsvpStatus === "confirmed"
                    ? { backgroundColor: primary }
                    : undefined
                }
              >
                {t("inv.optConfirmed")}
              </button>
              <button
                type="button"
                onClick={() => setStatusAndExpand(g.id, "declined")}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition whitespace-nowrap ${
                  draft.rsvpStatus === "declined"
                    ? "border-transparent bg-red-500 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t("inv.optDeclined")}
              </button>
            </div>

            {/* Chevron */}
            <svg
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                isExpanded ? "rotate-180" : ""
              }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </button>

        {/* Collapsible detail panel */}
        <div
          className={`overflow-hidden transition-all duration-200 ${
            isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          {showDetails && (
            <div className="border-t border-slate-100 px-4 py-3 space-y-3">
              {/* Allergies — same for adults and children */}
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
                          updateGuest(g.id, {
                            selectedAllergies: active
                              ? draft.selectedAllergies.filter((a) => a !== opt)
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
                  onChange={(e) => updateGuest(g.id, { allergyOther: e.target.value })}
                  placeholder={t("inv.allergiesPlaceholder")}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
                />
              </fieldset>

              {/* Music — only for adults, omitted for children */}
              {!isChild && (
                <fieldset>
                  <legend className="mb-1.5 text-[11px] font-medium text-slate-600">
                    {t("inv.musicLabel")}
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {(MUSIC_GENRES as readonly string[]).map((opt) => {
                      const active = draft.selectedGenres.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            updateGuest(g.id, {
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
                    onChange={(e) => updateGuest(g.id, { genreOther: e.target.value })}
                    placeholder={t("inv.musicPlaceholder")}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
                  />
                </fieldset>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <main
      className="min-h-screen bg-[#F3EFE8] px-4 py-10 text-[#403B36] sm:px-6"
      style={{
        background: `linear-gradient(180deg, ${accent} 0%, #F3EFE8 55%, #FCFAF6 100%)`,
      }}
    >
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4 flex justify-end">
          <LocaleSwitcher locale={locale} />
        </div>
        <div
          className="overflow-hidden rounded-[2rem] border border-[#D8D1C7] bg-[#FCFAF6] shadow-[0_18px_60px_rgba(93,79,63,0.12)]"
          style={{ borderColor: `${primary}55` }}
        >
          {currentView.inline.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentView.inline.imageUrl}
              alt={t("inv.invitation")}
              className="max-h-72 w-full object-cover"
            />
          )}
          <div
            className="relative px-6 py-12 text-center sm:px-10"
            style={{ backgroundColor: `${accent}66` }}
          >
            <p className="text-[10px] uppercase tracking-[0.36em] text-[#7A6A5A]">
              {t("inv.invitation")}
            </p>
            <div className="mx-auto mt-5 h-px w-14" style={{ backgroundColor: primary }} />
            <h1 className="inv-serif mt-5 text-4xl font-normal italic tracking-wide text-[#403B36] sm:text-5xl">
              {coupleTitle}
            </h1>
            <p className="mt-5 text-base text-[#7A6A5A]">
              {greeting}
            </p>
            {invitees.length > 0 && (
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#8B8176]">
                {t("inv.forLabel")} {invitees.map((g) => g.fullName).join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-8 px-6 py-9 sm:px-10">
            {content.message ? (
              <p className="inv-serif mx-auto max-w-xl text-center text-xl italic leading-relaxed text-[#5D554D]">
                {content.message}
              </p>
            ) : null}

            {countdown && (
              <section className="border-y border-[#D8D1C7] py-5 text-center" aria-label={t("inv.countdown")}>
                <p className="text-[10px] uppercase tracking-[0.28em] text-[#8B8176]">{t("inv.countdown")}</p>
                <div className="mt-3 flex justify-center gap-6 text-[#7A6A5A]">
                  <div><strong className="inv-serif block text-3xl font-normal">{countdown.days}</strong><span className="text-[10px] uppercase tracking-wider">{t("inv.days")}</span></div>
                  <div><strong className="inv-serif block text-3xl font-normal">{countdown.hours}</strong><span className="text-[10px] uppercase tracking-wider">{t("inv.hours")}</span></div>
                  <div><strong className="inv-serif block text-3xl font-normal">{countdown.minutes}</strong><span className="text-[10px] uppercase tracking-wider">{t("inv.minutes")}</span></div>
                </div>
              </section>
            )}

            <div className="grid gap-3 rounded-2xl bg-[#F3EFE8] p-5 text-center sm:grid-cols-2"> 
              {detail(t("inv.dateLabel"), content.date)}
              {detail(t("inv.timeLabel"), content.time)}
              {detail(t("inv.venueLabel"), content.venue)}
              {detail(t("inv.dressCodeLabel"), content.dressCode)}
            </div>

            {content.schedule ? (
              <section className="border-t border-[#D8D1C7] pt-6">
                <h2 className="inv-serif text-center text-2xl italic font-normal text-[#403B36]">{t("inv.scheduleTitle")}</h2>
                <p className="mt-3 whitespace-pre-line text-center text-sm leading-7 text-[#5D554D]">{content.schedule}</p>
              </section>
            ) : null}

            {(content.directions || content.accommodation) ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {content.directions ? <section className="rounded-2xl bg-[#F3EFE8] p-5 text-center"><h2 className="inv-serif text-xl italic font-normal">{t("inv.directionsTitle")}</h2><p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5D554D]">{content.directions}</p></section> : null}
                {content.accommodation ? <section className="rounded-2xl bg-[#F3EFE8] p-5 text-center"><h2 className="inv-serif text-xl italic font-normal">{t("inv.accommodationTitle")}</h2><p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5D554D]">{content.accommodation}</p></section> : null}
              </div>
            ) : null}

            {bankAccount ? (
              <div className="rounded-2xl border border-slate-200 p-5">
                <p className="text-sm font-semibold text-slate-900">{t("inv.bankTransfer")}</p>
                <p className="mt-2 font-mono text-sm tracking-wide text-slate-700">{bankAccount}</p>
                <p className="mt-2 text-xs text-slate-500">{t("inv.bankHelp")}</p>
              </div>
            ) : null}

            {/* RSVP Form — accordion cards */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-900">
                {t("inv.confirmTitle")}
              </h2>

              {adults.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {t("inv.adultsSection")}
                  </p>
                  <div className="space-y-2">
                    {adults.map((g) => (
                      <GuestCard key={g.id} g={g} draft={drafts[g.id] ?? initDraft(g)} />
                    ))}
                  </div>
                </div>
              )}

              {children.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {t("inv.childrenSection")}
                  </p>
                  <div className="space-y-2">
                    {children.map((g) => (
                      <GuestCard key={g.id} g={g} draft={drafts[g.id] ?? initDraft(g)} />
                    ))}
                  </div>
                </div>
              )}

              {message && (
                <p className={`text-sm ${message.kind === "success" ? "text-green-700" : "text-red-600"}`}>
                  {message.text}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || hasPending}
                className="tap-min w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: primary }}
              >
                {submitting ? t("inv.saving") : t("inv.saveResponse")}
              </button>
              {hasPending && (
                <p className="text-center text-xs text-slate-500">
                  {t("inv.pendingHint")}
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}