import { describe, expect, it } from "vitest";
import { tenantWhere } from "../../src/lib/auth-guard";
import { guestSchema, isValidPhotoUrl, mergeCustomTags, splitList } from "../../src/lib/guests";

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

  it("accepts a valid photoUrl", () => {
    const r = guestSchema.safeParse({
      fullName: "María García",
      phone: "+3465551234",
      photoUrl: "/api/photos/abc123/file",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a garbage photoUrl", () => {
    const r = guestSchema.safeParse({
      fullName: "María García",
      phone: "+3465551234",
      photoUrl: "not a url",
    });
    expect(r.success).toBe(false);
  });

  it("accepts photoUrl null (photo removed)", () => {
    const r = guestSchema.safeParse({
      fullName: "María García",
      phone: "+3465551234",
      photoUrl: null,
    });
    expect(r.success).toBe(true);
  });
});

describe("isValidPhotoUrl", () => {
  it("accepts app-relative photo URLs served by /api/photos", () => {
    expect(isValidPhotoUrl("/api/photos/abc123/file")).toBe(true);
    expect(
      isValidPhotoUrl("/api/photos/3f9b2c1a-8e2d-4f6a-b7a1-0c9d8e7f6a5b/file")
    ).toBe(true);
  });

  it("accepts absolute http(s) URLs", () => {
    expect(isValidPhotoUrl("https://cdn.example.com/photos/guest-1.jpg")).toBe(
      true
    );
    expect(isValidPhotoUrl("http://localhost:3000/api/photos/abc/file")).toBe(
      true
    );
  });

  it("rejects empty, whitespace and non-string input", () => {
    expect(isValidPhotoUrl("")).toBe(false);
    expect(isValidPhotoUrl("   ")).toBe(false);
    expect(isValidPhotoUrl(null)).toBe(false);
    expect(isValidPhotoUrl(undefined)).toBe(false);
  });

  it("rejects garbage, relative paths and protocol tricks", () => {
    expect(isValidPhotoUrl("not a url")).toBe(false);
    expect(isValidPhotoUrl("/etc/passwd")).toBe(false);
    expect(isValidPhotoUrl("/api/photos/abc")).toBe(false);
    expect(isValidPhotoUrl("/api/photos/abc/file/extra")).toBe(false);
    expect(isValidPhotoUrl("javascript:alert(1)")).toBe(false);
    expect(isValidPhotoUrl("ftp://files.example.com/x.jpg")).toBe(false);
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

describe("mergeCustomTags (checkbox tags + free-text other)", () => {
  it("merges selected + custom, trimmed, non-empty", () => {
    expect(
      mergeCustomTags(["Frutos secos", " Gluten "], "  Sésamo ")
    ).toEqual(["Frutos secos", "Gluten", "Sésamo"]);
  });

  it("dedupes case-insensitively (selected vs custom)", () => {
    expect(mergeCustomTags(["Pop"], " pop ")).toEqual(["Pop"]);
    expect(mergeCustomTags(["Pop", "Pop"], null)).toEqual(["Pop"]);
  });

  it("drops empty/whitespace custom and returns [] when nothing selected", () => {
    expect(mergeCustomTags([], "   ")).toEqual([]);
    expect(mergeCustomTags([], null)).toEqual([]);
    expect(mergeCustomTags([], undefined)).toEqual([]);
  });

  it("order: selected tags first, then custom", () => {
    expect(mergeCustomTags(["Rock", "Pop"], "Jazz")).toEqual([
      "Rock",
      "Pop",
      "Jazz",
    ]);
  });
});
