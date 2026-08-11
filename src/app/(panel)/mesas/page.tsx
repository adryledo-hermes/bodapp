import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import SeatingCanvas from "@/components/seating/SeatingCanvas";
import type { SeatingGuest, SeatTable } from "@/lib/seating";
import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type GuestRow = {
  id: string;
  fullName: string;
  alias: string | null;
  seatNumber: number | null;
  from: { relationType: string; guestAId: string; guestBId: string }[];
  to: { relationType: string; guestAId: string; guestBId: string }[];
};

// Collapse a guest's from/to relation edges into the flat array the canvas uses
// for conflict detection.
function toSeatingGuest(g: GuestRow): SeatingGuest {
  return {
    id: g.id,
    fullName: g.fullName,
    alias: g.alias,
    seatNumber: g.seatNumber,
    relations: [...g.from, ...g.to],
  };
}

export default async function MesasPage() {
  const auth = await requireSession();
  if (auth.error) redirect("/login");

  const locale = await getLocale();

  const tables = await prisma.table.findMany({
    where: tenantWhere(auth.session),
    include: {
      guests: { include: { from: true, to: true } },
      // Attached decorations (every table auto-ships a centerpiece).
      decorations: { select: { id: true, kind: true, label: true } },
    },
    orderBy: { name: "asc" },
  });

  const unassignedGuests = await prisma.guest.findMany({
    where: tenantWhere(auth.session, { tableId: null }),
    include: { from: true, to: true },
    orderBy: { createdAt: "asc" },
  });

  const seatTables: SeatTable[] = tables.map((t) => ({
    id: t.id,
    name: t.name,
    shape: t.shape,
    capacity: t.capacity,
    positionX: t.positionX,
    positionY: t.positionY,
    guests: t.guests.map(toSeatingGuest),
    decorations: t.decorations.map((d) => ({
      id: d.id,
      kind: d.kind,
      label: d.label,
    })),
  }));

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {translate(locale, "p.mesas.title")}
        </h1>
        <p className="text-sm text-slate-500">
          {translate(locale, "p.mesas.subtitle")}
        </p>
      </header>
      <SeatingCanvas
        tables={seatTables}
        guests={unassignedGuests.map(toSeatingGuest)}
        locale={locale}
      />
    </main>
  );
}
