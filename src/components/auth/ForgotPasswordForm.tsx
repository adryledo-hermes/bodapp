"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { getClientLocale, translate, type Locale } from "@/lib/i18n";

const localeStore = {
  subscribe: () => () => {},
  getSnapshot() {
    return getClientLocale("es");
  },
  getServerSnapshot() {
    return "es" as Locale;
  },
};

/**
 * POSTs /api/auth/password/forgot. The API answers identically whether or not
 * the address exists, so this form confirms the same way either way — nobody
 * can probe which emails have accounts here.
 */
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locale = useSyncExternalStore(
    localeStore.subscribe,
    localeStore.getSnapshot,
    localeStore.getServerSnapshot
  );
  const t = (key: string) => translate(locale, key);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setError(t("login.err"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("login.errNetwork"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {t("forgot.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{t("forgot.subtitle")}</p>
          </div>
          <LocaleSwitcher locale={locale} />
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
          {t("login.email")}
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          required
        />

        {sent && (
          <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {t("forgot.sent")}
          </p>
        )}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="tap-min w-full rounded-lg bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {t("forgot.submit")}
        </button>

        <p className="mt-4 text-center text-sm">
          <Link
            href="/login"
            className="text-slate-500 underline hover:text-slate-800"
          >
            {t("forgot.back")}
          </Link>
        </p>
      </form>
    </main>
  );
}