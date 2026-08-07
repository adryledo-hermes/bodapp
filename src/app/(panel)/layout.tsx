import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import type { Locale } from "@/lib/i18n";

function navLinks(locale: Locale) {
  return [
    { href: "/guests", label: translate(locale, "nav.guests") },
    { href: "/mesas", label: translate(locale, "nav.mesas") },
    { href: "/decoracion", label: translate(locale, "nav.decoracion") },
    { href: "/tareas", label: translate(locale, "nav.tareas") },
    { href: "/invitacion", label: translate(locale, "nav.invitacion") },
    { href: "/qr", label: translate(locale, "nav.qr") },
    { href: "/fotos", label: translate(locale, "nav.fotos") },
  ];
}

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const links = navLinks(locale);

  return (
    <div className="min-h-full">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <span className="font-bold text-slate-900">Bodapp</span>
          <div className="flex flex-1 gap-4 text-sm text-slate-600">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-slate-900">
                {l.label}
              </a>
            ))}
          </div>
          <LocaleSwitcher locale={locale} />
        </div>
      </nav>
      <div className="py-6">{children}</div>
    </div>
  );
}
