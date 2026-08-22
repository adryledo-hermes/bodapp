import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, tenantWhere } from "@/lib/auth-guard";
import { z } from "zod";
import { buildAcceptedPhones } from "@/lib/invitations";

const createSchema = z.object({
  title: z.string().min(1, "Título requerido").max(120),
  guestIds: z.array(z.string().min(1)).min(1, "Elige al menos un invitado"),
});

/**
 * Invitation CRUD (couple panel).
 *
 *   GET    /api/invitations            → list invitations (with guests)
 *   POST   /api/invitations            → create a personalised invitation from
 *                                        a manual group of guests
 *   DELETE /api/invitations/[id]       → remove it (kept in [id]/route.ts)
 *
 * Creating an invitation links each chosen guest to it (guest.invitationId) and
 * derives acceptedPhones from their phone numbers — that is what the public
 * OTP portal validates against.
 */
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const invitations = await prisma.invitation.findMany({
    where: tenantWhere(auth.session),
    include: {
      guests: { select: { id: true, fullName: true, phone: true } },
      _count: { select: { otpCodes: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ invitations });
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  // All chosen guests must belong to this wedding (tenant boundary).
  const guests = await prisma.guest.findMany({
    where: {
      id: { in: parsed.data.guestIds },
      weddingId: auth.session.weddingId,
    },
  });
  if (guests.length !== new Set(parsed.data.guestIds).size) {
    return NextResponse.json({ error: "guest not found" }, { status: 404 });
  }

  // A guest that already has an invitation can't be invited again — the UI
  // disables them, and the server enforces it (defense in depth).
  const alreadyInvited = guests.find((g) => g.invitationId !== null);
  if (alreadyInvited) {
    return NextResponse.json(
      { error: "already invited", guestId: alreadyInvited.id },
      { status: 409 }
    );
  }

  // A new invitation starts from the published TEMPLATE (frame, image, copy)
  // and adds the guests' names as titleA/titleB — so every invitation is the
  // template personalised with who it goes to.
  const template = await prisma.invitationTemplate.findFirst({
    where: { weddingId: auth.session.weddingId },
    orderBy: { version: "desc" },
    select: { content: true },
  });
  const raw = (template?.content ?? {}) as Record<string, unknown>;
  const pick = (key: string): string =>
    typeof raw[key] === "string" ? (raw[key] as string) : "";
  const baseContent: Record<string, string | null> = {
    // Do NOT set titleA/titleB — they come from the Wedding row (couple names)
    // and the per-invitation editor. Setting them to guest names here would
    // replace the groom/bride on the public invitation page.
    message: pick("message") || null,
    date: pick("date") || null,
    time: pick("time") || null,
    venue: pick("venue") || null,
    dressCode: pick("dressCode") || null,
    schedule: pick("schedule") || null,
    directions: pick("directions") || null,
    accommodation: pick("accommodation") || null,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
  };

  const invitation = await prisma.$transaction(async (tx) => {
    const created = await tx.invitation.create({
      data: {
        weddingId: auth.session.weddingId,
        title: parsed.data.title.trim(),
        acceptedPhones: buildAcceptedPhones(guests),
        guests: { connect: guests.map((g) => ({ id: g.id })) },
        content: baseContent,
      },
      include: { guests: { select: { id: true, fullName: true, phone: true } } },
    });
    return created;
  });

  return NextResponse.json({ invitation }, { status: 201 });
}