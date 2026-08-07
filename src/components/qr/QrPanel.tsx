"use client";

import { translate, type Locale } from "@/lib/i18n";

/** A single invitation as surfaced to the QR panel (title + id). */
export interface QrInvitation {
  id: string;
  title: string;
}

/**
 * Lists each invitation with a live QR preview and a "Descargar QR" control.
 * The QR endpoint is the panel-authorized route /api/invitation/[id]/qr; an
 * <img> renders the preview and an <a download> lets the couple save the PNG.
 */
export default function QrPanel({
  invitations,
  locale,
}: {
  invitations: QrInvitation[];
  locale: Locale;
}) {
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  if (invitations.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        {t("qr.empty")}
      </div>
    );
  }

  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {invitations.map((inv) => {
        const qrUrl = `/api/invitation/${inv.id}/qr`;
        return (
          <li
            key={inv.id}
            className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-center text-base font-semibold text-slate-900">
              {inv.title}
            </h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt={t("qr.alt", { title: inv.title })}
              width={200}
              height={200}
              className="h-48 w-48 rounded-lg border border-slate-100 bg-white object-contain"
            />
            <a
              href={qrUrl}
              download={t("qr.fileName", { id: inv.id })}
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              {t("qr.download")}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
