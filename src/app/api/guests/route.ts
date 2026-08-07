import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import { guestSchema } from "@/lib/guests";

// GET /api/guests — list guests for the session's wedding (tenant-scoped)
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const guests = await prisma.guest.findMany({
    where: tenantWhere(auth.session),
    include: { table: true, from: true, to: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ guests });
}

// POST /api/guests — create a guest
export async function POST(req: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = guestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const guest = await prisma.guest.create({
    data: {
      ...parsed.data,
      weddingId: auth.session.weddingId,
      invitationToken: randomUUID(),
    },
  });
  return NextResponse.json({ guest }, { status: 201 });
}
