/**
 * Pure helpers for the invitations manager. No React/Next imports here so this
 * module is unit-testable and free of server/client concerns.
 */

/** Minimal guest shape when grouping guests into an invitation. */
export interface InviteeGuest {
  id: string;
  fullName: string;
  phone: string;
}

/**
 * Build the acceptedPhones list for a personalised invitation from its guests:
 * every guest's phone, deduplicated and ordered by guest arrival. Only phones
 * present on this bridge get OTP access (multi-phone per invitation).
 */
export function buildAcceptedPhones(guests: InviteeGuest[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const g of guests) {
    const phone = g.phone?.trim();
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    result.push(phone);
  }
  return result;
}