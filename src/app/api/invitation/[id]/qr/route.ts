import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { errText, logFailure } from "@/lib/failure-log";
import { buildInvitationUrl, encodeQr } from "@/lib/qr";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/invitation/[id]/qr
 * Panel-authorized: returns the PNG QR code for an invitation's OTP entry link.
 * Scoped to the session's wedding — 404 if the invitation isn't found or
 * belongs to another tenant.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;

  let invitation: { id: string; wedding: { slug: string } } | null;
  try {
    invitation = await prisma.invitation.findFirst({
      where: { id, weddingId: auth.session.weddingId },
      select: { id: true, wedding: { select: { slug: true } } },
    });
  } catch (err) {
    // Fail as a JSON 500 instead of an HTML error page (consistent with
    // sibling route handlers) — and say WHY in the server log.
    logFailure("qr", "db_failed", `invitation lookup failed: ${errText(err)}`);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  if (!invitation) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let png: Buffer;
  try {
    const url = buildInvitationUrl({
      slug: invitation.wedding.slug,
      invitationId: invitation.id,
    });
    png = await encodeQr(url);
  } catch (err) {
    logFailure(
      "qr",
      "encode_failed",
      `QR encode failed for invitation ${invitation.id}: ${errText(err)}`
    );
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.length),
      "Content-Disposition": `inline; filename="invitacion-qr-${invitation.id}.png"`,
      "Cache-Control": "no-store",
    },
  });
}
