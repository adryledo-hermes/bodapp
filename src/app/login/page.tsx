"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { getClientLocale, translate, type Locale } from "@/lib/i18n";

// No-op store: the locale cookie only changes on a full page refresh /
// router.refresh(), so we read it on the client without local mutable state.
const localeStore = {
  subscribe: () => () => {},
  getSnapshot() {
    return getClientLocale("es");
  },
  getServerSnapshot() {
    return "es" as Locale;
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Read the saved locale via useSyncExternalStore so SSR/hydration stays
  // consistent ("es") while the client reads the real cookie after mount.
  const locale = useSyncExternalStore(
    localeStore.subscribe,
    localeStore.getSnapshot,
    localeStore.getServerSnapshot
  );
  const t = (key: string) => translate(locale, key);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("login.err"));
        return;
      }
      router.push(data.redirect || "/panel");
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
            <h1 className="text-2xl font-semibold text-slate-900">Bodapp</h1>
            <p className="mt-1 text-sm text-slate-500">{t("login.access")}</p>
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

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
          {t("login.password")}
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          required
        />

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="tap-min w-full rounded-lg bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? t("login.entering") : t("login.enter")}
        </button>
      </form>
    </main>
  );
}
