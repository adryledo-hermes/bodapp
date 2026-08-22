"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { translate, type Locale } from "@/lib/i18n";
import {
  GUEST_CONTEXTS,
  ALLERGY_OPTIONS,
  MUSIC_GENRES,
  mergeCustomTags,
} from "@/lib/guests";

const inputClassName =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";

export default function GuestForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [fullName, setFullName] = useState("");
  const [alias, setAlias] = useState("");
  const [contextSelect, setContextSelect] = useState("");
  const [contextOther, setContextOther] = useState("");
  const [phone, setPhone] = useState("");
  const [plusOneAllowed, setPlusOneAllowed] = useState(false);
  const [plusOneName, setPlusOneName] = useState("");
  const [isChild, setIsChild] = useState(false);
  const [paperInvitation, setPaperInvitation] = useState(false);
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [allergyOther, setAllergyOther] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [genreOther, setGenreOther] = useState("");
  const [favoriteSong, setFavoriteSong] = useState("");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [loading, setLoading] = useState(false);

  const t = (key: string) => translate(locale, key);

  function resetForm() {
    setFullName("");
    setAlias("");
    setContextSelect("");
    setContextOther("");
    setPhone("");
    setPlusOneAllowed(false);
    setPlusOneName("");
    setPaperInvitation(false);
    setSelectedAllergies([]);
    setAllergyOther("");
    setSelectedGenres([]);
    setGenreOther("");
    setFavoriteSong("");
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
          relationshipContext:
            contextSelect === "Otro"
              ? contextOther.trim() || null
              : contextSelect || null,
          phone: phone.trim(),
          plusOneAllowed,
          plusOneName:
            plusOneAllowed && plusOneName.trim() ? plusOneName.trim() : null,
          isChild,
          paperInvitation,
          allergies: mergeCustomTags(selectedAllergies, allergyOther),
          musicPrefs: mergeCustomTags(selectedGenres, genreOther),
          favoriteSong: favoriteSong.trim() || null,
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
          <select
            id="guestRelationship"
            value={contextSelect}
            onChange={(e) => setContextSelect(e.target.value)}
            className={inputClassName}
          >
            <option value="">{t("guest.relationshipSelect")}</option>
            {GUEST_CONTEXTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {contextSelect === "Otro" && (
            <input
              type="text"
              value={contextOther}
              onChange={(e) => setContextOther(e.target.value)}
              placeholder={t("guest.relationshipOther")}
              className={`mt-1 ${inputClassName}`}
              autoComplete="off"
            />
          )}
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
            id="guestIsChild"
            type="checkbox"
            checked={isChild}
            onChange={(e) => setIsChild(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <label htmlFor="guestIsChild" className="text-sm font-medium text-slate-700">
            {t("guest.isChild")}
          </label>
        </div>

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
          <span className="mb-1 block text-sm font-medium text-slate-700">
            {t("guest.allergies")}
          </span>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 p-2 sm:grid-cols-3">
            {ALLERGY_OPTIONS.map((a) => {
              const checked = selectedAllergies.includes(a);
              return (
                <label
                  key={a}
                  className={`flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs ${
                    checked ? "bg-rose-50 text-rose-800" : "hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedAllergies((prev) =>
                        checked ? prev.filter((x) => x !== a) : [...prev, a]
                      )
                    }
                    className="h-3.5 w-3.5"
                  />
                  {a}
                </label>
              );
            })}
          </div>
          <input
            type="text"
            value={allergyOther}
            onChange={(e) => setAllergyOther(e.target.value)}
            placeholder={t("guest.allergiesOther")}
            className={`mt-1 ${inputClassName}`}
            autoComplete="off"
          />
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            {t("guest.genres")}
          </span>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 p-2 sm:grid-cols-3">
            {MUSIC_GENRES.map((g) => {
              const checked = selectedGenres.includes(g);
              return (
                <label
                  key={g}
                  className={`flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs ${
                    checked ? "bg-indigo-50 text-indigo-800" : "hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedGenres((prev) =>
                        checked ? prev.filter((x) => x !== g) : [...prev, g]
                      )
                    }
                    className="h-3.5 w-3.5"
                  />
                  {g}
                </label>
              );
            })}
          </div>
          <input
            type="text"
            value={genreOther}
            onChange={(e) => setGenreOther(e.target.value)}
            placeholder={t("guest.genreOther")}
            className={`mt-1 ${inputClassName}`}
            autoComplete="off"
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium text-slate-700"
            htmlFor="guestFavoriteSong"
          >
            {t("guest.favoriteSong")}
          </label>
          <input
            id="guestFavoriteSong"
            type="text"
            value={favoriteSong}
            onChange={(e) => setFavoriteSong(e.target.value)}
            placeholder={t("guest.favoriteSongHint")}
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