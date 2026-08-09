"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { translate, type Locale } from "@/lib/i18n";
import { splitList } from "@/lib/guests";

const inputClassName =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";

export default function GuestForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [fullName, setFullName] = useState("");
  const [alias, setAlias] = useState("");
  const [relationshipContext, setRelationshipContext] = useState("");
  const [phone, setPhone] = useState("");
  const [plusOneAllowed, setPlusOneAllowed] = useState(false);
  const [plusOneName, setPlusOneName] = useState("");
  const [paperInvitation, setPaperInvitation] = useState(false);
  const [allergies, setAllergies] = useState("");
  const [musicPrefs, setMusicPrefs] = useState("");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [loading, setLoading] = useState(false);

  const t = (key: string) => translate(locale, key);

  function resetForm() {
    setFullName("");
    setAlias("");
    setRelationshipContext("");
    setPhone("");
    setPlusOneAllowed(false);
    setPlusOneName("");
    setPaperInvitation(false);
    setAllergies("");
    setMusicPrefs("");
    setNotes("");
    setError("");
  }

  function close() {
    resetForm();
    setFlash("");
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // guard against Enter-key double submit
    setError("");
    setFlash("");
    setLoading(true);
    try {
      const res = await fetch("/api/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          alias: alias.trim() || null,
          relationshipContext: relationshipContext.trim() || null,
          phone: phone.trim(),
          plusOneAllowed,
          plusOneName:
            plusOneAllowed && plusOneName.trim() ? plusOneName.trim() : null,
          paperInvitation,
          allergies: splitList(allergies),
          musicPrefs: splitList(musicPrefs),
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        setError(t("guest.errSave"));
        return;
      }
      resetForm();
      setOpen(false);
      setFlash(t("guest.added"));
      // Re-fetch the server page so the new guest shows up in the board.
      router.refresh();
    } catch {
      setError(t("guest.errNetwork"));
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        {flash && (
          <p role="status" className="text-sm font-medium text-emerald-600">
            {flash}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setFlash("");
            setOpen(true);
          }}
          className="tap-min ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {t("guest.addGuest")}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("guest.addTitle")}
        </h2>
        <button
          type="button"
          onClick={close}
          disabled={loading}
          className="tap-min rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {t("guest.cancel")}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            className="mb-1 block text-sm font-medium text-slate-700"
            htmlFor="guestFullName"
          >
            {t("guest.fullName")} *
          </label>
          <input
            id="guestFullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClassName}
            autoComplete="off"
            required
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium text-slate-700"
            htmlFor="guestAlias"
          >
            {t("guest.alias")}
          </label>
          <input
            id="guestAlias"
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className={inputClassName}
            autoComplete="off"
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium text-slate-700"
            htmlFor="guestRelationship"
          >
            {t("guest.relationshipContext")}
          </label>
          <input
            id="guestRelationship"
            type="text"
            value={relationshipContext}
            onChange={(e) => setRelationshipContext(e.target.value)}
            className={inputClassName}
            autoComplete="off"
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium text-slate-700"
            htmlFor="guestPhone"
          >
            {t("guest.phone")} *
          </label>
          <input
            id="guestPhone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("guest.phoneHint")}
            pattern="\+?[0-9 ]{5,20}"
            minLength={5}
            maxLength={21}
            className={inputClassName}
            autoComplete="tel"
            required
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="guestPlusOneAllowed"
            type="checkbox"
            checked={plusOneAllowed}
            onChange={(e) => setPlusOneAllowed(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <label
            htmlFor="guestPlusOneAllowed"
            className="text-sm font-medium text-slate-700"
          >
            {t("guest.plusOneAllowed")}
          </label>
        </div>

        {plusOneAllowed && (
          <div>
            <label
              className="mb-1 block text-sm font-medium text-slate-700"
              htmlFor="guestPlusOneName"
            >
              {t("guest.plusOneName")}
            </label>
            <input
              id="guestPlusOneName"
              type="text"
              value={plusOneName}
              onChange={(e) => setPlusOneName(e.target.value)}
              className={inputClassName}
              autoComplete="off"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            id="guestPaperInvitation"
            type="checkbox"
            checked={paperInvitation}
            onChange={(e) => setPaperInvitation(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <label
            htmlFor="guestPaperInvitation"
            className="text-sm font-medium text-slate-700"
          >
            {t("guest.paperInvitation")}
          </label>
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium text-slate-700"
            htmlFor="guestAllergies"
          >
            {t("guest.allergies")}
          </label>
          <input
            id="guestAllergies"
            type="text"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            placeholder={t("guest.listHint")}
            className={inputClassName}
            autoComplete="off"
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium text-slate-700"
            htmlFor="guestMusicPrefs"
          >
            {t("guest.musicPrefs")}
          </label>
          <input
            id="guestMusicPrefs"
            type="text"
            value={musicPrefs}
            onChange={(e) => setMusicPrefs(e.target.value)}
            placeholder={t("guest.listHint")}
            className={inputClassName}
            autoComplete="off"
          />
        </div>

        <div className="sm:col-span-2">
          <label
            className="mb-1 block text-sm font-medium text-slate-700"
            htmlFor="guestNotes"
          >
            {t("guest.notes")}
          </label>
          <textarea
            id="guestNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputClassName}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={close}
          disabled={loading}
          className="tap-min rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {t("guest.cancel")}
        </button>
        <button
          type="submit"
          disabled={loading}
          className="tap-min rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? t("guest.saving") : t("guest.save")}
        </button>
      </div>
    </form>
  );
}