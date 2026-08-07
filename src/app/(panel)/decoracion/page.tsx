import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import DecorationsPlanner from "@/components/decorations/DecorationsPlanner";
import type { SeatingGuest, SeatTable } from "@/lib/seating";
import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type GuestRow = {
  id: string;
  fullName: string;
  alias: string | null;
  from: { relationType: string; guestAId: string; guestBId: string }[];
  to: { relationType: string; guestAId: string; guestBId: string }[];
};

function toSeatingGuest(g: GuestRow): SeatingGuest {
  return {
    id: g.id,
    fullName: g.fullName,
    alias: g.alias,
    relations: [...g.from, ...g.to],
  };
}

export default async function DecoracionPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

  const locale = await getLocale();

  const tables = await prisma.table.findMany({
    where: tenantWhere(auth.session),
    include: { guests: { include: { from: true, to: true } } },
    orderBy: { name: "asc" },
  });

  const unassignedGuests = await prisma.guest.findMany({
    where: tenantWhere(auth.session, { tableId: null }),
    include: { from: true, to: true },
    orderBy: { createdAt: "asc" },
  });

  const decorations = await prisma.decoration.findMany({
    where: tenantWhere(auth.session),
    orderBy: { id: "asc" },
  });

  const seatTables: SeatTable[] = tables.map((t) => ({
    id: t.id,
    name: t.name,
    shape: t.shape,
    capacity: t.capacity,
    positionX: t.positionX,
    positionY: t.positionY,
    guests: t.guests.map(toSeatingGuest),
  }));

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {translate(locale, "p.decoracion.title")}
        </h1>
        <p className="text-sm text-slate-500">
          {translate(locale, "p.decoracion.subtitle")}
        </p>
      </header>
      <DecorationsPlanner
        tables={seatTables}
        guests={unassignedGuests.map(toSeatingGuest)}
        decorations={decorations.map((d) => ({
          id: d.id,
          kind: d.kind,
          label: d.label,
          positionX: d.positionX,
          positionY: d.positionY,
        }))}
        locale={locale}
      />
    </main>
  );
}
