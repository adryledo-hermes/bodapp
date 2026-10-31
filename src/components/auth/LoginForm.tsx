"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
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

/**
 * Flags written by the server page from the query string: `?verified=1|0`
 * (the emailed validation link) and `?reset=1` (the reset form succeeded).
 */
export type LoginNotice = "verified" | "reset" | "linkInvalid";

export default function LoginForm({ notice }: { notice?: LoginNotice }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Read the saved locale via useSyncExternalStore so SSR/hydration stays
  // consistent ("es") while the client reads the real cookie after mount.
  const locale = useSyncExternalStore(
    localeStore.subscribe,
    localeStore.getSnapshot,
    localeStore.getServerSnapshot
  );
  const t = (key: string) => translate(locale, key);

  const bannerKey =
    notice === "verified"
      ? "login.verifiedOk"
      : notice === "reset"
        ? "login.resetOk"
        : notice === "linkInvalid"
          ? "login.verifyFailed"
          : null;

  const [info, setInfo] = useState<string | null>(
    notice === "verified" || notice === "reset" ? t(bannerKey!) : null
  );
  const [error, setError] = useState<string | null>(
    notice === "linkInvalid" ? t(bannerKey!) : null
  );
  // The resend button only appears when it can help: the sign-in was just
  // rejected as unverified, or the emailed link bounced.
  const [showResend, setShowResend] = useState(notice === "linkInvalid");
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "email_not_verified") {
          setError(t("login.notVerified"));
          setShowResend(true);
          return;
        }
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

  /** Re-send the validation email for the address typed above. */
  async function handleResend() {
    if (!email) {
      setError(t("login.err"));
      return;
    }
    setLoading(true);
    setInfo(null);
    setError("");
    try {
      // The API answers identically for unknown/already-verified addresses,
      // so the confirmation below is deliberately unconditional.
      await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResent(true);
      setInfo(t("login.resent"));
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
          className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          required
        />

        <div className="mb-4 text-right">
          <Link
            href="/forgot-password"
            className="text-sm text-slate-500 underline hover:text-slate-800"
          >
            {t("login.forgot")}
          </Link>
        </div>

        {info && (
          <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {info}
          </p>
        )}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {showResend && (
          <button
            type="button"
            onClick={handleResend}
            disabled={loading || resent}
            className="mb-3 block w-full text-left text-sm text-slate-600 underline hover:text-slate-900 disabled:opacity-50"
          >
            {t("login.resend")}
          </button>
        )}

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