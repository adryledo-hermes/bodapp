/**
 * Pure, typed helpers for the seating planner. No React/Next imports here so
 * this module is unit-testable and free of server/client concerns.
 */

export type TableShape = "round" | "rectangle";

/** A single guest-to-guest relation reference (as returned by a Prisma include). */
export interface RelationRef {
  relationType: string;
  guestAId: string;
  guestBId: string;
}

/** A guest as the seating canvas needs it: id + name + optional conflict edges. */
export interface SeatingGuest {
  id: string;
  fullName: string;
  alias: string | null;
  relations?: RelationRef[];
}

/** Minimal table shape (name + geometry + the guests assigned to it). */
export interface SeatTable {
  id: string;
  name: string;
  shape?: string | null;
  capacity: number;
  positionX: number;
  positionY: number;
  guests: SeatingGuest[];
}

/** Flat guestId -> tableId (or null when unassigned) assignment map. */
export type TableAssignment = Record<string, string | null>;

const KNOWN_SHAPES: Record<string, TableShape> = {
  round: "round",
  circle: "round",
  circular: "round",
  rectangle: "rectangle",
  rect: "rectangle",
  rectangular: "rectangle",
  square: "rectangle",
};

/** Normalize any shape string to "round" | "rectangle" (defaults to round). */
export function parseTableShape(shape: string | null | undefined): TableShape {
  if (!shape) return "round";
  return KNOWN_SHAPES[shape.trim().toLowerCase()] ?? "round";
}

/**
 * Pure reducer over an assignment map: returns a new map with guestId mapped to
 * tableId (or null to clear). Input state is never mutated.
 */
export function tableAssignment(
  state: TableAssignment,
  guestId: string,
  tableId: string | null
): TableAssignment {
  return { ...state, [guestId]: tableId };
}

/** How a table is doing capacity-wise given its current seat count. */
export interface CapacityStatus {
  ok: boolean;
  over: number;
}

export function capacityStatus(
  table: { capacity: number },
  seatCount: number
): CapacityStatus {
  const over = Math.max(0, seatCount - table.capacity);
  return { ok: seatCount <= table.capacity, over };
}

/**
 * All "doesn't get along" pairs among the given guests. Each guest may carry
 * `relations` (its from/to GuestRelation edges). Symmetric duplicates (a-b and
 * b-a) are collapsed into a single pair.
 */
export function findConflicts(
  guests: SeatingGuest[]
): Array<{ a: string; b: string }> {
  const seen = new Set<string>();
  const conflicts: Array<{ a: string; b: string }> = [];
  for (const guest of guests) {
    for (const relation of guest.relations ?? []) {
      if (relation.relationType !== "doesnt_get_along") continue;
      const other =
        relation.guestAId === guest.id ? relation.guestBId : relation.guestAId;
      const key = [guest.id, other].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push({ a: guest.id, b: other });
    }
  }
  return conflicts;
}

/** A per-table list of conflict pairs that actually sit at that table. */
export interface TableConflicts {
  tableId: string;
  conflicts: Array<{ a: string; b: string }>;
}

/**
 * For each table, which conflict pairs are seated together at it. Only tables
 * that have at least one seated conflict pair are returned.
 */
export function seatingConflictsByTable(
  tables: Array<Pick<SeatTable, "id" | "guests">>
): TableConflicts[] {
  const result: TableConflicts[] = [];
  for (const table of tables) {
    if (table.guests.length < 2) continue;
    const ids = new Set(table.guests.map((g) => g.id));
    // findConflicts already dedupes symmetric pairs; only keep pairs where both
    // sides are actually seated at this table.
    const conflicts = findConflicts(table.guests).filter(
      (p) => ids.has(p.a) && ids.has(p.b)
    );
    if (conflicts.length > 0) {
      result.push({ tableId: table.id, conflicts });
    }
  }
  return result;
}