import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";

type Ctx = { params: Promise<{ id: string }> };

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