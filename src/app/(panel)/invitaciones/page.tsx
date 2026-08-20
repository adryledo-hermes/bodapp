import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import InvitationsManager from "@/components/invitations/InvitationsManager";
import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function InvitacionesPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

  const locale = await getLocale();

  const [invitations, guests] = await Promise.all([
    prisma.invitation.findMany({
      where: tenantWhere(auth.session),
      include: {
        guests: { select: { id: true, fullName: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // All guests, so the couple can hand-pick who goes into each invitation.
    prisma.guest.findMany({
      where: tenantWhere(auth.session),
      select: {
        id: true,
        fullName: true,
        alias: true,
        phone: true,
        invitationId: true, // disables already-invited guests in the picker
      },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {translate(locale, "p.invitaciones.title")}
        </h1>
        <p className="text-sm text-slate-500">
          {translate(locale, "p.invitaciones.subtitle")}
        </p>
      </header>
      <InvitationsManager
        invitations={invitations.map((inv) => ({
          id: inv.id,
          title: inv.title,
          guests: inv.guests,
        }))}
        guests={guests}
        locale={locale}
      />
    </main>
  );
}