"use client";

import { useRouter } from "next/navigation";
import { LOCALES, setClientLocale, translate, type Locale } from "@/lib/i18n";

/**
 * ES/EN language switcher (Task 13). Lives in the panel nav and the public
 * invitation pages. Clicking a locale sets the `bodapp_locale` cookie
 * client-side and refreshes the route so server components re-render with the
 * new language.
 *
 * The couple's panel choice is persisted in the cookie; public pages default to
 * the wedding's configured locale only when no cookie has been set yet.
 */
export default function LocaleSwitcher({
  locale,
}: {
  locale: Locale;
}) {
  const router = useRouter();

  function setLocale(next: Locale) {
    setClientLocale(next);
    router.refresh();
  }

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium"
      role="group"
      aria-label={translate(locale, "locale.switchTo")}
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            aria-pressed={active}
            className={`rounded-md px-2 py-1 transition-colors ${
              active
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {translate(locale, `locale.${l}`)}
          </button>
        );
      })}
    </div>
  );
}
