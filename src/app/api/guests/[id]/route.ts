import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { guestSchema } from "@/lib/guests";

type Ctx = { params: Promise<{ id: string }> };

// Guard: fetch a guest only if it belongs to the session's wedding.
async function fetchOwnedGuest(id: string, weddingId: string) {
  return prisma.guest.findFirst({
    where: { id, weddingId },
    include: { table: true, from: true, to: true },
  });
}

// PATCH /api/guests/[id]
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const owned = await fetchOwnedGuest(id, auth.session.weddingId);
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = guestSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const guest = await prisma.guest.update({
    where: { id },
    data: parsed.data,
    include: { table: true, from: true, to: true },
  });
  return NextResponse.json({ guest });
}

// DELETE /api/guests/[id]
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const owned = await fetchOwnedGuest(id, auth.session.weddingId);
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.guest.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
