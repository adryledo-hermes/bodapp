import { describe, expect, it } from "vitest";
import {
  FRAME_OPTIONS,
  DEFAULT_FRAME,
  normalizeInvitationContent,
  invitationContentSchema,
} from "../../src/lib/invitation-inline";

describe("FRAME_OPTIONS", () => {
  it("exposes at least the planned frames with css classes", () => {
    const ids = FRAME_OPTIONS.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "flores",
        "lino",
        "dorado",
        "minima",
        "clasica",
        "boho",
      ])
    );
    for (const f of FRAME_OPTIONS) {
      expect(f.cssClass).toMatch(/^inv-frame-/);
      expect(f.label.length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeInvitationContent", () => {
  it("returns defaults for empty input", () => {
    const c = normalizeInvitationContent(null);
    expect(c.frame).toBe(DEFAULT_FRAME);
    expect(c.imageUrl).toBeNull();
    expect(c.titleA).toBe("");
  });

  it("keeps known frames and coerces unknown ones to the default", () => {
    expect(normalizeInvitationContent({ frame: "flores" }).frame).toBe("flores");
    expect(normalizeInvitationContent({ frame: "holograma" }).frame).toBe(
      DEFAULT_FRAME
    );
  });

  it("normalizes partial overrides and trims imageUrl", () => {
    const c = normalizeInvitationContent({
      imageUrl: "  /api/photos/abc/file  ",
      message: "Os esperamos",
      date: 123, // non-string → dropped to default
    });
    expect(c.imageUrl).toBe("/api/photos/abc/file");
    expect(c.message).toBe("Os esperamos");
    expect(c.date).toBe("");
  });
});

describe("invitationContentSchema", () => {
  it("accepts a full valid content object", () => {
    const r = invitationContentSchema.safeParse({
      frame: "lino",
      imageUrl: "/api/photos/x/file",
      titleA: "Ana",
      message: "Venid",
      dressCode: "Elegante",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown frame and non-string message", () => {
    expect(
      invitationContentSchema.safeParse({ frame: "nope" }).success
    ).toBe(false);
    expect(
      invitationContentSchema.safeParse({ message: 42 }).success
    ).toBe(false);
  });
});