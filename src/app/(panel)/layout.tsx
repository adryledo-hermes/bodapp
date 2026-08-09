import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import LogoutButton from "@/components/LogoutButton";
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <span className="mr-1 font-bold text-slate-900">Bodapp</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="whitespace-nowrap hover:text-slate-900">
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <LocaleSwitcher locale={locale} />
            <LogoutButton locale={locale} />
          </div>
        </div>
      </nav>
      <div className="py-4 sm:py-6">{children}</div>
    </div>
  );
}
