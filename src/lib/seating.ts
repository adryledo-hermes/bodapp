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
  seatNumber?: number | null; // concrete seat at their table (seating map)
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
  /** Decorations attached to this table (auto-created centerpiece, etc.). */
  decorations?: Array<{ id: string; kind: string; label?: string | null }>;
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

/**
 * Per-table seat numbers currently used by more than one guest. A seat number
 * is only "duplicate" within a single table — the same seat number on two
 * different tables is perfectly fine. Tables with no collisions are omitted.
 */
export interface DuplicateSeats {
  tableId: string;
  seats: number[];
}

export function duplicateSeats(
  tables: Array<Pick<SeatTable, "id" | "guests">>
): DuplicateSeats[] {
  const result: DuplicateSeats[] = [];
  for (const table of tables) {
    const counts = new Map<number, number>();
    for (const g of table.guests) {
      const seat = g.seatNumber;
      if (typeof seat !== "number" || seat < 1) continue;
      counts.set(seat, (counts.get(seat) ?? 0) + 1);
    }
    const seats = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([seat]) => seat)
      .sort((a, b) => a - b);
    if (seats.length > 0) result.push({ tableId: table.id, seats });
  }
  return result;
}

/** One chair's position relative to its table (percent offsets from center). */
export interface ChairPosition {
  seatNumber: number; // 1..capacity
  offsetX: number; // percent of the table width, +right
  offsetY: number; // percent of the table height, +down
}

/** Pixel size of a table node on the canvas, derived from shape + capacity. */
export interface TableNodeSize {
  width: number;
  height: number;
}

/**
 * The visual size of a table scales with its capacity so bigger tables
 * actually LOOK bigger (and hold more chairs). Round tables grow in both
 * dimensions; rectangle tables grow in width and slightly in height.
 */
export function tableNodeSize(table: {
  shape?: string | null;
  capacity: number;
}): TableNodeSize {
  const cap = Math.max(1, table.capacity);
  const shape = parseTableShape(table.shape);
  if (shape === "round") {
    const size = Math.min(64, 40 + cap * 3);
    return { width: size, height: size };
  }
  // Rectangle: width grows with capacity, height stays modest.
  return {
    width: Math.min(192, 88 + cap * 4),
    height: Math.max(46, Math.min(72, 34 + cap * 2)),
  };
}

/**
 * Compute the chair layout for a table's capacity as per-seat offsets from the
 * table center. Chairs always appear OUTSIDE the table edge:
 *  - round: evenly spaced around the circumference
 *  - rectangle: two facing rows (left/right sides)
 * Values are in percent so the canvas can scale them with the table size.
 * Pure + deterministic → unit-testable.
 */
export function chairPositions(table: Pick<SeatTable, "shape" | "capacity">): ChairPosition[] {
  const capacity = Math.max(1, table.capacity);
  const shape = parseTableShape(table.shape);
  const result: ChairPosition[] = [];

  if (shape === "round") {
    // Evenly spaced around the circle, starting at the top.
    for (let i = 0; i < capacity; i++) {
      const angle = (i / capacity) * Math.PI * 2 - Math.PI / 2;
      result.push({
        seatNumber: i + 1,
        offsetX: Math.cos(angle) * 70,
        offsetY: Math.sin(angle) * 70,
      });
    }
  } else {
    // Two facing rows: left column seats 1..ceil(n/2), right column the rest.
    const leftCount = Math.ceil(capacity / 2);
    const rightCount = capacity - leftCount;
    const rowStepX = capacity > 6 ? 42 : 55; // tighter on long tables
    const startY = -((leftCount - 1) / 2) * 60;

    let seat = 1;
    for (let i = 0; i < leftCount; i++) {
      result.push({
        seatNumber: seat++,
        offsetX: -rowStepX,
        offsetY: startY + i * 60,
      });
    }
    for (let i = 0; i < rightCount; i++) {
      result.push({
        seatNumber: seat++,
        offsetX: rowStepX,
        offsetY: startY + i * 60,
      });
    }
  }
  return result;
}