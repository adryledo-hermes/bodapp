"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { translate } from "@/lib/i18n";

/**
 * Logs the couple out: POST /api/auth/logout (clears the session cookie) and
 * sends them back to /login. Plain button so it works from the server-rendered
 * panel layout without a form.
 */
export default function LogoutButton({ locale }: { locale: "es" | "en" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const t = (key: string) => translate(locale, key);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even on a network error the cookie may be gone; still bounce to login.
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="tap-min whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      {loading ? t("nav.loggingOut") : t("nav.logout")}
    </button>
  );
}