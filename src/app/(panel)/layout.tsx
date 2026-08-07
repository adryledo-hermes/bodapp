const links = [
  { href: "/guests", label: "Invitados" },
  { href: "/mesas", label: "Mesas" },
  { href: "/decoracion", label: "Decoración" },
  { href: "/tareas", label: "Tareas" },
  { href: "/invitation", label: "Invitación" },
];

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <span className="font-bold text-slate-900">Bodapp</span>
          <div className="flex gap-4 text-sm text-slate-600">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-slate-900">
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </nav>
      <div className="py-6">{children}</div>
    </div>
  );
}