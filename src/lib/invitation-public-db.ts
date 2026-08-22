/**
 * Prisma-wired loader for the public invitation view (Task 10). Kept separate
 * from src/lib/invitation-public.ts (which is pure and unit-tested) so tests
 * never import a database connection. This module resolves an invitation id to
 * the full InvitationView the public page and the RSVP API both render.
 */
import { prisma } from "@/lib/db";
import { findInvitationByToken } from "@/lib/otp-flow-db";
import {
  buildInvitationView,
  type InvitationView,
  type InviteeGuest,
} from "./invitation-public";

/** The exact Guest fields the public view needs (duck-typed to InviteeGuest). */
const GUEST_SELECT = {
  id: true,
  fullName: true,
  alias: true,
  isChild: true,
  phone: true,
  allergies: true,
  musicPrefs: true,
  paperInvitation: true,
  plusOneAllowed: true,
  plusOneName: true,
  rsvpStatus: true,
  tableId: true,
  notes: true,
} as const;

/**
 * Load the public invitation view for an invitation id. Returns null when the
 * invitation (or its wedding) cannot be resolved. Invites for the invitation
 * are the Guest rows whose phone is in Invitation.acceptedPhones for that
 * wedding — a family/couple invitation covers all matching guests, and they
 * RSVP together (no Guest<->Invitation FK, so phone matching is the link).
 */
export async function loadPublicInvitationView(
  invitationId: string
): Promise<InvitationView | null> {
  const invitation = await findInvitationByToken(invitationId);
  if (!invitation) return null;

  const [wedding, template, guests] = await Promise.all([
    prisma.wedding.findUnique({
      where: { id: invitation.weddingId },
      select: { coupleNameA: true, coupleNameB: true, bankAccount: true, venue: true },
    }),
    prisma.invitationTemplate.findFirst({
      where: { weddingId: invitation.weddingId },
      orderBy: { version: "desc" },
      select: { content: true },
    }),
    prisma.guest.findMany({
      where: {
        weddingId: invitation.weddingId,
        phone: { in: invitation.acceptedPhones },
      },
      select: GUEST_SELECT,
    }),
  ]);

  if (!wedding) return null;

  return buildInvitationView({
    wedding,
    template: template?.content,
    invitation,
    inline: invitation.content,
    guests: guests as unknown as InviteeGuest[],
  });
}
