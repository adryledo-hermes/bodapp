import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findInvitationByToken } from "@/lib/otp-flow-db";
import { getInvitationAccess } from "@/lib/otp-session";
import { allowedRsvpTransitions, normalizeRsvpInput } from "@/lib/rsvp";
import { loadPublicInvitationView } from "@/lib/invitation-public-db";

// POST /api/rsvp — PUBLIC but gated by the short-lived `invitation_access`
// cookie (NOT the user panel session). The cookie's invitationId/weddingId/
// phone are the ONLY source of authorization here: the request body never
// carries a token, so a guest can never update another invitation even by
// guessing URLs. Only the Guest row(s) whose phone matches the authenticated
// phone are updated — a family/couple invitation does NOT clobber every
// member's allergies/music with the first invitee's values (FIX I-1).
export async function POST(req: Request) {
  const access = await getInvitationAccess();
  if (!access) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const rsvp = normalizeRsvpInput(body);

  // Guard: a guest can set any known status, but never anything malformed.
  if (!allowedRsvpTransitions(rsvp.rsvpStatus, rsvp.rsvpStatus)) {
    return NextResponse.json(
      { error: "invalid status" },
      { status: 400 }
    );
  }

  // Resolve the invitation from the cookie and confirm it belongs to the
  // wedding the cookie was issued for. Never trust a body value for scope.
  const invitation = await findInvitationByToken(access.invitationId);
  if (!invitation || invitation.weddingId !== access.weddingId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Update ONLY the authenticated phone's guest row(s). `access.phone` is the
  // normalized phone cookie was issued for — never a body value. This prevents
  // a family/couple invitation from overwriting every member's allergies/music
  // with the submitting guest's values (FIX I-1).
  await prisma.guest.updateMany({
    where: {
      weddingId: invitation.weddingId,
      phone: access.phone,
    },
    data: {
      rsvpStatus: rsvp.rsvpStatus,
      allergies: rsvp.allergies,
      musicPrefs: rsvp.musicPrefs,
    },
  });

  // Return the updated view so the client can re-render the saved status and
  // preferences without a full reload.
  const view = await loadPublicInvitationView(invitation.id);
  if (!view) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, view });
}
