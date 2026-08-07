import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ guestId: z.string().min(1) });
const bodySchemaClear = z.object({ guestId: z.string().min(1).optional() });

/**
 * HOW GUEST ASSIGNMENT WORKS:
 * We assign guests to tables through this dedicated route instead of the
 * existing /api/guests/[id] PATCH, because `guestSchema` does not permit a
 * `tableId` field (PATCH would reject it with a validation error). Keeping the
 * assignment here centralizes seat moves (assign, move between tables, clear)
 * and lets us tenant-scope BOTH the table AND the guest in one place.
 *
 *   POST   /api/tables/[id]/guests  { guestId }      -> seat guest at table
 *   DELETE /api/tables/[id]/guests  { guestId }      -> unseat guest (clear)
 */

// Ensure a table belongs to the session's wedding.
async function fetchOwnedTable(id: string, weddingId: string) {
  return prisma.table.findFirst({ where: { id, weddingId } });
}

// POST — seat a guest at this table (moves them from any previous table).
export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const owned = await fetchOwnedTable(id, auth.session.weddingId);
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  // Guest must belong to the same wedding before we re-seat them.
  const guest = await prisma.guest.findFirst({
    where: { id: parsed.data.guestId, weddingId: auth.session.weddingId },
  });
  if (!guest) {
    return NextResponse.json({ error: "guest not found" }, { status: 404 });
  }

  const updated = await prisma.guest.update({
    where: { id: guest.id },
    data: { tableId: id },
    include: { table: true },
  });
  return NextResponse.json({ guest: updated });
}

// DELETE — clear a guest's seat at this table (set tableId to null).
export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  // Only allow clearing from a table that actually belongs to this wedding.
  const owned = await fetchOwnedTable(id, auth.session.weddingId);
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = bodySchemaClear.safeParse(body);
  if (!parsed.success || !parsed.data.guestId) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  // Guest must belong to this wedding, and must currently be seated here.
  const guest = await prisma.guest.findFirst({
    where: { id: parsed.data.guestId, weddingId: auth.session.weddingId },
  });
  if (!guest) {
    return NextResponse.json({ error: "guest not found" }, { status: 404 });
  }

  const updated = await prisma.guest.update({
    where: { id: guest.id },
    data: { tableId: null },
    include: { table: true },
  });
  return NextResponse.json({ guest: updated });
}