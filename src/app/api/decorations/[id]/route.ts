import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { decorationUpdateSchema } from "@/lib/decorations-schema";
import { normalizeDecoration } from "@/lib/decorations";

type Ctx = { params: Promise<{ id: string }> };

// Guard: fetch a decoration only if it belongs to the session's wedding.
async function fetchOwnedDecoration(id: string, weddingId: string) {
  return prisma.decoration.findFirst({ where: { id, weddingId } });
}

// PATCH /api/decorations/[id] — move / relabel / retype a decoration.
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const owned = await fetchOwnedDecoration(id, auth.session.weddingId);
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = decorationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Sanitize even partial patches (clamp positions, coerce kind/label) and
  // only write back the fields the client actually sent.
  const norm = normalizeDecoration({
    kind: parsed.data.kind ?? owned.kind,
    label: parsed.data.label !== undefined ? parsed.data.label : owned.label,
    positionX: parsed.data.positionX ?? owned.positionX,
    positionY: parsed.data.positionY ?? owned.positionY,
  });

  const data: Record<string, unknown> = {};
  if (parsed.data.kind !== undefined) data.kind = norm.kind;
  if (parsed.data.label !== undefined) data.label = norm.label;
  if (parsed.data.positionX !== undefined) data.positionX = norm.positionX;
  if (parsed.data.positionY !== undefined) data.positionY = norm.positionY;
  if (parsed.data.tableId !== undefined) {
    // Attaching to a table must respect tenant boundaries: the target table
    // has to belong to the SAME wedding as this decoration.
    if (parsed.data.tableId !== null) {
      const targetTable = await prisma.table.findFirst({
        where: { id: parsed.data.tableId, weddingId: auth.session.weddingId },
      });
      if (!targetTable) {
        return NextResponse.json({ error: "table not found" }, { status: 404 });
      }
    }
    data.tableId = parsed.data.tableId;
  }

  const decoration = await prisma.decoration.update({
    where: { id },
    data,
  });
  return NextResponse.json({ decoration });
}

// DELETE /api/decorations/[id] — remove a decoration item.
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const owned = await fetchOwnedDecoration(id, auth.session.weddingId);
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.decoration.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
