import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import GuestBoard from "@/components/guests/GuestBoard";
import type { GuestCardData } from "@/lib/guest-view";
import { getLocale } from "@/lib/locale-server";
import { plural, translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

  const locale = await getLocale();

  const guests = await prisma.guest.findMany({
    where: tenantWhere(auth.session),
    include: { table: true },
    orderBy: { createdAt: "asc" },
  });

  const cards: GuestCardData[] = guests.map((g) => ({
    id: g.id,
    fullName: g.fullName,
    alias: g.alias,
    relationshipContext: g.relationshipContext,
    phone: g.phone,
    allergies: g.allergies,
    musicPrefs: g.musicPrefs,
    paperInvitation: g.paperInvitation,
    plusOneAllowed: g.plusOneAllowed,
    plusOneName: g.plusOneName,
    rsvpStatus: g.rsvpStatus,
    notes: g.notes,
    table: g.table ? { id: g.table.id, label: g.table.name } : null,
  }));

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {translate(locale, "p.guests.title")}
        </h1>
        <p className="text-sm text-slate-500">
          {translate(locale, "p.guests.subtitle", {
            count: cards.length,
            plural: plural(locale, "guest.count", cards.length),
          })}
        </p>
      </header>
      <GuestBoard guests={cards} locale={locale} />
    </main>
  );
}
