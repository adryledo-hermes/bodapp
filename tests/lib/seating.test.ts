import { describe, expect, it } from "vitest";
import {
  chairPositions,
  parseTableShape,
  tableAssignment,
  capacityStatus,
  findConflicts,
  seatingConflictsByTable,
  duplicateSeats,
  tableNodeSize,
  type RelationRef,
  type SeatingGuest,
} from "../../src/lib/seating";

function rel(
  relationType: string,
  guestAId: string,
  guestBId: string
): RelationRef {
  return { relationType, guestAId, guestBId };
}

function guest(
  id: string,
  relations: RelationRef[] = []
): SeatingGuest {
  return { id, fullName: id, alias: null, relations };
}

describe("parseTableShape", () => {
  it("rounds the normal cases", () => {
    expect(parseTableShape("round")).toBe("round");
    expect(parseTableShape("ROUND")).toBe("round");
    expect(parseTableShape("circle")).toBe("round");
    expect(parseTableShape("CirCulo")).toBe("round");
  });

  it("maps rectangle variants", () => {
    expect(parseTableShape("rectangle")).toBe("rectangle");
    expect(parseTableShape("RECTANGLE")).toBe("rectangle");
    expect(parseTableShape("rect")).toBe("rectangle");
    expect(parseTableShape("rectangular")).toBe("rectangle");
  });

  it("defaults unknown shapes to round", () => {
    expect(parseTableShape("octagon")).toBe("round");
    expect(parseTableShape("")).toBe("round");
  });
});

describe("capacityStatus", () => {
  it("returns ok when at or under capacity", () => {
    expect(capacityStatus({ capacity: 8 }, 8)).toEqual({ ok: true, over: 0 });
    expect(capacityStatus({ capacity: 8 }, 5)).toEqual({ ok: true, over: 0 });
  });

  it("flags over-capacity with the exact excess", () => {
    expect(capacityStatus({ capacity: 8 }, 9)).toEqual({
      ok: false,
      over: 1,
    });
    expect(capacityStatus({ capacity: 8 }, 13)).toEqual({
      ok: false,
      over: 5,
    });
  });

  it("treats zero capacity as instantly full", () => {
    expect(capacityStatus({ capacity: 0 }, 0)).toEqual({ ok: true, over: 0 });
    expect(capacityStatus({ capacity: 0 }, 1)).toEqual({
      ok: false,
      over: 1,
    });
  });
});

describe("tableAssignment", () => {
  it("assigns a guest to a table", () => {
    expect(tableAssignment({}, "g1", "t1")).toEqual({ g1: "t1" });
  });

  it("moves a guest between tables", () => {
    expect(tableAssignment({ g1: "t1" }, "g1", "t2")).toEqual({ g1: "t2" });
  });

  it("clears a guest's assignment with null", () => {
    expect(tableAssignment({ g1: "t1" }, "g1", null)).toEqual({ g1: null });
  });

  it("keeps other assignments and is immutable", () => {
    const state = { g1: "t1", g2: "t2" };
    const next = tableAssignment(state, "g3", "t1");
    expect(next).toEqual({ g1: "t1", g2: "t2", g3: "t1" });
    expect(state).toEqual({ g1: "t1", g2: "t2" });
  });

  it("returns a new object reference", () => {
    const state = { g1: "t1" };
    const next = tableAssignment(state, "g1", "t1");
    expect(next).not.toBe(state);
    expect(next).toEqual(state);
  });
});

