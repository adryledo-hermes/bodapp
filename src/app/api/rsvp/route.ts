import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findInvitationByToken } from "@/lib/otp-flow-db";
import { getInvitationAccess } from "@/lib/otp-session";
import { normalizeRsvpBody } from "@/lib/rsvp";
import { loadPublicInvitationView } from "@/lib/invitation-public-db";

// POST /api/rsvp — PUBLIC but gated by the short-lived `invitation_access`
// cookie (NOT the user panel session).
//
// New body format (v2 — per-guest):
//   { guests: [{ id, rsvpStatus, allergies, musicPrefs }, ...] }
//
// Each entry updates its specific Guest row by id. The server validates that
// every guest id belongs to the authenticated invitation, so a guest can never
// modify another invitation's guests even by guessing IDs.
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

  const rsvp = normalizeRsvpBody(body);
  if (rsvp.guests.length === 0) {
    return NextResponse.json({ error: "no valid guests" }, { status: 400 });
  }

  // Resolve the invitation from the cookie and confirm it belongs to the
  // wedding the cookie was issued for.
  const invitation = await findInvitationByToken(access.invitationId);
  if (!invitation || invitation.weddingId !== access.weddingId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Fetch all guest IDs that belong to this invitation, so we can validate
  // the submitted IDs belong to this invitation.
  const validIds = new Set(
    (await prisma.guest.findMany({
      where: { invitationId: invitation.id },
      select: { id: true },
    })).map((g) => g.id)
  );

  // Update each guest row individually. Only update guests whose ID is valid.
  const updates = rsvp.guests
    .filter((g) => validIds.has(g.id))
    .map((g) =>
      prisma.guest.update({
        where: { id: g.id },
        data: {
          rsvpStatus: g.rsvpStatus,
          allergies: g.allergies,
          musicPrefs: g.musicPrefs,
        },
      })
    );

  await prisma.$transaction(updates);

  // Return the updated view so the client can re-render saved state.
  const view = await loadPublicInvitationView(invitation.id);
  if (!view) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, view });
}