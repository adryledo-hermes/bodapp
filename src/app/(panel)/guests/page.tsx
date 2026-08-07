import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import GuestBoard from "@/components/guests/GuestBoard";
import type { GuestCardData } from "@/lib/guest-view";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

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
        <h1 className="text-2xl font-bold text-slate-900">Invitados</h1>
        <p className="text-sm text-slate-500">
          {cards.length} invitado{cards.length === 1 ? "" : "s"} — toca una carta
          para ver los detalles
        </p>
      </header>
      <GuestBoard guests={cards} />
    </main>
  );
}