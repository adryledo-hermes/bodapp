import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { parseTableShape } from "@/lib/seating";
import { tableUpdateSchema } from "@/lib/tables";

type Ctx = { params: Promise<{ id: string }> };

// Guard: fetch a table only if it belongs to the session's wedding.
async function fetchOwnedTable(id: string, weddingId: string) {
  return prisma.table.findFirst({ where: { id, weddingId } });
}

// PATCH /api/tables/[id] — rename / reshape / resize / reposition a table.
export async function PATCH(req: Request, { params }: Ctx) {
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

  const parsed = tableUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = { ...parsed.data };
  if (data.shape !== undefined) {
    data.shape = parseTableShape(data.shape);
  }

  const table = await prisma.table.update({
    where: { id },
    data,
    include: { guests: true },
  });
  return NextResponse.json({ table });
}

// DELETE /api/tables/[id] — delete a table and unassign its guests.
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const owned = await fetchOwnedTable(id, auth.session.weddingId);
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Free the seated guests before removing the table so no row points at it.
  await prisma.guest.updateMany({
    where: { tableId: id },
    data: { tableId: null },
  });
  await prisma.table.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}