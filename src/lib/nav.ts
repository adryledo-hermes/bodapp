import { translate, type Locale } from "@/lib/i18n";

/** The panel's navigation links (shared by the desktop header + mobile drawer). */
export function navLinks(locale: Locale) {
  return [
    { href: "/panel", label: translate(locale, "nav.dashboard") },
    { href: "/guests", label: translate(locale, "nav.guests") },
    { href: "/mesas", label: translate(locale, "nav.mesas") },
    { href: "/decoracion", label: translate(locale, "nav.decoracion") },
    { href: "/tareas", label: translate(locale, "nav.tareas") },
    { href: "/invitacion", label: translate(locale, "nav.invitacion") },
    { href: "/invitaciones", label: translate(locale, "nav.invitaciones") },
    { href: "/fotos", label: translate(locale, "nav.fotos") },
  ];
}

export type NavLink = (ReturnType<typeof navLinks>)[number];