"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
 * The form behind the emailed recovery link (`/reset-password?token=…`).
 * A missing token is treated exactly like an expired one — there is nothing
 * to reset, so we never even hit the API.
 */
export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    token ? null : null // invalid-link message appears on submit, not on load
  );

  const locale = useSyncExternalStore(
    localeStore.subscribe,
    localeStore.getSnapshot,
    localeStore.getServerSnapshot
  );
  const t = (key: string) => translate(locale, key);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError(t("reset.invalid"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "invalid_token" ? t("reset.invalid") : t("login.err")
        );
        return;
      }
      router.push(data.redirect || "/login?reset=1");
    } catch {
      setError(t("reset.errNetwork"));
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
              {t("reset.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{t("reset.subtitle")}</p>
          </div>
          <LocaleSwitcher locale={locale} />
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
          {t("reset.password")}
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          required
          minLength={8}
        />

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="tap-min w-full rounded-lg bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {t("reset.submit")}
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