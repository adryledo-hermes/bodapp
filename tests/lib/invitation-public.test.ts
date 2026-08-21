import { describe, expect, it } from "vitest";
import {
  buildInvitationView,
  publicPlateOf,
  type InviteeGuest,
} from "../../src/lib/invitation-public";
import { DEFAULT_TEMPLATE } from "../../src/lib/invitation";

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
    expect(view.content).toEqual(DEFAULT_TEMPLATE);
    expect(view.inline.imageUrl).toBeNull();
  });

  it("uses template event content and invitee names", () => {
    const view = buildInvitationView({
      wedding,
      template: {
        titleA: "Ana", titleB: "Luis", date: "2026-09-12", time: "13:00",
        schedule: "16:00 · Ceremonia", directions: "M-30", accommodation: "Hotel",
      },
      invitation,
      guests: [sampleGuest({ fullName: "Ana" }), sampleGuest({ id: "g2", fullName: "Luis" })],
    });
    expect(view.content.titleA).toBe("Ana");
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
