"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeInvitationContent, type InvitationContent } from "@/lib/invitation-inline";
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
 * Per-invitation editor: set an image (upload via the existing /api/photos),
 * override the copy (names, message, date, venue…), and see the live QR
 * underneath. Saves via PATCH /api/invitations/[id]. No decorative frame is used.
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
                <input type="date" className={`mt-1 ${inputClassName}`} value={content.date} onChange={(e) => set("date", e.target.value)} /></label>
              <label className="block text-sm font-medium text-slate-700">{t("inv.timeLabel")}
                <input type="time" className={`mt-1 ${inputClassName}`} value={content.time} onChange={(e) => set("time", e.target.value)} /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">{t("inv.venueLabel")}
                <input className={`mt-1 ${inputClassName}`} value={content.venue} onChange={(e) => set("venue", e.target.value)} /></label>
              <label className="block text-sm font-medium text-slate-700">{t("inv.dressCodeLabel")}
                <input className={`mt-1 ${inputClassName}`} value={content.dressCode} onChange={(e) => set("dressCode", e.target.value)} /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium text-slate-700">{t("tpl.scheduleLabel")}
                <textarea rows={3} className={`mt-1 ${inputClassName}`} value={content.schedule} onChange={(e) => set("schedule", e.target.value)} /></label>
              <label className="block text-sm font-medium text-slate-700">{t("tpl.directionsLabel")}
                <textarea rows={3} className={`mt-1 ${inputClassName}`} value={content.directions} onChange={(e) => set("directions", e.target.value)} /></label>
              <label className="block text-sm font-medium text-slate-700">{t("tpl.accommodationLabel")}
                <textarea rows={3} className={`mt-1 ${inputClassName}`} value={content.accommodation} onChange={(e) => set("accommodation", e.target.value)} /></label>
            </div>
          </div>

          {/* Right: live preview — mirrors the real guest invitation layout */}
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">{t("invman.preview")}</p>
            <div className="overflow-hidden rounded-[2rem] border border-[#D8D1C7] bg-[#FCFAF6] shadow-[0_12px_40px_rgba(93,79,63,0.10)]">
              {content.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={content.imageUrl} alt={t("invman.preview")} className="max-h-40 w-full object-cover" />
              )}
              <div className="px-5 py-6 text-center">
                <p className="text-[10px] uppercase tracking-[0.36em] text-[#7A6A5A]">{t("inv.invitation")}</p>
                <div className="mx-auto mt-3 h-px w-10 bg-[#7A6A5A]" />
                <h3 className="inv-serif mt-3 text-2xl font-normal italic tracking-wide text-[#403B36]">
                  {[content.titleA, content.titleB].filter(Boolean).join(" & ") || invitation.title}
                </h3>
                {content.message && (
                  <p className="inv-serif mt-3 text-sm italic leading-relaxed text-[#5D554D] line-clamp-2">{content.message}</p>
                )}
              </div>

              <div className="mx-5 grid gap-2 rounded-2xl bg-[#F3EFE8] p-4 text-center text-xs text-[#5D554D] sm:grid-cols-2">
                {content.date && <div><span className="font-semibold text-[#7A6A5A]">{t("inv.dateLabel")}: </span>{content.date}</div>}
                {content.time && <div><span className="font-semibold text-[#7A6A5A]">{t("inv.timeLabel")}: </span>{content.time}</div>}
                {content.venue && <div className="sm:col-span-2"><span className="font-semibold text-[#7A6A5A]">{t("inv.venueLabel")}: </span>{content.venue}</div>}
                {content.dressCode && <div className="sm:col-span-2"><span className="font-semibold text-[#7A6A5A]">{t("inv.dressCodeLabel")}: </span>{content.dressCode}</div>}
              </div>

              {content.schedule && (
                <div className="mx-5 border-t border-[#D8D1C7] px-0 pb-2 pt-4 text-center">
                  <p className="inv-serif text-sm italic font-normal text-[#403B36]">{t("inv.scheduleTitle")}</p>
                  <p className="mt-1 whitespace-pre-line text-[11px] leading-5 text-[#5D554D]">{content.schedule}</p>
                </div>
              )}

              {(content.directions || content.accommodation) && (
                <div className="mx-5 grid gap-2 pb-5 sm:grid-cols-2">
                  {content.directions && <div className="rounded-xl bg-[#F3EFE8] p-3 text-center"><p className="inv-serif text-xs italic text-[#403B36]">{t("inv.directionsTitle")}</p><p className="mt-1 text-[11px] text-[#5D554D] whitespace-pre-line line-clamp-2">{content.directions}</p></div>}
                  {content.accommodation && <div className="rounded-xl bg-[#F3EFE8] p-3 text-center"><p className="inv-serif text-xs italic text-[#403B36]">{t("inv.accommodationTitle")}</p><p className="mt-1 text-[11px] text-[#5D554D] whitespace-pre-line line-clamp-2">{content.accommodation}</p></div>}
                </div>
              )}
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