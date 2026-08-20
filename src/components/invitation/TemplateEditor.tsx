"use client";

import { useState } from "react";
import {
  DEFAULT_TEMPLATE,
  isValidHexColor,
  type TemplateContent,
} from "@/lib/invitation";
import { FRAME_OPTIONS } from "@/lib/invitation-inline";
import { translate, type Locale } from "@/lib/i18n";

interface TemplateEditorProps {
  initialContent: TemplateContent;
  initialVersion: number;
  initialBankAccount: string;
  locale: Locale;
}

interface DraftState {
  titleA: string;
  titleB: string;
  message: string;
  date: string;
  time: string;
  venue: string;
  dressCode: string;
  primary: string;
  accent: string;
  bankAccount: string;
  frame: string;
  imageUrl: string | null;
}

function toDraft(content: TemplateContent, bankAccount: string): DraftState {
  return {
    titleA: content.titleA ?? "",
    titleB: content.titleB ?? "",
    message: content.message ?? "",
    date: content.date ?? "",
    time: content.time ?? "",
    venue: content.venue ?? "",
    dressCode: content.dressCode ?? "",
    primary: content.colors?.primary ?? DEFAULT_TEMPLATE.colors.primary,
    accent: content.colors?.accent ?? DEFAULT_TEMPLATE.colors.accent,
    bankAccount: bankAccount ?? "",
    frame: content.frame ?? DEFAULT_TEMPLATE.frame,
    imageUrl: content.imageUrl ?? null,
  };
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";

export default function TemplateEditor({
  initialContent,
  initialVersion,
  initialBankAccount,
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
            titleA: draft.titleA,
            titleB: draft.titleB,
            message: draft.message,
            date: draft.date,
            time: draft.time,
            venue: draft.venue,
            dressCode: draft.dressCode,
            colors: { primary: draft.primary, accent: draft.accent },
            frame: draft.frame,
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="titleA">
                {t("tpl.titleA")}
              </label>
              <input
                id="titleA"
                className={inputCls}
                value={draft.titleA}
                onChange={(e) => set("titleA", e.target.value)}
                placeholder="Ana"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="titleB">
                {t("tpl.titleB")}
              </label>
              <input
                id="titleB"
                className={inputCls}
                value={draft.titleB}
                onChange={(e) => set("titleB", e.target.value)}
                placeholder="Luis"
              />
            </div>
          </div>

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

          <div className="grid grid-cols-2 gap-3">
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
            <label className={labelCls} htmlFor="venue">
              {t("tpl.venueLabel")}
            </label>
            <input
              id="venue"
              className={inputCls}
              value={draft.venue}
              onChange={(e) => set("venue", e.target.value)}
              placeholder="Finca El Roble, Madrid"
            />
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

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("invman.frame")}
            </span>
            <div className="flex flex-wrap gap-2">
              {FRAME_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => set("frame", f.id)}
                  className={`tap-min rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    draft.frame === f.id
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

      {/* ---- Live preview ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{t("tpl.preview")}</h2>
        {/* Defense-in-depth: only apply color values that are valid hex, else
            fall back to the safe defaults — a non-hex value can never reach the
            `style=` attribute (see HEX_COLOR_RE in @/lib/invitation). */}
        <div
          className={`inv-frame-${draft.frame} relative overflow-hidden rounded-lg border border-slate-200 shadow-sm`}
          style={{
            background: isValidHexColor(draft.accent)
              ? draft.accent
              : DEFAULT_TEMPLATE.colors.accent,
          }}
        >
          {draft.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.imageUrl}
              alt={t("invman.image")}
              className="max-h-44 w-full object-cover"
            />
          )}
          <div
            className="p-8 text-center"
            style={{
              color: isValidHexColor(draft.primary)
                ? draft.primary
                : DEFAULT_TEMPLATE.colors.primary,
            }}
          >
            {draft.titleA || draft.titleB ? (
              <p className="mb-1 text-3xl font-bold">
                {draft.titleA} &amp; {draft.titleB}
              </p>
            ) : (
              <p className="mb-1 text-3xl font-bold text-slate-400">
                {t("tpl.namesFallback")}
              </p>
            )}
            <p className="mb-4 text-sm uppercase tracking-widest text-slate-600">
              {t("tpl.ourWedding")}
            </p>

            <p className="mx-auto mb-4 max-w-md text-sm leading-relaxed">
              {draft.message || "…"}
            </p>

            {(draft.date || draft.time) && (
              <p className="text-sm font-medium">
                📅 {draft.date}
                {draft.date && draft.time ? " · " : ""}
                {draft.time && <>🕒 {draft.time}</>}
              </p>
            )}
            {draft.venue && <p className="mt-1 text-sm">📍 {draft.venue}</p>}
            {draft.dressCode && (
              <p className="mt-1 text-sm">👔 {draft.dressCode}</p>
            )}

            {draft.bankAccount && (
              <div className="mx-auto mt-5 max-w-sm rounded-lg bg-white/70 p-3 text-left">
                <p className="text-xs font-semibold uppercase tracking-wide">
                  {t("tpl.bankTransfer")}
                </p>
                <p className="mt-1 font-mono text-sm tracking-wide">
                  {draft.bankAccount}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
