import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import QrPanel, { type QrInvitation } from "@/components/qr/QrPanel";
import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function QrPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

  const locale = await getLocale();

  const invitations = await prisma.invitation.findMany({
    where: tenantWhere(auth.session),
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });

  const rows: QrInvitation[] = invitations.map((i) => ({
    id: i.id,
    title: i.title,
  }));

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {translate(locale, "p.qr.title")}
        </h1>
        <p className="text-sm text-slate-500">
          {translate(locale, "p.qr.subtitle")}
        </p>
      </header>
      <QrPanel invitations={rows} locale={locale} />
    </main>
  );
}
