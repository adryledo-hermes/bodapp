"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { translate, type Locale } from "@/lib/i18n";
import InvitationDetail from "./InvitationDetail";

/** A guest selectable for grouping into an invitation. */
export interface InviteeOption {
  id: string;
  fullName: string;
  alias: string | null;
  phone: string;
  invitationId: string | null; // set → already invited → disabled
}

/** An invitation as rendered by the manager. */
export interface ManagerInvitation {
  id: string;
  title: string;
  content?: unknown; // per-invitation personalization (frame/image/text)
  guests: Array<{ id: string; fullName: string; phone: string }>;
}

/**
 * The couple's invitation manager: lists every personalised invitation and lets
 * them create a new one by hand-picking a guest / couple / group of guests.
 * Creating one links the chosen guests to it; their phones become the
 * invitation's acceptedPhones, and the QR page lists it immediately.
 */
export default function InvitationsManager({
  invitations: initial,
  guests,
  locale,
}: {
  invitations: ManagerInvitation[];
  guests: InviteeOption[];
  locale: Locale;
}) {
  const router = useRouter();
  const [invitations, setInvitations] = useState(initial);
  const [detail, setDetail] = useState<ManagerInvitation | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const inputClassName =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";

  function toggleGuest(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (!title.trim()) {
      setError(t("invman.errTitle"));
      return;
    }
    if (selected.size === 0) {
      setError(t("invman.errNoGuests"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          guestIds: [...selected],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "guest not found" ? t("invman.errGuest") : t("invman.errSave"));
        return;
      }
      setTitle("");
      setSelected(new Set());
      setShowForm(false);
      setInvitations((prev) => [
        { id: data.invitation.id, title: data.invitation.title, guests: data.invitation.guests },
        ...prev,
      ]);
      router.refresh();
    } catch {
      setError(t("invman.errNetwork"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("invman.confirmDelete"))) return;
    try {
      const res = await fetch(`/api/invitations/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setInvitations((prev) => prev.filter((i) => i.id !== id));
      router.refresh();
    } catch {
      // silent — list refresh on next interaction covers it
    }
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => setShowForm((v) => !v)}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        {showForm ? t("common.cancel") : t("invman.create")}
      </button>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
        >
          <label className="block text-sm font-medium text-slate-700" htmlFor="inv-title">
            {t("invman.titleLabel")} *
          </label>
          <input
            id="inv-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClassName}
            placeholder={t("invman.titlePlaceholder")}
            autoFocus
          />

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              {t("invman.guestsLabel")} ({selected.size})
            </p>
            {guests.length === 0 ? (
              <p className="text-sm text-slate-400">{t("invman.noGuests")}</p>
            ) : (
              <div className="grid max-h-64 gap-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">
                {guests.map((g) => {
                  const checked = selected.has(g.id);
                  const alreadyInvited = g.invitationId !== null;
                  return (
                    <label
                      key={g.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                        alreadyInvited
                          ? "cursor-not-allowed opacity-50"
                          : checked
                            ? "bg-indigo-50 text-indigo-900"
                            : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked || alreadyInvited}
                        disabled={alreadyInvited}
                        onChange={() => toggleGuest(g.id)}
                        className="h-4 w-4"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {g.fullName}
                        {g.alias ? ` (${g.alias})` : ""}
                      </span>
                      {alreadyInvited ? (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                          {t("invman.alreadyInvited")}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">{g.phone}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? t("common.saving") : t("invman.save")}
          </button>
        </form>
      )}

      {invitations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          {t("invman.empty")}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">{inv.title}</h3>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setDetail(inv)}
                    className="tap-min rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                    title={t("invman.personalize")}
                  >
                    🎨 {t("invman.personalize")}
                  </button>
                  <button
                    onClick={() => handleDelete(inv.id)}
                    className="tap-min rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={t("invman.delete")}
                    title={t("invman.delete")}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {inv.guests.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">{t("invman.noGuests")}</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {inv.guests.map((g) => (
                    <li key={g.id} className="text-sm text-slate-600">
                      {g.fullName} <span className="text-xs text-slate-400">{g.phone}</span>
                    </li>
                  ))}
                </ul>
              )}
              <a
                href={`/api/invitation/${inv.id}/qr`}
                download={`qr-${inv.id}.png`}
                className="mt-4 inline-flex justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
              >
                {t("invman.qrDownload")}
              </a>
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <InvitationDetail
          invitation={detail}
          locale={locale}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}