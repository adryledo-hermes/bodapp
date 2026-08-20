"use client";

import { useEffect, useState } from "react";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import LogoutButton from "@/components/LogoutButton";
import { translate, type Locale } from "@/lib/i18n";
import type { NavLink } from "@/lib/nav";

/**
 * Mobile navigation drawer. On small screens the panel menu moves out of the
 * header into a hamburger → slide-in side panel (with locale switcher + logout
 * at the bottom). Closes on link tap, on backdrop tap, and on Escape.
 */
export default function NavDrawer({
  links,
  locale,
}: {
  links: NavLink[];
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const t = (key: string) => translate(locale, key);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("nav.openMenu")}
        aria-expanded={open}
        className="tap-min -ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.menu")}>
          {/* Backdrop */}
          <button
            type="button"
            aria-label={t("nav.closeMenu")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          {/* Panel */}
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <span className="font-bold text-slate-900">Bodapp</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("nav.closeMenu")}
                className="tap-min rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {l.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <LocaleSwitcher locale={locale} />
              <LogoutButton locale={locale} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}