import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { invitationContentSchema } from "@/lib/invitation-inline";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Invitation detail (couple panel).
 *
 *   GET    /api/invitations/[id]  → one invitation with guests + content
 *   PATCH  /api/invitations/[id]  → update the per-invitation content
 *                                    (frame / image / text overrides)
 *   DELETE /api/invitations/[id]  → remove it (guests' links cleared)
 */
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const invitation = await prisma.invitation.findFirst({
    where: { id, weddingId: auth.session.weddingId },
    include: {
      guests: { select: { id: true, fullName: true, phone: true } },
    },
  });
  if (!invitation) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ invitation });
}

/**
 * PATCH /api/invitations/[id] — update the per-invitation content (partial).
 * Only the fields the client sends are merged into the existing content.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const owned = await prisma.invitation.findFirst({
    where: { id, weddingId: auth.session.weddingId },
  });
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = invitationContentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  // Merge over the existing content (keeps fields the client didn't send).
  const current =
    owned.content && typeof owned.content === "object"
      ? (owned.content as Record<string, unknown>)
      : {};
  const content = { ...current, ...parsed.data };

  const invitation = await prisma.invitation.update({
    where: { id },
    data: { content },
    include: {
      guests: { select: { id: true, fullName: true, phone: true } },
    },
  });
  return NextResponse.json({ invitation });
}

/**
 * DELETE /api/invitations/[id] — remove a personalised invitation. The guests'
 * invitationId links are cleared (set null) so guests stay on the panel and can
 * be regrouped later; only the invitation record + its OTP codes die.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  const owned = await prisma.invitation.findFirst({
    where: { id, weddingId: auth.session.weddingId },
  });
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.guest.updateMany({
      where: { invitationId: id, weddingId: auth.session.weddingId },
      data: { invitationId: null },
    }),
    prisma.otpCode.deleteMany({ where: { invitationId: id } }),
    prisma.invitation.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}