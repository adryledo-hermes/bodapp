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
              onError={(e) => {
                // Swap to a small fallback if the QR preview fails to load
                // (e.g. transient 5xx), so the card still renders cleanly.
                const el = e.currentTarget;
                el.onerror = null;
                el.src =
                  "data:image/svg+xml;utf8," +
                  encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#f1f5f9"/><text x="100" y="104" font-family="sans-serif" font-size="18" fill="#64748b" text-anchor="middle">${t(
                      "qr.unavailable"
                    )}</text></svg>`
                  );
              }}
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
