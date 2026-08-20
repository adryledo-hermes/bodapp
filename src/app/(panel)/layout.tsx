import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";
import { navLinks } from "@/lib/nav";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import LogoutButton from "@/components/LogoutButton";
import NavDrawer from "@/components/NavDrawer";
import type { Locale } from "@/lib/i18n";

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
        <div className="mx-auto flex max-w-6xl items-center gap-x-4 px-4 py-3 sm:px-6">
          {/* Mobile: hamburger opens the nav drawer */}
          <NavDrawer links={links} locale={locale} />

          <span className="mr-1 font-bold text-slate-900">Bodapp</span>

          {/* Desktop: inline links (hidden on mobile — drawer takes over) */}
          <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 lg:flex">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="whitespace-nowrap hover:text-slate-900">
                {l.label}
              </a>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher locale={locale} />
            <LogoutButton locale={locale} />
          </div>
        </div>
      </nav>
      <div className="py-4 sm:py-6">{children}</div>
    </div>
  );
}