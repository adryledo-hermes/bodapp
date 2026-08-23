import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findInvitationByToken } from "@/lib/otp-flow-db";
import { getInvitationAccess } from "@/lib/otp-session";
import { normalizeRsvpBody, type NormalizedRsvp } from "@/lib/rsvp";
import { loadPublicInvitationView } from "@/lib/invitation-public-db";

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

  // Build a map of raw guest body entries keyed by id so we can check which
  // fields the client explicitly sent (NormalizedRsvp has all fields always).
  const rawBody = (body as Record<string, unknown>)?.guests as Array<Record<string, unknown>> | undefined;
  const rawByGuestId = new Map<string, Record<string, unknown>>();
  if (Array.isArray(rawBody)) {
    for (const entry of rawBody) {
      if (typeof entry.id === "string") {
        rawByGuestId.set(entry.id, entry);
      }
    }
  }

  const invitation = await findInvitationByToken(access.invitationId);
  if (!invitation || invitation.weddingId !== access.weddingId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const validIds = new Set(
    (await prisma.guest.findMany({
      where: { invitationId: invitation.id },
      select: { id: true },
    })).map((g) => g.id)
  );

  const updates = rsvp.guests
    .filter((g) => validIds.has(g.id))
    .map((g) => {
      const data: Record<string, unknown> = {
        rsvpStatus: g.rsvpStatus,
        allergies: g.allergies,
        musicPrefs: g.musicPrefs,
      };
      // Only write plusOneName when the client explicitly sent it — otherwise
      // preserve the stored value. The normalized type always has it, so we
      // must check the raw body.
      const raw = rawByGuestId.get(g.id);
      if (raw && "plusOneName" in raw) {
        data.plusOneName = g.plusOneName ?? null;
      }
      return prisma.guest.update({
        where: { id: g.id },
        data,
      });
    });

  await prisma.$transaction(updates);

  const view = await loadPublicInvitationView(invitation.id);
  if (!view) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, view });
}