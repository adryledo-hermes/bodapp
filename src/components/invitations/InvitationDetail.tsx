"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FRAME_OPTIONS,
  DEFAULT_FRAME,
  normalizeInvitationContent,
  type InvitationContent,
} from "@/lib/invitation-inline";
import { translate, type Locale } from "@/lib/i18n";

/** The base info the detail editor needs (title + guests for the QR card). */
export interface InvitationDetailBase {
  id: string;
  title: string;
  content?: unknown; // raw per-invitation content (nullable)
}

const inputClassName =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none";

/**
 * Per-invitation editor: pick a decorative frame, set an image (upload via the
 * existing /api/photos), override the copy (names, message, date, venue…), and
 * see the live QR underneath. Saves via PATCH /api/invitations/[id].
 */
export default function InvitationDetail({
  invitation,
  locale,
  onClose,
}: {
  invitation: InvitationDetailBase;
  locale: Locale;
  onClose: () => void;
}) {
  const router = useRouter();
  const initial = normalizeInvitationContent(invitation.content);
  const [content, setContent] = useState<InvitationContent>(initial);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const qrUrl = `/api/invitation/${invitation.id}/qr`;

  function set<K extends keyof InvitationContent>(key: K, value: InvitationContent[K]) {
    setContent((c) => ({ ...c, [key]: value }));
  }

  async function uploadImage(file: File) {
    const form = new FormData();
    form.append("photo", file);
    const res = await fetch("/api/photos", { method: "POST", body: form });
    if (!res.ok) throw new Error("upload failed");
    const data = await res.json();
    const id = data.photo?.id;
    if (!id) throw new Error("no photo id");
    return `/api/photos/${id}/file`;
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadImage(file);
      set("imageUrl", url);
    } catch {
      setError(t("invman.errNetwork"));
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (loading) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch(`/api/invitations/${invitation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });
      if (!res.ok) {
        setError(t("invman.errSave"));
        return;
      }
      setSuccess(t("invman.saved"));
      router.refresh();
    } catch {
      setError(t("invman.errNetwork"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            {invitation.title} — {t("invman.personalize")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("guest.cancel")} className="tap-min rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          {/* Left: editor */}
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">{t("invman.frame")}</p>
              <div className="flex flex-wrap gap-2">
                {FRAME_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => set("frame", f.id)}
                    className={`tap-min rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      content.frame === f.id
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">{t("invman.image")}</p>
              <div className="flex items-center gap-3">
                {content.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={content.imageUrl} alt={t("invman.image")} className="h-16 w-24 rounded-lg object-cover" />
                )}
                <label className="tap-min inline-block cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  {uploading ? t("guest.uploading") : content.imageUrl ? t("invman.changeImage") : t("invman.uploadImage")}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleImage} />
                </label>
                {content.imageUrl && (
                  <button type="button" onClick={() => set("imageUrl", null)} className="tap-min rounded-lg px-2 py-1 text-sm text-rose-600 hover:bg-rose-50">✕ {t("invman.removeImage")}</button>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">{t("invman.titleA")}
                <input className={`mt-1 ${inputClassName}`} value={content.titleA} onChange={(e) => set("titleA", e.target.value)} /></label>
              <label className="block text-sm font-medium text-slate-700">{t("invman.titleB")}
                <input className={`mt-1 ${inputClassName}`} value={content.titleB} onChange={(e) => set("titleB", e.target.value)} /></label>
            </div>

            <label className="block text-sm font-medium text-slate-700">{t("invman.message")}
              <textarea className={`mt-1 ${inputClassName}`} rows={3} value={content.message} onChange={(e) => set("message", e.target.value)} /></label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">{t("inv.dateLabel")}
                <input className={`mt-1 ${inputClassName}`} value={content.date} onChange={(e) => set("date", e.target.value)} /></label>
              <label className="block text-sm font-medium text-slate-700">{t("inv.timeLabel")}
                <input className={`mt-1 ${inputClassName}`} value={content.time} onChange={(e) => set("time", e.target.value)} /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">{t("inv.venueLabel")}
                <input className={`mt-1 ${inputClassName}`} value={content.venue} onChange={(e) => set("venue", e.target.value)} /></label>
              <label className="block text-sm font-medium text-slate-700">{t("inv.dressCodeLabel")}
                <input className={`mt-1 ${inputClassName}`} value={content.dressCode} onChange={(e) => set("dressCode", e.target.value)} /></label>
            </div>
          </div>

          {/* Right: live preview + QR + save */}
          <div className="flex flex-col gap-3">
            {/* Live preview — mirrors the public invitation as the couple edits */}
            <div className={`overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm inv-frame-${content.frame}`}>
              {content.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={content.imageUrl} alt={t("invman.preview")} className="max-h-44 w-full object-cover" />
              )}
              <div className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">{t("invman.preview")}</p>
                <h3 className="mt-1 text-lg font-semibold break-words text-slate-900">
                  {[content.titleA, content.titleB].filter(Boolean).join(" & ") || invitation.title}
                </h3>
                {content.message && (
                  <p className="mt-2 line-clamp-3 text-xs whitespace-pre-line text-slate-600">{content.message}</p>
                )}
                {(content.date || content.venue) && (
                  <p className="mt-2 text-xs text-slate-500">
                    {[content.date, content.time].filter(Boolean).join(" · ")}
                    {content.venue ? ` — ${content.venue}` : ""}
                  </p>
                )}
                {content.dressCode && (
                  <p className="mt-1 text-xs text-slate-400">{t("inv.dressCodeLabel")}: {content.dressCode}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">{t("invman.qr")}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt={t("invman.qr")} className="h-36 w-36 rounded-lg border border-slate-100 bg-white object-contain" />
              <a href={qrUrl} download={`qr-${invitation.id}.png`} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
                {t("invman.qrDownload")}
              </a>
            </div>
          </div>
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-3 text-sm text-green-600">{success}</p>}

        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="tap-min rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            {t("invman.cancel")}
          </button>
          <button type="button" onClick={handleSave} disabled={loading}
            className="tap-min rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
            {loading ? t("common.saving") : t("invman.save")}
          </button>
        </div>
      </div>
    </div>
  );
}