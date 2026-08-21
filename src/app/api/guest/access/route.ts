import { NextResponse } from "next/server";
import { z } from "zod";
import { findInvitationByToken } from "@/lib/otp-flow-db";
import { createInvitationAccess } from "@/lib/otp-session";
import { guestOtpBypassEnabled } from "@/lib/guest-access";

const schema = z.object({
  token: z.string().min(1),
  slug: z.string().min(1),
});

/**
 * GET /api/guest/access?token=...&slug=...
 *
 * Public route handler used ONLY when REQUIRE_GUEST_OTP=false. Sets the
 * invitation-access cookie and redirects to the invitation page. This is the
 * correct Next.js pattern for setting cookies — unlike calling
 * cookies().set() inside a server component during render.
 */
export async function GET(req: Request) {
  if (!guestOtpBypassEnabled()) {
    return NextResponse.json({ error: "otp is required" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = schema.safeParse({
    token: searchParams.get("token"),
    slug: searchParams.get("slug"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }

  const { token, slug } = parsed.data;
  const invitation = await findInvitationByToken(token);
  if (!invitation) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await createInvitationAccess({
    invitationId: invitation.id,
    weddingId: invitation.weddingId,
    phone: (invitation.acceptedPhones ?? [])[0] ?? "otp-disabled",
  });

  return NextResponse.redirect(
    new URL(`/w/${slug}/invitation?g=${encodeURIComponent(token)}`, req.url),
    302
  );
}