"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GUEST_CONTEXTS,
  ALLERGY_OPTIONS,
  MUSIC_GENRES,
  isValidPhotoUrl,
  mergeCustomTags,
  type GuestInput,
} from "@/lib/guests";
import type { GuestCardData } from "@/lib/guest-view";
import { translate, type Locale } from "@/lib/i18n";

type GuestEditFormProps = {
  guest: GuestCardData;
  locale: Locale;
  onClose: () => void;
};

export default function GuestEditForm({ guest, locale, onClose }: GuestEditFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(guest.fullName);
  const [alias, setAlias] = useState(guest.alias ?? "");
  const initialContext = guest.relationshipContext ?? "";
  const [contextSelect, setContextSelect] = useState(
    GUEST_CONTEXTS.includes(initialContext as (typeof GUEST_CONTEXTS)[number])
      ? initialContext
      : initialContext
        ? "Otro"
        : ""
  );
  const [contextOther, setContextOther] = useState(
    GUEST_CONTEXTS.includes(initialContext as (typeof GUEST_CONTEXTS)[number])
      ? ""
      : initialContext
  );
  const [phone, setPhone] = useState(guest.phone);
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>(
    guest.allergies.filter((a) =>
      (ALLERGY_OPTIONS as readonly string[]).includes(a)
    )
  );
  const [allergyOther, setAllergyOther] = useState(
    guest.allergies.find(
      (a) => !(ALLERGY_OPTIONS as readonly string[]).includes(a)
    ) ?? ""
  );
  const [selectedGenres, setSelectedGenres] = useState<string[]>(
    guest.musicPrefs.filter((g) => (MUSIC_GENRES as readonly string[]).includes(g))
  );
  const [genreOther, setGenreOther] = useState(
    guest.musicPrefs.find((g) => !(MUSIC_GENRES as readonly string[]).includes(g)) ??
      ""
  );
  const [favoriteSong, setFavoriteSong] = useState(guest.favoriteSong ?? "");
  const [paperInvitation, setPaperInvitation] = useState(guest.paperInvitation);
  const [plusOneAllowed, setPlusOneAllowed] = useState(guest.plusOneAllowed);
  const [plusOneName, setPlusOneName] = useState(guest.plusOneName ?? "");
  const [isChild, setIsChild] = useState(guest.isChild ?? false);
  const [notes, setNotes] = useState(guest.notes ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(guest.photoUrl);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const t = (key: string) => translate(locale, key);
  const inputClassName =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";

  async function uploadPhoto(file: File) {
    const form = new FormData();
    form.append("photo", file);
    const res = await fetch("/api/photos", { method: "POST", body: form });
    if (!res.ok) throw new Error("upload failed");
    const data = await res.json();
    const id = data.photo?.id;
    if (!id) throw new Error("no photo id");
    return `/api/photos/${id}/file`;
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadPhoto(file);
      setPhotoUrl(url);
    } catch {
      setError(t("guest.errSave"));
    } finally {
      setUploading(false);
    }
  }

  function removePhoto() {
    setPhotoUrl(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setSuccess("");
    setLoading(true);

    const payload: GuestInput = {
      fullName: fullName.trim(),
      alias: alias.trim() || null,
      relationshipContext:
        contextSelect === "Otro"
          ? contextOther.trim() || null
          : contextSelect || null,
      phone: phone.trim(),
      allergies: mergeCustomTags(selectedAllergies, allergyOther),
      musicPrefs: mergeCustomTags(selectedGenres, genreOther),
      favoriteSong: favoriteSong.trim() || null,
      paperInvitation,
      plusOneAllowed,
      plusOneName: plusOneAllowed && plusOneName.trim() ? plusOneName.trim() : null,
      isChild,
      notes: notes.trim() || null,
      photoUrl: photoUrl,
    };

    try {
      const res = await fetch(`/api/guests/${guest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "invalid input" ? t("guest.errSave") : t("guest.errSave"));
        return;
      }
      setSuccess(t("guest.saved"));
      router.refresh();
      setTimeout(onClose, 600);
    } catch {
      setError(t("guest.errNetwork"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t("guest.editTitle")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="tap-min rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            aria-label={t("guest.cancel")}
          >
            ✕
          </button>
        </div>

        {/* Profile photo — separate from the wedding gallery (Fotos panel) */}
        <div className="mb-4">
          <p className="mb-1 text-sm font-semibold text-slate-700">
            {t("guest.photoProfile")}
          </p>
          <div className="flex items-center gap-4">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={t("guest.photoProfile")}
                className="h-20 w-20 rounded-full object-cover ring-2 ring-indigo-100"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-2xl">
                🎴
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="tap-min inline-block cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                {uploading ? t("guest.uploading") : t("guest.uploadPhoto")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </label>
              {photoUrl && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="tap-min rounded-lg px-3 py-1 text-left text-sm text-rose-600 hover:bg-rose-50"
                >
                  ✕ {t("guest.removePhoto")}
                </button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">{t("guest.photoProfileHint")}</p>
        </div>

        {/* Fields */}
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="ef-name">
          {t("guest.fullName")} *
        </label>
        <input
          id="ef-name"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={`mb-4 ${inputClassName}`}
          required
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="ef-alias">
          {t("guest.alias")}
        </label>
        <input
          id="ef-alias"
          type="text"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          className={`mb-4 ${inputClassName}`}
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="ef-rel">
          {t("guest.relationshipContext")}
        </label>
        <select
          id="ef-rel"
          value={contextSelect}
          onChange={(e) => setContextSelect(e.target.value)}
          className={`mb-2 ${inputClassName}`}
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
            className={`mb-4 ${inputClassName}`}
          />
        )}
        {contextSelect !== "Otro" && <div className="mb-4" />}

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="ef-phone">
          {t("guest.phone")} *
        </label>
        <input
          id="ef-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={`mb-1 ${inputClassName}`}
          required
        />
        <p className="mb-4 text-xs text-slate-400">{t("guest.phoneHint")}</p>

        <span className="mb-1 block text-sm font-medium text-slate-700">
          {t("guest.allergies")}
        </span>
        <div className="mb-2 grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 p-2 sm:grid-cols-3">
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
          className={`mb-4 ${inputClassName}`}
        />

        <span className="mb-1 block text-sm font-medium text-slate-700">
          {t("guest.genres")}
        </span>
        <div className="mb-2 grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 p-2 sm:grid-cols-3">
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
          className={`mb-4 ${inputClassName}`}
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="ef-song">
          {t("guest.favoriteSong")}
        </label>
        <input
          id="ef-song"
          type="text"
          value={favoriteSong}
          onChange={(e) => setFavoriteSong(e.target.value)}
          placeholder={t("guest.favoriteSongHint")}
          className={`mb-4 ${inputClassName}`}
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="ef-notes">
          {t("guest.notes")}
        </label>
        <textarea
          id="ef-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`mb-4 ${inputClassName}`}
          rows={2}
        />

        <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={paperInvitation}
            onChange={(e) => setPaperInvitation(e.target.checked)}
            className="h-4 w-4"
          />
          {t("guest.paperInvitation")}
        </label>

        <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={plusOneAllowed}
            onChange={(e) => setPlusOneAllowed(e.target.checked)}
            className="h-4 w-4"
          />
          {t("guest.plusOneAllowed")}
        </label>

        {plusOneAllowed && (
          <label className="mb-4 block text-sm font-medium text-slate-700" htmlFor="ef-plus">
            {t("guest.plusOneName")}
          </label>
        )}
        {plusOneAllowed && (
          <input
            id="ef-plus"
            type="text"
            value={plusOneName}
            onChange={(e) => setPlusOneName(e.target.value)}
            className={`mb-4 ${inputClassName}`}
          />
        )}

        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isChild}
            onChange={(e) => setIsChild(e.target.checked)}
            className="h-4 w-4"
          />
          {t("guest.isChild")}
        </label>

        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {error}
          </p>
        )}
        {success && <p className="mb-3 text-sm text-green-600">{success}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="tap-min rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            {t("guest.cancel")}
          </button>
          <button
            type="submit"
            disabled={loading || uploading}
            className="tap-min rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? t("guest.saving") : t("guest.save")}
          </button>
        </div>
      </form>
    </div>
  );
}