describe("findConflicts", () => {
  it("returns the pair for a doesnt_get_along relation", () => {
    const g1 = guest("g1", [rel("doesnt_get_along", "g1", "g2")]);
    const g2 = guest("g2", [rel("doesnt_get_along", "g1", "g2")]);
    expect(findConflicts([g1, g2])).toEqual([{ a: "g1", b: "g2" }]);
  });

  it("dedupes the symmetric pair to a single entry", () => {
    const g1 = guest("g1", [rel("doesnt_get_along", "g1", "g2")]);
    const g2 = guest("g2", [rel("doesnt_get_along", "g2", "g1")]);
    expect(findConflicts([g1, g2])).toEqual([{ a: "g1", b: "g2" }]);
  });

  it("ignores non-conflict relation types", () => {
    const g1 = guest("g1", [rel("partner", "g1", "g2")]);
    const g2 = guest("g2", [rel("sibling", "g1", "g2")]);
    expect(findConflicts([g1, g2])).toEqual([]);
  });

  it("reports a conflict even when the other side is not in the list", () => {
    const g1 = guest("g1", [rel("doesnt_get_along", "g1", "ghost")]);
    expect(findConflicts([g1])).toEqual([{ a: "g1", b: "ghost" }]);
  });

  it("returns empty for no relations", () => {
    expect(findConflicts([guest("g1"), guest("g2")])).toEqual([]);
  });
});

describe("seatingConflictsByTable", () => {
  it("flags a table where conflicting guests sit together", () => {
    const tables = [
      {
        id: "t1",
        guests: [
          guest("g1", [rel("doesnt_get_along", "g1", "g2")]),
          guest("g2", [rel("doesnt_get_along", "g1", "g2")]),
        ],
      },
    ];
    expect(seatingConflictsByTable(tables)).toEqual([
      { tableId: "t1", conflicts: [{ a: "g1", b: "g2" }] },
    ]);
  });

  it("does not flag a table when the conflict pair is split", () => {
    const tables = [
      { id: "t1", guests: [guest("g1", [rel("doesnt_get_along", "g1", "g2")])] },
      { id: "t2", guests: [guest("g2", [rel("doesnt_get_along", "g1", "g2")])] },
    ];
    expect(seatingConflictsByTable(tables)).toEqual([]);
  });

  it("omits tables without conflicts", () => {
    const tables = [
      { id: "t1", guests: [guest("g1"), guest("g2")] },
      { id: "t2", guests: [] },
    ];
    expect(seatingConflictsByTable(tables)).toEqual([]);
  });

  it("returns an empty array when no tables exist", () => {
    expect(seatingConflictsByTable([])).toEqual([]);
  });
});

