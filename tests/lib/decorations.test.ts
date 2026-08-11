import { describe, expect, it } from "vitest";
import {
  DECORATION_KINDS,
  defaultCenterpieceFor,
  defaultKindPosition,
  isDecorationKind,
  normalizeDecoration,
  type DecorationKind,
} from "../../src/lib/decorations";

describe("DECORATION_KINDS", () => {
  it("has the five decoration kinds with Spanish labels and emoji", () => {
    expect(Object.keys(DECORATION_KINDS).sort()).toEqual([
      "centerpiece",
      "danceFloor",
      "giftTable",
      "other",
      "photoWall",
    ]);
    expect(DECORATION_KINDS.centerpiece.label).toBe("Centro de mesa");
    expect(DECORATION_KINDS.giftTable.label).toBe("Mesa de regalos");
    expect(DECORATION_KINDS.photoWall.label).toBe("Photocall");
    expect(DECORATION_KINDS.danceFloor.label).toBe("Pista de baile");
    expect(DECORATION_KINDS.other.label).toBe("Otro");
    for (const meta of Object.values(DECORATION_KINDS)) {
      expect(meta.emoji.length).toBeGreaterThan(0);
    }
  });
});

describe("isDecorationKind", () => {
  it("accepts known kinds and rejects unknown strings", () => {
    expect(isDecorationKind("centerpiece")).toBe(true);
    expect(isDecorationKind("giftTable")).toBe(true);
    expect(isDecorationKind("bogus")).toBe(false);
    expect(isDecorationKind("")).toBe(false);
  });
});

describe("normalizeDecoration", () => {
  it("clamps negative positions to zero", () => {
    const d = normalizeDecoration({
      kind: "giftTable",
      positionX: -5,
      positionY: -40,
    });
    expect(d.positionX).toBe(0);
    expect(d.positionY).toBe(0);
  });

  it("keeps valid positive positions unchanged", () => {
    const d = normalizeDecoration({
      kind: "giftTable",
      positionX: 50,
      positionY: 33.5,
    });
    expect(d.positionX).toBe(50);
    expect(d.positionY).toBe(33.5);
  });

  it("defaults an unknown kind to 'other'", () => {
    const d = normalizeDecoration({ kind: "nope" });
    expect(d.kind).toBe("other");
  });

  it("defaults kind to 'other' when missing", () => {
    const d = normalizeDecoration({});
    expect(d.kind).toBe("other");
  });

  it("defaults the label to the kind's label when blank", () => {
    const d = normalizeDecoration({ kind: "danceFloor", label: null });
    expect(d.label).toBe(DECORATION_KINDS.danceFloor.label);
    const empty = normalizeDecoration({ kind: "danceFloor", label: "   " });
    expect(empty.label).toBe(DECORATION_KINDS.danceFloor.label);
  });

  it("keeps a provided label and trims it", () => {
    const d = normalizeDecoration({ kind: "photoWall", label: "  junto a la pista  " });
    expect(d.label).toBe("junto a la pista");
  });

  it("returns typed kind among the known union", () => {
    const d = normalizeDecoration({ kind: "giftTable" });
    expect(d.kind).toBe<DecorationKind>("giftTable");
  });
});

describe("defaultKindPosition", () => {
  it("returns positions that fit inside the canvas with a margin", () => {
    for (let i = 0; i < 10; i++) {
      const { positionX, positionY } = defaultKindPosition(100, 100, i);
      expect(positionX).toBeGreaterThanOrEqual(10);
      expect(positionX).toBeLessThanOrEqual(90);
      expect(positionY).toBeGreaterThanOrEqual(10);
      expect(positionY).toBeLessThanOrEqual(90);
    }
  });

  it("spreads new items so different indices land at different spots", () => {
    const a = defaultKindPosition(100, 100, 0);
    const b = defaultKindPosition(100, 100, 1);
    expect(a).not.toEqual(b);
  });

  it("scales the horizontal spread with the canvas width", () => {
    const wide = defaultKindPosition(200, 100, 2);
    const narrow = defaultKindPosition(100, 100, 2);
    expect(wide.positionX).toBeGreaterThan(narrow.positionX);
    // A wider canvas pushes the same column further right.
    expect(wide.positionX - narrow.positionX).toBeGreaterThan(0);
    // Same margin band top/bottom -> identical Y.
    expect(wide.positionY).toBe(narrow.positionY);
  });

  it("keeps spread positions inside a larger canvas too", () => {
    const p = defaultKindPosition(500, 300, 8);
    expect(p.positionX).toBeGreaterThanOrEqual(10);
    expect(p.positionX).toBeLessThanOrEqual(490);
    expect(p.positionY).toBeGreaterThanOrEqual(10);
    expect(p.positionY).toBeLessThanOrEqual(290);
  });
});
describe("defaultCenterpieceFor", () => {
  it("creates a centerpiece at the table's center with the kind's default label", () => {
    const cp = defaultCenterpieceFor({ positionX: 42, positionY: 37 });
    expect(cp.kind).toBe("centerpiece");
    expect(cp.label).toBe(DECORATION_KINDS.centerpiece.label);
    expect(cp.positionX).toBe(42);
    expect(cp.positionY).toBe(37);
  });

  it("keeps the table's position even when shape/capacity are provided", () => {
    const cp = defaultCenterpieceFor({
      positionX: 10.5,
      positionY: 20.25,
      shape: "rectangle",
      capacity: 12,
    });
    expect(cp.positionX).toBe(10.5);
    expect(cp.positionY).toBe(20.25);
  });
});
