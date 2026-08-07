import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import { parseTableShape } from "@/lib/seating";
import { tableCreateSchema } from "@/lib/tables";

// GET /api/tables — list tables for the session's wedding (tenant-scoped),
// including each table's assigned guests.
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const tables = await prisma.table.findMany({
    where: tenantWhere(auth.session),
    include: { guests: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ tables });
}

// POST /api/tables — create a table on the seating canvas.
export async function POST(req: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = tableCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const table = await prisma.table.create({
    data: {
      ...parsed.data,
      shape: parseTableShape(parsed.data.shape),
      weddingId: auth.session.weddingId,
    },
  });
  return NextResponse.json({ table }, { status: 201 });
}