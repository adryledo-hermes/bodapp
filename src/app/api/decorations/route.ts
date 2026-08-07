import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import { decorationCreateSchema } from "@/lib/decorations-schema";
import { normalizeDecoration } from "@/lib/decorations";

// GET /api/decorations — list the session's wedding decorations (tenant-scoped).
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const decorations = await prisma.decoration.findMany({
    where: tenantWhere(auth.session),
    orderBy: { id: "asc" },
  });
  return NextResponse.json({ decorations });
}

// POST /api/decorations — create a decoration/gift zone on the canvas.
export async function POST(req: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = decorationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Sanitize the incoming data (clamp positions, coerce kind/label) before
  // persisting so the DB never holds out-of-range or unknown values.
  const norm = normalizeDecoration(parsed.data);

  const decoration = await prisma.decoration.create({
    data: {
      kind: norm.kind,
      label: norm.label,
      positionX: norm.positionX,
      positionY: norm.positionY,
      weddingId: auth.session.weddingId,
    },
  });
  return NextResponse.json({ decoration }, { status: 201 });
}
