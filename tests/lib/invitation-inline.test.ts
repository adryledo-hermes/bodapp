import { describe, expect, it } from "vitest";
import {
  normalizeInvitationContent,
  invitationContentSchema,
} from "../../src/lib/invitation-inline";

describe("normalizeInvitationContent", () => {
  it("returns empty design defaults", () => {
    const c = normalizeInvitationContent(null);
    expect(c.imageUrl).toBeNull();
    expect(c.titleA).toBe("");
    expect(c.schedule).toBe("");
  });

  it("normalizes text, event logistics and image", () => {
    const c = normalizeInvitationContent({
      imageUrl: "  /api/photos/abc/file  ",
      message: "Os esperamos",
      schedule: "16:00 · Ceremonia",
      directions: "M-30",
      accommodation: "Hotel cercano",
    });
    expect(c.imageUrl).toBe("/api/photos/abc/file");
    expect(c.message).toBe("Os esperamos");
    expect(c.schedule).toBe("16:00 · Ceremonia");
    expect(c.directions).toBe("M-30");
    expect(c.accommodation).toBe("Hotel cercano");
  });
});

describe("invitationContentSchema", () => {
  it("accepts the complete invitation content", () => {
    const r = invitationContentSchema.safeParse({
      imageUrl: "/api/photos/x/file",
      titleA: "Ana",
      titleB: "Luis",
      message: "Venid",
      date: "2026-09-12",
      time: "13:00",
      venue: "Finca",
      dressCode: "Elegante",
      schedule: "16:00 · Ceremonia",
      directions: "M-30",
      accommodation: "Hotel",
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-string content", () => {
    expect(invitationContentSchema.safeParse({ message: 42 }).success).toBe(false);
  });
});
