import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findInvitationByToken } from "@/lib/otp-flow-db";
import { getInvitationAccess } from "@/lib/otp-session";
import { allowedRsvpTransitions, normalizeRsvpInput } from "@/lib/rsvp";
import { loadPublicInvitationView } from "@/lib/invitation-public-db";

// POST /api/rsvp — PUBLIC but gated by the short-lived `invitation_access`
// cookie (NOT the user panel session). The cookie's invitationId/weddingId are
// the ONLY source of authorization here: the request body never carries a
// token, so a guest can never update another invitation even by guessing URLs.
// All guests matching the invitation's acceptedPhones (for its own wedding)
// are updated together — a family/couple invitation RSVPs as one unit.
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

  await prisma.guest.updateMany({
    where: {
      weddingId: invitation.weddingId,
      phone: { in: invitation.acceptedPhones },
    },
    data: {
      rsvpStatus: rsvp.rsvpStatus,
      allergies: rsvp.allergies,
      musicPrefs: rsvp.musicPrefs,
    },
  });

  const view = await loadPublicInvitationView(invitation.id);
  return NextResponse.json({ ok: true, view });
}
