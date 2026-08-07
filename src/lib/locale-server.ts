import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale, type Locale } from "./i18n";

/**
 * Server-side locale resolution (panel + public pages).
 *
 * Reads the `bodapp_locale` cookie set by <LocaleSwitcher/> and coerces it to a
 * safe Locale. `fallback` defaults to "es" and may be overridden with the
 * wedding's configured `locale` on public pages so guests see the couple's
 * chosen language by default.
 *
 * Kept in its own module (NOT in src/lib/i18n.ts) because it imports
 * `next/headers`, which must never be pulled into client components that only
 * need `translate`.
 */
export async function getLocale(fallback: Locale = "es"): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value, fallback);
}

/** Render a `<html lang>` value matching a locale. */
export function langFor(locale: Locale): string {
  return locale;
}
