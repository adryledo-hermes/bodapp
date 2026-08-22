/**
 * Pure helpers for the Pokémon-card guest view. No React/Next imports here so
 * this module is unit-testable and free of server/client concerns.
 */

export type RsvpStatus = "pending" | "confirmed" | "declined";

/** Minimal table shape surfaced on a guest card. */
export interface GuestTable {
  id: string;
  label: string;
}

/** The shape a guest card needs to render front + back faces. */
export interface GuestCardData {
  id: string;
  fullName: string;
  alias: string | null;
  isChild: boolean;
  relationshipContext: string | null;
  phone: string;
  allergies: string[];
  musicPrefs: string[];
  favoriteSong: string | null;
  paperInvitation: boolean;
  plusOneAllowed: boolean;
  plusOneName: string | null;
  rsvpStatus: string;
  notes: string | null;
  photoUrl: string | null;
  table?: GuestTable | null;
}

/** Payload the edit form submits (mirrors GuestInput, minus computed fields). */
export type GuestEditableFields = Omit<
  GuestCardData,
  "id" | "rsvpStatus" | "table"
>;

export interface GuestFilters {
  search?: string;
  rsvpStatus?: RsvpStatus | "";
  allergy?: string;
  tableId?: string;
}

/** Lowercase + strip diacritics so "maria" matches "María". */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesSearch(g: GuestCardData, term: string): boolean {
  const q = normalize(term);
  if (!q) return true;
  const name = normalize(g.fullName);
  const alias = normalize(g.alias ?? "");
  return name.includes(q) || alias.includes(q);
}

function matchesRsvp(g: GuestCardData, status: string): boolean {
  if (!status) return true;
  return g.rsvpStatus === status;
}

function matchesAllergy(g: GuestCardData, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return g.allergies.some((a) => a.toLowerCase().includes(q));
}

function matchesTable(g: GuestCardData, tableId: string): boolean {
  if (!tableId) return true;
  return g.table?.id === tableId;
}

/**
 * Filter guests by search (name/alias), exact RSVP status, allergy term, and
 * table id. Empty filter values act as "match all". Kept pure + typed.
 */
export function filterGuests(
  guests: GuestCardData[],
  filters: GuestFilters
): GuestCardData[] {
  const { search = "", rsvpStatus = "", allergy = "", tableId = "" } = filters;
  return guests.filter(
    (g) =>
      matchesSearch(g, search) &&
      matchesRsvp(g, rsvpStatus) &&
      matchesAllergy(g, allergy) &&
      matchesTable(g, tableId)
  );
}