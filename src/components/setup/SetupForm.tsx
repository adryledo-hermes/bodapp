"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { slugFromNames } from "@/lib/onboarding";
import { getClientLocale, LOCALES, translate, type Locale } from "@/lib/i18n";

// No-op store (same pattern as the login page): the locale cookie only changes
// on a full page refresh / router.refresh(), so we read it on the client
// without local mutable state.
const localeStore = {
  subscribe: () => () => {},
  getSnapshot() {
    return getClientLocale("es");
  },
  getServerSnapshot() {
    return "es" as Locale;
  },
};

export default function SetupForm() {
  const router = useRouter();
  const [coupleNameA, setCoupleNameA] = useState("");
  const [coupleNameB, setCoupleNameB] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [slug, setSlug] = useState("");
  const [locale, setLocale] = useState<Locale>("es");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Read the saved locale via useSyncExternalStore so SSR/hydration stays
  // consistent ("es") while the client reads the real cookie after mount.
  const uiLocale = useSyncExternalStore(
    localeStore.subscribe,
    localeStore.getSnapshot,
    localeStore.getServerSnapshot
  );
  const t = (key: string) => translate(uiLocale, key);

  // Mirror the UI language into the wedding locale once the client knows the
  // saved cookie (post-mount), so a visitor whose UI is English doesn't get a
  // Spanish-default wedding by accident. Only set it once — the user can still
  // change the select afterwards.
  const [localeSynced, setLocaleSynced] = useState(false);
  if (!localeSynced && uiLocale !== "es") {
    setLocale(uiLocale);
    setLocaleSynced(true);
  }

  // Live slug preview: the slug input is optional and auto-derives from the
  // couple's names, so the placeholder shows what would be generated.
  const derivedSlug = slug.trim()
    ? slug
    : coupleNameA && coupleNameB
      ? slugFromNames(coupleNameA, coupleNameB)
      : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // guard against Enter-key double submit
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coupleNameA,
          coupleNameB,
          email,
          password,
          slug: slug.trim() || undefined,
          locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "already_configured") {
          setError(t("setup.errAlreadyConfigured"));
        } else {
          setError(t("setup.errGeneric"));
        }
        return;
      }
      router.push(data.redirect || "/guests");
    } catch {
      setError(t("setup.errNetwork"));
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
              {t("setup.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{t("setup.subtitle")}</p>
          </div>
          <LocaleSwitcher locale={uiLocale} />
        </div>

        <label
          className="mb-1 block text-sm font-medium text-slate-700"
          htmlFor="coupleNameA"
        >
          {t("setup.coupleNameA")}
        </label>
        <input
          id="coupleNameA"
          type="text"
          value={coupleNameA}
          onChange={(e) => setCoupleNameA(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          autoComplete="off"
          required
        />

        <label
          className="mb-1 block text-sm font-medium text-slate-700"
          htmlFor="coupleNameB"
        >
          {t("setup.coupleNameB")}
        </label>
        <input
          id="coupleNameB"
          type="text"
          value={coupleNameB}
          onChange={(e) => setCoupleNameB(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          autoComplete="off"
          required
        />

        <label
          className="mb-1 block text-sm font-medium text-slate-700"
          htmlFor="setupEmail"
        >
          {t("setup.email")}
        </label>
        <input
          id="setupEmail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          autoComplete="email"
          required
        />

        <label
          className="mb-1 block text-sm font-medium text-slate-700"
          htmlFor="setupPassword"
        >
          {t("setup.password")}
        </label>
        <input
          id="setupPassword"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          autoComplete="new-password"
          minLength={8}
          required
        />

        <label
          className="mb-1 block text-sm font-medium text-slate-700"
          htmlFor="setupSlug"
        >
          {t("setup.slug")}
        </label>
        <input
          id="setupSlug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={derivedSlug || t("setup.slugHint")}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          autoComplete="off"
        />

        <label
          className="mb-1 block text-sm font-medium text-slate-700"
          htmlFor="setupLocale"
        >
          {t("setup.locale")}
        </label>
        <select
          id="setupLocale"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {translate(uiLocale, `locale.${l}`)}
            </option>
          ))}
        </select>

        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="tap-min w-full rounded-lg bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? t("setup.creating") : t("setup.create")}
        </button>
      </form>
    </main>
  );
}