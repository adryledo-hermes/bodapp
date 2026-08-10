"use client";

import Link from "next/link";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { translate, type Locale } from "@/lib/i18n";

/**
 * Welcome / landing screen: two primary actions — log in (existing couple) or
 * register a new couple (create a wedding). Shown at `/` when not authenticated.
 */
export default function WelcomeLanding({ locale }: { locale: Locale }) {
  const t = (key: string) => translate(locale, key);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex items-center justify-end">
          <LocaleSwitcher locale={locale} />
        </div>

        <p className="text-sm font-medium uppercase tracking-wide text-indigo-600">
          {t("welcome.kicker")}
        </p>
        <h1 className="mt-1 text-4xl font-bold text-slate-900">{t("welcome.title")}</h1>
        <p className="mt-3 text-sm text-slate-500">{t("welcome.subtitle")}</p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/login"
            className="tap-min w-full rounded-lg bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-700"
          >
            {t("welcome.login")}
          </Link>
          <Link
            href="/setup"
            className="tap-min w-full rounded-lg border border-slate-300 bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("welcome.createCouple")}
          </Link>
          <p className="text-xs text-slate-400">{t("welcome.createCoupleHint")}</p>
        </div>
      </div>
    </main>
  );
}