"use client";

import { useRef, useState } from "react";
import { translate, type Locale } from "@/lib/i18n";

/** A photo surfaced to the gallery (sans sensitive fields). */
export interface PhotoItem {
  id: string;
  mimeType: string;
  size: number;
}

/**
 * Couple photo gallery (v1): the authenticated couple uploads photos via a file
 * input, sees them in a grid (served through the panel-authorized
 * /api/photos/[id]/file endpoint), and can delete them. Spanish UI, with
 * loading/disabled states, inline errors and an empty state.
 * Guest uploads are out of scope for v1.
 */
export default function PhotoGallery({
  photos: initial,
  locale,
}: {
  photos: PhotoItem[];
  locale: Locale;
}) {
  const [photos, setPhotos] = useState<PhotoItem[]>(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const t = (key: string) => translate(locale, key);

  /** Map API upload error codes to localized message keys. */
  const uploadErrorKey = (code: string): string => {
    switch (code) {
      case "invalid_form":
        return "photo.errUpload";
      case "photo_required":
        return "photo.errRequired";
      case "file_type_not_allowed":
        return "photo.errType";
      case "file_too_large":
        return "photo.errTooLarge";
      case "save_failed":
      case "create_failed":
        return "photo.errUpload";
      default:
        return "photo.errUpload";
    }
  };

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(t(uploadErrorKey(data.error || "")));
      }
      setPhotos((prev) => [data.photo, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("photo.errUpload"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("photo.errDelete"));
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("photo.errDelete"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative inline-flex cursor-pointer items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
          {uploading ? t("photo.uploading") : t("photo.upload")}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            disabled={uploading}
            onChange={handleFile}
          />
        </label>
        <span className="text-xs text-slate-500">{t("photo.sizeHint")}</span>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {photos.length === 0 && !uploading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {t("photo.empty")}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${photo.id}/file`}
                alt={t("photo.alt")}
                className="aspect-square w-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleDelete(photo.id)}
                disabled={deletingId === photo.id}
                className="absolute right-2 top-2 rounded-lg bg-black/60 px-3 py-1 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
              >
                {deletingId === photo.id ? t("photo.deleting") : t("photo.delete")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
