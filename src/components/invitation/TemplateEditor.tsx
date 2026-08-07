"use client";

import { useState } from "react";
import { DEFAULT_TEMPLATE, type TemplateContent } from "@/lib/invitation";

interface TemplateEditorProps {
  initialContent: TemplateContent;
  initialVersion: number;
  initialBankAccount: string;
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
  };
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";

export default function TemplateEditor({
  initialContent,
  initialVersion,
  initialBankAccount,
}: TemplateEditorProps) {
  const [draft, setDraft] = useState<DraftState>(() =>
    toDraft(initialContent, initialBankAccount)
  );
  const [version, setVersion] = useState(initialVersion);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const set = (key: keyof DraftState, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

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
          },
          bankAccount: draft.bankAccount,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const detail =
          data?.error === "invalid input"
            ? "Revisa los campos del formulario."
            : "No se ha podido guardar. Vuelve a intentarlo.";
        throw new Error(detail);
      }
      const data = await res.json();
      setVersion(data.template?.version ?? version);
      setMessage({
        type: "success",
        text: `Invitación guardada y publicada (versión ${data.template?.version}).`,
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error al guardar.",
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
            Edita la invitación
          </h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Versión {version}
          </span>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="titleA">
                Nombre del contrayente A
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
                Nombre del contrayente B
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
              Mensaje
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
                Fecha
              </label>
              <input
                id="date"
                className={inputCls}
                value={draft.date}
                onChange={(e) => set("date", e.target.value)}
                placeholder="12 de septiembre de 2026"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="time">
                Hora
              </label>
              <input
                id="time"
                className={inputCls}
                value={draft.time}
                onChange={(e) => set("time", e.target.value)}
                placeholder="13:00 h"
              />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="venue">
              Lugar / Venue
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
              Código de vestimenta
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
              Colores
            </span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Primario
                <input
                  type="color"
                  value={draft.primary}
                  onChange={(e) => set("primary", e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-slate-300"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Acento
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
              Cuenta bancaria (IBAN) para regalos
            </label>
            <input
              id="bankAccount"
              className={inputCls}
              value={draft.bankAccount}
              onChange={(e) => set("bankAccount", e.target.value)}
              placeholder="ES00 0000 0000 0000 0000 0000"
            />
            <p className="mt-1 text-xs text-slate-500">
              Aparecerá en el apartado &quot;Transferencia bancaria&quot; de la
              invitación pública.
            </p>
          </div>
        </div>

        {message && (
          <div
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
            {saving ? "Guardando…" : "Guardar y publicar"}
          </button>
        </div>
      </section>

      {/* ---- Live preview ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Vista previa</h2>
        <div
          className="overflow-hidden rounded-lg border border-slate-200 shadow-sm"
          style={{ background: draft.accent }}
        >
          <div className="p-8 text-center" style={{ color: draft.primary }}>
            {draft.titleA || draft.titleB ? (
              <p className="mb-1 text-3xl font-bold">
                {draft.titleA} &amp; {draft.titleB}
              </p>
            ) : (
              <p className="mb-1 text-3xl font-bold text-slate-400">
                Vuestros nombres
              </p>
            )}
            <p className="mb-4 text-sm uppercase tracking-widest text-slate-600">
              Nuestra boda
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
                  🎁 Transferencia bancaria
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
