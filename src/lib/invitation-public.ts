/**
 * Pure helpers that build the serializable public invitation view (Task 10).
 * No React/Next/Prisma imports here so this module is unit-testable. It turns
 * the wedding + template + the invitee Guest rows into the exact shape the
 * public page renders, while redacting any data a guest must not see.
 */
import {
  normalizeTemplateContent,
  type TemplateContent,
} from "./invitation";
import { normalizeInvitationContent } from "./invitation-inline";
import { isRsvpStatus, type RsvpStatus } from "./rsvp";

/**
 * The subset of a Guest row the public page may need as input. Kept as plain
 * fields (duck-typed against the Prisma query result) so the module has no
 * generated-client dependency in tests.
 */
export interface InviteeGuest {
  id: string;
  fullName: string;
  alias: string | null;
  phone: string | null;
  isChild: boolean;
  allergies: string[];
  musicPrefs: string[];
  paperInvitation: boolean;
  plusOneAllowed: boolean;
  plusOneName: string | null;
  rsvpStatus: string;
  tableId: string | null;
  notes: string | null;
}

/** The redacted guest plate — only what the invitee themselves may see. */
export interface PublicGuest {
  id: string;
  fullName: string;
  alias: string | null;
  isChild: boolean;
  allergies: string[];
  musicPrefs: string[];
  plusOneAllowed: boolean;
  plusOneName: string | null;
  rsvpStatus: RsvpStatus;
}

const SAFE_KEYS: (keyof PublicGuest)[] = [
  "id",
  "fullName",
  "alias",
  "isChild",
  "allergies",
  "musicPrefs",
  "plusOneAllowed",
  "plusOneName",
  "rsvpStatus",
];

/**
 * Redact a guest row for the public renderer: drop phone, table, notes and all
 * internal/panel-only fields, and coerce the stored status to a known RSVP
 * status (unknown stored values fall back to "pending"). Never leaks a field a
 * guest shouldn't see — only the whitelisted keys are copied.
 * Children always have plusOneAllowed=false (cannot bring a plus one).
 */
export function publicPlateOf(g: InviteeGuest): PublicGuest {
  const plate: PublicGuest = {
    id: g.id,
    fullName: g.fullName,
    alias: g.alias,
    isChild: g.isChild ?? false,
    allergies: Array.isArray(g.allergies) ? g.allergies : [],
    musicPrefs: Array.isArray(g.musicPrefs) ? g.musicPrefs : [],
    plusOneAllowed: g.isChild ? false : g.plusOneAllowed,
    plusOneName: g.isChild ? null : g.plusOneName,
    rsvpStatus: isRsvpStatus(g.rsvpStatus) ? g.rsvpStatus : "pending",
  };
  // Safety net: never let an unexpected key slip through.
  for (const key of Object.keys(plate) as (keyof PublicGuest)[]) {
    if (!SAFE_KEYS.includes(key)) delete plate[key];
  }
  return plate;
}

/** The couple's public identity. */
export interface PublicWedding {
  coupleNameA: string;
  coupleNameB: string;
}

/** The serializable object the public invitation page renders. */
export interface InvitationView {
  token: string;
  wedding: PublicWedding;
  content: TemplateContent;
  invitees: PublicGuest[];
  greeting: string;
  bankAccount: string | null;
  /** Per-invitation personalization image (design inherited from template). */
  inline: { imageUrl: string | null };
}

/** Build greeting — now returns empty (redundant with "For" label). */
function buildGreeting(_guests: PublicGuest[]): string {
  return "";
}

/**
 * Build the full public invitation view from the wedding, the (raw) template
 * content, the invitation and the invitee Guest rows. Pure, no Prisma.
 * - Normalizes the template content against DEFAULT_TEMPLATE.
 * - Applies publicPlateOf to each invitee so the page never sees secrets.
 * - Surfaces the couple's bank account for the "Transferencia" section.
 */
export function buildInvitationView(params: {
  wedding: { coupleNameA: string; coupleNameB: string; bankAccount: string | null; venue: string | null };
  template: unknown;
  invitation: { id: string };
  inline?: unknown;
  guests: InviteeGuest[];
}): InvitationView {
  const base = normalizeTemplateContent(params.template);
  const inline = normalizeInvitationContent(params.inline);
  const titleA = inline.titleA || params.wedding.coupleNameA;
  const titleB = inline.titleB || params.wedding.coupleNameB;
  const venue = params.wedding.venue || "";
  const content = {
    ...base,
    titleA,
    titleB,
    message: inline.message || base.message,
    date: inline.date || base.date,
    time: inline.time || base.time,
    venue,
    dressCode: inline.dressCode || base.dressCode,
    schedule: inline.schedule || base.schedule,
    directions: inline.directions || base.directions,
    accommodation: inline.accommodation || base.accommodation,
  };
  const invitees = params.guests.map(publicPlateOf);
  return {
    token: params.invitation.id,
    wedding: {
      coupleNameA: params.wedding.coupleNameA,
      coupleNameB: params.wedding.coupleNameB,
    },
    content,
    invitees,
    greeting: buildGreeting(invitees),
    bankAccount: params.wedding.bankAccount ?? null,
    inline: {
      imageUrl: params.inline ? inline.imageUrl : base.imageUrl,
    }
  };
}