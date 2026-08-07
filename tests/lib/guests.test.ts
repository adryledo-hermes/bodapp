import { describe, expect, it } from "vitest";
import { tenantWhere } from "../../src/lib/auth-guard";
import { guestSchema } from "../../src/lib/guests";

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
