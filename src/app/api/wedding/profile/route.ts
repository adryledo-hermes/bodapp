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
    select: { coupleNameA: true, coupleNameB: true, email: true, venue: true },
  });
  if (!wedding) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(wedding);
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

  // The email and venue columns were added by migration
  // 20260821_add_email_venue_to_wedding. Write all fields the schema accepts.
  const updated = await prisma.wedding.update({
    where: { id: auth.session.weddingId },
    data: parsed.data,
    select: { coupleNameA: true, coupleNameB: true, email: true, venue: true },
  });

  return NextResponse.json(updated);
}