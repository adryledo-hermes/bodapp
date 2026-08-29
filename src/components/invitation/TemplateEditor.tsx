"use client";

import { useState } from "react";
import {
  DEFAULT_TEMPLATE,
  type TemplateContent,
} from "@/lib/invitation";
import { translate, type Locale } from "@/lib/i18n";

interface TemplateEditorProps {
  initialContent: TemplateContent;
  initialVersion: number;
  initialBankAccount: string;
  initialCoupleNameA?: string;
  initialCoupleNameB?: string;
  locale: Locale;
}

interface DraftState {
  message: string;
  date: string;
  time: string;
  dressCode: string;
  primary: string;
  accent: string;
  bankAccount: string;
  imageUrl: string | null;
  schedule: string;
  directions: string;
  accommodation: string;
}

function toDraft(content: TemplateContent, bankAccount: string): DraftState {
  return {
    message: content.message ?? "",
    date: content.date ?? "",
    time: content.time ?? "",
    dressCode: content.dressCode ?? "",
    primary: content.colors?.primary ?? DEFAULT_TEMPLATE.colors.primary,
    accent: content.colors?.accent ?? DEFAULT_TEMPLATE.colors.accent,
    bankAccount: bankAccount ?? "",
    imageUrl: content.imageUrl ?? null,
    schedule: content.schedule ?? "",
    directions: content.directions ?? "",
    accommodation: content.accommodation ?? "",
  };
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";

export default function TemplateEditor({
  initialContent,
  initialVersion,
  initialBankAccount,
  initialCoupleNameA = "",
  initialCoupleNameB = "",
  locale,
}: TemplateEditorProps) {
  const [draft, setDraft] = useState<DraftState>(() =>
    toDraft(initialContent, initialBankAccount)
  );
  const [version, setVersion] = useState(initialVersion);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  const set = (key: keyof DraftState, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function uploadImage(file: File) {
    const form = new FormData();
    form.append("photo", file);
    const res = await fetch("/api/photos?purpose=invitation", { method: "POST", body: form });
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
    setMessage(null);
    try {
      const url = await uploadImage(file);
      setDraft((d) => ({ ...d, imageUrl: url }));
    } catch {
      setMessage({ type: "error", text: t("tpl.errSave") });
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/invitation-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: {
            message: draft.message,
            date: draft.date,
            time: draft.time,
            dressCode: draft.dressCode,
            schedule: draft.schedule,
            directions: draft.directions,
            accommodation: draft.accommodation,
            colors: { primary: draft.primary, accent: draft.accent },
            imageUrl: draft.imageUrl,
          },
          bankAccount: draft.bankAccount,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const detail =
          data?.error === "invalid input"
            ? t("tpl.errFields")
            : t("tpl.errSave");
        throw new Error(detail);
      }
      const data = await res.json();
      setVersion(data.template?.version ?? version);
      setMessage({
        type: "success",
        text: t("tpl.okSaved", { n: data.template?.version }),
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : t("tpl.errGeneric"),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---- Editor ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("tpl.editTitle")}
          </h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {t("tpl.version", { n: version })}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="message">
              {t("tpl.messageLabel")}
            </label>
            <textarea
              id="message"
              className={inputCls}
              rows={4}
              value={draft.message}
              onChange={(e) => set("message", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="date">
                {t("tpl.dateLabel")}
              </label>
              <input
                id="date"
                type="date"
                className={inputCls}
                value={draft.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="time">
                {t("tpl.timeLabel")}
              </label>
              <input
                id="time"
                type="time"
                className={inputCls}
                value={draft.time}
                onChange={(e) => set("time", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="dressCode">
              {t("tpl.dressCodeLabel")}
            </label>
            <input
              id="dressCode"
              className={inputCls}
              value={draft.dressCode}
              onChange={(e) => set("dressCode", e.target.value)}
              placeholder="Etiqueta informal"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm font-medium text-slate-700 sm:col-span-1">
              {t("tpl.scheduleLabel")}
              <textarea className={`mt-1 ${inputCls}`} rows={3} value={draft.schedule} onChange={(e) => set("schedule", e.target.value)} placeholder="16:00 · Ceremonia\n18:00 · Cóctel\n20:00 · Cena" />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-1">
              {t("tpl.directionsLabel")}
              <textarea className={`mt-1 ${inputCls}`} rows={3} value={draft.directions} onChange={(e) => set("directions", e.target.value)} placeholder="Carretera M-... / mapa" />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-1">
              {t("tpl.accommodationLabel")}
              <textarea className={`mt-1 ${inputCls}`} rows={3} value={draft.accommodation} onChange={(e) => set("accommodation", e.target.value)} placeholder="Hoteles cercanos y código" />
            </label>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("invman.image")}
            </span>
            <div className="flex items-center gap-3">
              {draft.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.imageUrl}
                  alt={t("invman.image")}
                  className="h-14 w-20 rounded-lg object-cover"
                />
              )}
              <label className="tap-min inline-block cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                {uploading
                  ? t("guest.uploading")
                  : draft.imageUrl
                    ? t("invman.changeImage")
                    : t("invman.uploadImage")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleImage}
                />
              </label>
              {draft.imageUrl && (
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, imageUrl: null }))}
                  className="tap-min rounded-lg px-2 py-1 text-sm text-rose-600 hover:bg-rose-50"
                >
                  ✕ {t("invman.removeImage")}
                </button>
              )}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("tpl.colorsLabel")}
            </span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                {t("tpl.primaryLabel")}
                <input
                  type="color"
                  value={draft.primary}
                  onChange={(e) => set("primary", e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-slate-300"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                {t("tpl.accentLabel")}
                <input
                  type="color"
                  value={draft.accent}
                  onChange={(e) => set("accent", e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-slate-300"
                />
              </label>
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="bankAccount">
              {t("tpl.bankLabel")}
            </label>
            <input
              id="bankAccount"
              className={inputCls}
              value={draft.bankAccount}
              onChange={(e) => set("bankAccount", e.target.value)}
              placeholder="ES00 0000 0000 0000 0000 0000"
            />
            <p className="mt-1 text-xs text-slate-500">{t("tpl.bankHelp")}</p>
          </div>
        </div>

        {message && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-lg px-4 py-3 text-sm ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? t("common.saving") : t("tpl.savePublish")}
          </button>
        </div>
      </section>

      {/* ---- Live preview — mirrors the real guest invitation ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{t("tpl.preview")}</h2>
        <div className="mx-auto max-w-md overflow-hidden rounded-[2rem] border border-[#D8D1C7] bg-[#FCFAF6] shadow-[0_18px_60px_rgba(93,79,63,0.12)]">
          {draft.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.imageUrl} alt={t("invman.image")} className="max-h-44 w-full object-cover" />
          )}
          <div className="px-8 py-10 text-center">
            <p className="text-[10px] uppercase tracking-[0.36em] text-[#7A6A5A]">{t("inv.invitation")}</p>
            <div className="mx-auto mt-4 h-px w-12 bg-[#7A6A5A]" />
            <h1 className="inv-serif mt-4 text-3xl font-normal italic tracking-wide text-[#403B36] sm:text-4xl">
              {[initialCoupleNameA, initialCoupleNameB].filter(Boolean).join(" & ") ||
                t("tpl.namesFromProfile")}
            </h1>
            {draft.message && (
              <p className="inv-serif mx-auto mt-4 max-w-sm text-base italic leading-relaxed text-[#5D554D]">
                {draft.message}
              </p>
            )}
          </div>

          <div className="mx-6 grid gap-3 rounded-2xl bg-[#F3EFE8] p-5 text-center text-sm text-[#5D554D] sm:grid-cols-2">
            {draft.date ? <div><span className="font-semibold text-[#7A6A5A]">{t("inv.dateLabel")}: </span>{draft.date}</div> : null}
            {draft.time ? <div><span className="font-semibold text-[#7A6A5A]">{t("inv.timeLabel")}: </span>{draft.time}</div> : null}
            {draft.dressCode ? <div className="sm:col-span-2"><span className="font-semibold text-[#7A6A5A]">{t("inv.dressCodeLabel")}: </span>{draft.dressCode}</div> : null}
          </div>

          {draft.schedule && (
            <div className="mx-6 border-t border-[#D8D1C7] px-0 pb-2 pt-5 text-center">
              <h2 className="inv-serif text-xl italic font-normal text-[#403B36]">{t("inv.scheduleTitle")}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5D554D]">{draft.schedule}</p>
            </div>
          )}

          {(draft.directions || draft.accommodation) && (
            <div className="mx-6 grid gap-3 pb-5 sm:grid-cols-2">
              {draft.directions ? (
                <div className="rounded-2xl bg-[#F3EFE8] p-4 text-center">
                  <h2 className="inv-serif text-lg italic font-normal text-[#403B36]">{t("inv.directionsTitle")}</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5D554D]">{draft.directions}</p>
                </div>
              ) : null}
              {draft.accommodation ? (
                <div className="rounded-2xl bg-[#F3EFE8] p-4 text-center">
                  <h2 className="inv-serif text-lg italic font-normal text-[#403B36]">{t("inv.accommodationTitle")}</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5D554D]">{draft.accommodation}</p>
                </div>
              ) : null}
            </div>
          )}

          {draft.bankAccount && (
            <div className="mx-6 pb-6">
              <div className="rounded-2xl border border-[#D8D1C7] bg-white/80 p-4 text-center">
                <p className="text-sm font-semibold text-[#403B36]">{t("tpl.bankTransfer")}</p>
                <p className="mt-2 font-mono text-sm tracking-wide text-[#5D554D]">{draft.bankAccount}</p>
                <p className="mt-1 text-xs text-[#8B8176]">{t("tpl.bankHelp")}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
