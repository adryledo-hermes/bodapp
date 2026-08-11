"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  splitList,
  isValidPhotoUrl,
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
  const [relationshipContext, setRelationshipContext] = useState(
    guest.relationshipContext ?? ""
  );
  const [phone, setPhone] = useState(guest.phone);
  const [allergies, setAllergies] = useState(guest.allergies.join(", "));
  const [musicPrefs, setMusicPrefs] = useState(guest.musicPrefs.join(", "));
  const [paperInvitation, setPaperInvitation] = useState(guest.paperInvitation);
  const [plusOneAllowed, setPlusOneAllowed] = useState(guest.plusOneAllowed);
  const [plusOneName, setPlusOneName] = useState(guest.plusOneName ?? "");
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
      relationshipContext: relationshipContext.trim() || null,
      phone: phone.trim(),
      allergies: splitList(allergies),
      musicPrefs: splitList(musicPrefs),
      paperInvitation,
      plusOneAllowed,
      plusOneName: plusOneAllowed && plusOneName.trim() ? plusOneName.trim() : null,
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

        {/* Photo */}
        <div className="mb-4 flex items-center gap-4">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={t("guest.photo")}
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
        <input
          id="ef-rel"
          type="text"
          value={relationshipContext}
          onChange={(e) => setRelationshipContext(e.target.value)}
          className={`mb-4 ${inputClassName}`}
        />

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

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="ef-alg">
          {t("guest.allergies")}
        </label>
        <input
          id="ef-alg"
          type="text"
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
          placeholder={t("guest.allergiesHint")}
          className={`mb-4 ${inputClassName}`}
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="ef-music">
          {t("guest.musicPrefs")}
        </label>
        <input
          id="ef-music"
          type="text"
          value={musicPrefs}
          onChange={(e) => setMusicPrefs(e.target.value)}
          placeholder={t("guest.musicPrefsHint")}
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