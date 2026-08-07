"use client";

import { useState } from "react";
import { isValidHexColor } from "@/lib/invitation";
import { type RsvpStatus } from "@/lib/rsvp";
import type { InvitationView } from "@/lib/invitation-public";
import { translate, type Locale } from "@/lib/i18n";
import LocaleSwitcher from "@/components/LocaleSwitcher";

interface InvitationPageProps {
  view: InvitationView;
  locale: Locale;
}

const FALLBACK_PRIMARY = "#B76E79";
const FALLBACK_ACCENT = "#F7E7CE";

const STATUS_KEY: Record<RsvpStatus, string> = {
  confirmed: "guest.status.confirmed",
  declined: "guest.status.declined",
  maybe: "guest.status.maybe",
  pending: "guest.status.pending",
};

function listToText(values: string[]): string {
  return values.join(", ");
}

function textToList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

/**
 * The personalized public invitation (Task 10). Rendered as a client
 * component so RSVP submission can POST /api/rsvp and reflect the saved state
 * without a full page reload. Colours from the template are only applied when
 * they pass isValidHexColor; otherwise the wedding's fallback palette is used
 * so arbitrary DB content can never inject CSS.
 */
export default function InvitationPage({ view, locale }: InvitationPageProps) {
  // FIX I-2: keep a local copy of the view so the saved status + preferences
  // update immediately after submit using the POST response, without a full
  // reload. Seeded from server props; refreshed from the returned `view`.
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

  const firstInvitee = invitees[0];
  const [status, setStatus] = useState<RsvpStatus>(
    firstInvitee && firstInvitee.rsvpStatus !== "pending"
      ? firstInvitee.rsvpStatus
      : "pending"
  );
  const [allergiesText, setAllergiesText] = useState(
    firstInvitee ? listToText(firstInvitee.allergies) : ""
  );
  const [musicText, setMusicText] = useState(
    firstInvitee ? listToText(firstInvitee.musicPrefs) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const coupleTitle =
    [content.titleA, content.titleB].filter(Boolean).join(" & ") ||
    [wedding.coupleNameA, wedding.coupleNameB].filter(Boolean).join(" & ") ||
    t("inv.ours");

  const hasPlusOne = firstInvitee?.plusOneAllowed;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rsvpStatus: status,
          allergies: textToList(allergiesText),
          musicPrefs: textToList(musicText),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          kind: "error",
          text: data.error || t("inv.errSave"),
        });
        return;
      }
      // FIX I-2: reflect the saved status + preferences immediately using the
      // updated view returned by the API (no full reload / stale props).
      if (data.view) {
        setCurrentView(data.view);
      }
      setMessage({
        kind: "success",
        text: t("inv.okSaved"),
      });
    } catch {
      setMessage({
        kind: "error",
        text: t("inv.errNetwork"),
      });
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

  return (
    <main
      className="min-h-screen px-4 py-10 sm:px-6"
      style={{
        background: `linear-gradient(180deg, ${accent} 0%, #ffffff 40%)`,
      }}
    >
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4 flex justify-end">
          <LocaleSwitcher locale={locale} />
        </div>
        <div
          className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          style={{ borderColor: `${primary}55` }}
        >
          <div
            className="bg-gradient-to-r px-6 py-10 text-center text-white sm:px-10"
            style={{ backgroundColor: primary }}
          >
            <p className="text-xs uppercase tracking-[0.3em] text-white/80">
              {t("inv.invitation")}
            </p>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
              {coupleTitle}
            </h1>
            <p className="mt-4 text-lg font-medium text-white/95">
              {greeting}
            </p>
          </div>

          <div className="space-y-6 px-6 py-8 sm:px-10">
            {content.message ? (
              <p className="whitespace-pre-line text-center text-slate-700">
                {content.message}
              </p>
            ) : null}

            <div className="grid gap-3 rounded-2xl bg-slate-50 p-5 text-center sm:grid-cols-2">
              {detail(t("inv.dateLabel"), content.date)}
              {detail(t("inv.timeLabel"), content.time)}
              {detail(t("inv.venueLabel"), content.venue)}
              {detail(t("inv.dressCodeLabel"), content.dressCode)}
            </div>

            {bankAccount ? (
              <div className="rounded-2xl border border-slate-200 p-5">
                <p className="text-sm font-semibold text-slate-900">
                  {t("inv.bankTransfer")}
                </p>
                <p className="mt-2 font-mono text-sm tracking-wide text-slate-700">
                  {bankAccount}
                </p>
                <p className="mt-2 text-xs text-slate-500">{t("inv.bankHelp")}</p>
              </div>
            ) : null}

            {content.sections.length > 0 ? (
              <div className="space-y-3">
                {content.sections.map((s, i) => (
                  <p
                    key={i}
                    className="whitespace-pre-line text-sm text-slate-600"
                  >
                    {s}
                  </p>
                ))}
              </div>
            ) : null}

            {hasPlusOne && firstInvitee?.plusOneName ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                {t("inv.yourPlusOne")}{" "}
                <span className="font-medium">{firstInvitee.plusOneName}</span>
              </div>
            ) : null}

            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-slate-200 p-5"
            >
              <h2 className="text-lg font-semibold text-slate-900">
                {t("inv.confirmTitle")}
              </h2>
              {firstInvitee && firstInvitee.rsvpStatus !== "pending" && (
                <p className="mt-1 text-sm text-slate-500">
                  {t("inv.currentResponse")}{" "}
                  <span className="font-medium">{t(STATUS_KEY[firstInvitee.rsvpStatus])}</span>
                </p>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {[
                  { value: "confirmed", label: t("inv.optConfirmed") },
                  { value: "declined", label: t("inv.optDeclined") },
                  { value: "maybe", label: t("inv.optMaybe") },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value as RsvpStatus)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      status === opt.value
                        ? "border-transparent text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    style={
                      status === opt.value
                        ? { backgroundColor: primary }
                        : undefined
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  {t("inv.allergiesLabel")}
                  <input
                    type="text"
                    value={allergiesText}
                    onChange={(e) => setAllergiesText(e.target.value)}
                    placeholder={t("inv.allergiesPlaceholder")}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  {t("inv.musicLabel")}
                  <input
                    type="text"
                    value={musicText}
                    onChange={(e) => setMusicText(e.target.value)}
                    placeholder={t("inv.musicPlaceholder")}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>
              </div>

              {message && (
                <p
                  className={`mt-4 text-sm ${
                    message.kind === "success"
                      ? "text-green-700"
                      : "text-red-600"
                  }`}
                >
                  {message.text}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || status === "pending"}
                className="mt-5 w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: primary }}
              >
                {submitting ? t("inv.saving") : t("inv.saveResponse")}
              </button>
              {status === "pending" && (
                <p className="mt-2 text-center text-xs text-slate-500">
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
