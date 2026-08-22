import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { z } from "zod";

const profileSchema = z.object({
  coupleNameA: z.string().min(1).max(200),
  coupleNameB: z.string().min(1).max(200),
  email: z.string().max(300).nullable().optional(),
  venue: z.string().max(300).nullable().optional(),
});

/**
 * GET /api/wedding/profile — returns the wedding's profile data for the panel.
 */
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const wedding = await prisma.wedding.findUnique({
    where: { id: auth.session.weddingId },
    select: { coupleNameA: true, coupleNameB: true },
  });
  if (!wedding) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // The email + venue columns were added by migration that may not have run on
  // the deployed DB yet. Only return fields that exist in the current schema.
  return NextResponse.json({
    ...wedding,
    email: null,
    venue: null,
  });
}

/**
 * PATCH /api/wedding/profile — updates the wedding's profile fields.
 */
export async function PATCH(req: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Only update fields that exist in the DB. The email/venue columns were added
  // by a migration that may not have run on the deployed DB yet.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { email, venue, ...safeData } = parsed.data;

  const updated = await prisma.wedding.update({
    where: { id: auth.session.weddingId },
    data: safeData,
    select: { coupleNameA: true, coupleNameB: true },
  });

  return NextResponse.json({
    ...updated,
    email: null,
    // placeholder — not persisted yet
    venue: null,  // placeholder — not persisted yet
  });
}