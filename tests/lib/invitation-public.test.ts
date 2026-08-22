import { describe, expect, it } from "vitest";
import {
  buildInvitationView,
  publicPlateOf,
  type InviteeGuest,
} from "../../src/lib/invitation-public";

const baseGuest: InviteeGuest = {
  id: "guest-1",
  fullName: "Ana García",
  alias: null,
  phone: "+34600000001",
  allergies: [],
  musicPrefs: [],
  paperInvitation: false,
  plusOneAllowed: false,
  plusOneName: null,
  rsvpStatus: "pending",
  tableId: null,
  notes: null,
};

const wedding = {
  coupleNameA: "María",
  coupleNameB: "Pedro",
  bankAccount: "ES00",
  venue: "Finca El Paraíso",
};
const invitation = { id: "inv-1" };
const sampleGuest = (overrides: Partial<InviteeGuest> = {}): InviteeGuest => ({
  ...baseGuest,
  ...overrides,
});

describe("publicPlateOf", () => {
  it("redacts the guest phone", () => {
    expect(publicPlateOf(baseGuest)).not.toHaveProperty("phone");
  });
});

describe("buildInvitationView", () => {
  it("fills new template defaults", () => {
    const view = buildInvitationView({ wedding, template: {}, invitation, guests: [baseGuest] });
    // titleA/B and venue come from Wedding, not the template
    expect(view.content.titleA).toBe(wedding.coupleNameA);
    expect(view.content.titleB).toBe(wedding.coupleNameB);
    expect(view.content.venue).toBe(wedding.venue);
    expect(view.inline.imageUrl).toBeNull();
  });

  it("uses wedding names as default and inline can override", () => {
    const view = buildInvitationView({
      wedding,
      template: { date: "2026-09-12", time: "13:00", schedule: "16:00 · Ceremonia", directions: "M-30", accommodation: "Hotel" },
      invitation,
      guests: [sampleGuest({ fullName: "Ana" }), sampleGuest({ id: "g2", fullName: "Luis" })],
    });
    // titleA/B come from Wedding.coupleNameA/B (not the template)
    expect(view.content.titleA).toBe(wedding.coupleNameA);
    expect(view.content.venue).toBe(wedding.venue);
    expect(view.content.schedule).toContain("Ceremonia");
    expect(view.greeting).toContain("Ana y Luis");
  });

  it("allows invitation-specific text/image overrides", () => {
    const view = buildInvitationView({
      wedding,
      template: { message: "Base", imageUrl: "/base.jpg" },
      invitation,
      inline: { message: "Personal", imageUrl: "/own.jpg" },
      guests: [baseGuest],
    });
    expect(view.content.message).toBe("Personal");
    expect(view.inline.imageUrl).toBe("/own.jpg");
  });
});
