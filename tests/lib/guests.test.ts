import { describe, expect, it } from "vitest";
import { tenantWhere } from "../../src/lib/auth-guard";
import { guestSchema, splitList } from "../../src/lib/guests";

describe("tenant scoping guard", () => {
  const session = { userId: "u1", weddingId: "w-A", role: "couple" };

  it("always injects the session weddingId", () => {
    const where = tenantWhere(session as never, { status: "pending" });
    expect(where).toEqual({ weddingId: "w-A", status: "pending" });
    // component parts
    expect(where.weddingId).toBe("w-A");
  });

  it("cannot be overridden by caller-supplied weddingId", () => {
    // tenantWhere puts session weddingId AFTER extra, so caller can't shadow it.
    const where = tenantWhere(session as never, { weddingId: "w-EVIL" });
    expect(where.weddingId).toBe("w-A");
  });
});

describe("guest validation", () => {
  it("accepts a valid guest", () => {
    const r = guestSchema.safeParse({
      fullName: "María García",
      phone: "+34600112233",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const r = guestSchema.safeParse({ phone: "+34600112233" });
    expect(r.success).toBe(false);
  });

  it("rejects a bad phone", () => {
    const r = guestSchema.safeParse({ fullName: "X", phone: "abc" });
    expect(r.success).toBe(false);
  });
});

describe("splitList (comma-separated form values)", () => {
  it("splits on commas and trims each entry", () => {
    expect(splitList("Frutos secos, marisco ,gluten")).toEqual([
      "Frutos secos",
      "marisco",
      "gluten",
    ]);
  });

  it("drops empty entries from blanks and stray commas", () => {
    expect(splitList("a,, b , ,c")).toEqual(["a", "b", "c"]);
  });

  it("returns [] for null / undefined / empty / whitespace-only input", () => {
    expect(splitList(null)).toEqual([]);
    expect(splitList(undefined)).toEqual([]);
    expect(splitList("")).toEqual([]);
    expect(splitList("   ")).toEqual([]);
  });
});