describe("duplicateSeats", () => {
  // Build a table node with guests carrying explicit seatNumbers.
  const table = (
    id: string,
    seats: Array<[string, number | null | undefined]>
  ) => ({
    id,
    guests: seats.map(([guestId, seatNumber]) => ({
      id: guestId,
      fullName: guestId,
      alias: null,
      seatNumber,
    })),
  });

  it("returns [] when no seat numbers are duplicated within a table", () => {
    const tables = [table("t1", [["g1", 1], ["g2", 2], ["g3", 3]])];
    expect(duplicateSeats(tables)).toEqual([]);
  });

  it("flags a seat used by two guests at the same table", () => {
    const tables = [table("t1", [["g1", 3], ["g2", 3], ["g3", 1]])];
    expect(duplicateSeats(tables)).toEqual([{ tableId: "t1", seats: [3] }]);
  });

  it("flags multiple duplicate seats in a single table", () => {
    const tables = [table("t1", [["g1", 2], ["g2", 2], ["g3", 4], ["g4", 4]])];
    expect(duplicateSeats(tables)).toEqual([{ tableId: "t1", seats: [2, 4] }]);
  });

  it("does not flag the same seat number on different tables", () => {
    const tables = [
      table("t1", [["g1", 2], ["g2", 3]]),
      table("t2", [["g3", 2], ["g4", 3]]),
    ];
    expect(duplicateSeats(tables)).toEqual([]);
  });

  it("treats null/undefined seat numbers as unseated (not duplicated)", () => {
    const tables = [table("t1", [["g1", null], ["g2", undefined]])];
    expect(duplicateSeats(tables)).toEqual([]);
  });

  it("flags duplicates only on tables that have them, omitting clean tables", () => {
    const tables = [
      table("t1", [["g1", 3], ["g2", 3]]),
      table("t2", [["g3", 1], ["g4", 2]]),
    ];
    expect(duplicateSeats(tables)).toEqual([{ tableId: "t1", seats: [3] }]);
  });

  it("returns an empty array when no tables exist", () => {
    expect(duplicateSeats([])).toEqual([]);
  });
});
describe("chairPositions", () => {
  it("emits one chair per capacity seat, numbered 1..n", () => {
    const chairs = chairPositions({ shape: "round", capacity: 6 });
    expect(chairs).toHaveLength(6);
    expect(chairs.map((c) => c.seatNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("spaces round-table chairs evenly around the circle (offsets exist)", () => {
    const chairs = chairPositions({ shape: "round", capacity: 4 });
    const r = chairs.map((c) => Math.hypot(c.offsetX, c.offsetY));
    // All chairs sit at the same radius outside the table.
    for (const radius of r) expect(radius).toBeCloseTo(70, 5);
    // Distinct positions — no two chairs overlap.
    const keys = new Set(chairs.map((c) => `${c.offsetX},${c.offsetY}`));
    expect(keys.size).toBe(4);
  });

  it("lays rectangle tables out as two facing columns", () => {
    const chairs = chairPositions({ shape: "rectangle", capacity: 6 });
    const left = chairs.filter((c) => c.offsetX < 0);
    const right = chairs.filter((c) => c.offsetX > 0);
    expect(left).toHaveLength(3);
    expect(right).toHaveLength(3);
    // Left column seats are 1..3, right column 4..6 (fill order).
    expect(left.map((c) => c.seatNumber)).toEqual([1, 2, 3]);
    expect(right.map((c) => c.seatNumber)).toEqual([4, 5, 6]);
    // Columns are vertically interleaved, not stacked.
    const leftY = left.map((c) => c.offsetY).sort((a, b) => a - b);
    const rightY = right.map((c) => c.offsetY).sort((a, b) => a - b);
    for (let i = 0; i < leftY.length; i++) {
      expect(leftY[i]).toBeCloseTo(rightY[i], 5);
    }
  });

  it("clamps capacity to at least 1", () => {
    expect(chairPositions({ shape: "round", capacity: 0 })).toHaveLength(1);
    expect(chairPositions({ shape: "rectangle", capacity: -3 })).toHaveLength(1);
  });

  it("defaults an unknown shape to round", () => {
    const chairs = chairPositions({ shape: "hexagon", capacity: 8 });
    expect(chairs).toHaveLength(8);
    const r = chairs.map((c) => Math.hypot(c.offsetX, c.offsetY));
    for (const radius of r) expect(radius).toBeCloseTo(70, 5);
  });
});

describe("tableNodeSize", () => {
  it("round tables grow with capacity (square)", () => {
    const small = tableNodeSize({ shape: "round", capacity: 4 });
    const big = tableNodeSize({ shape: "round", capacity: 12 });
    expect(small.width).toBe(small.height);
    expect(big.width).toBe(big.height);
    expect(big.width).toBeGreaterThan(small.width);
  });

  it("rectangle tables grow in width, stay short in height", () => {
    const small = tableNodeSize({ shape: "rectangle", capacity: 4 });
    const big = tableNodeSize({ shape: "rectangle", capacity: 12 });
    expect(big.width).toBeGreaterThan(small.width);
    expect(big.height).toBeLessThanOrEqual(72);
    expect(big.height).toBeGreaterThanOrEqual(46);
  });

  it("clamps capacity to at least 1 and caps at the max", () => {
    const min = tableNodeSize({ shape: "round", capacity: 0 });
    expect(min.width).toBe(43); // 40 + 1*3
    const max = tableNodeSize({ shape: "rectangle", capacity: 50 });
    expect(max.width).toBe(192); // capped
  });

  it("defaults an unknown shape to round", () => {
    expect(tableNodeSize({ shape: "hexagon", capacity: 8 }).width).toBe(
      tableNodeSize({ shape: "round", capacity: 8 }).width
    );
  });
});
