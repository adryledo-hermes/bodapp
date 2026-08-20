import { describe, expect, it } from "vitest";
import {
  buildInvitationView,
  publicPlateOf,
  type InviteeGuest,
} from "../../src/lib/invitation-public";
import { DEFAULT_TEMPLATE } from "../../src/lib/invitation";
import { DEFAULT_FRAME } from "../../src/lib/invitation-inline";

const baseGuest: InviteeGuest = {
  id: "guest-1",
  fullName: "Ana García",
  alias: null,
  phone: "+34600000001",
  allergies: ["gluten"],
  musicPrefs: ["rock"],
  paperInvitation: false,
  plusOneAllowed: true,
  plusOneName: "Luis",
  rsvpStatus: "pending",
  tableId: "table-9",
  notes: "private note",
};

const wedding = {
  coupleNameA: "María",
  coupleNameB: "Pedro",
  bankAccount: "ES12 3456 7890 1234 5678 90",
};

const invitation = { id: "inv-1" };

function sampleGuest(overrides: Partial<InviteeGuest> = {}): InviteeGuest {
  return { ...baseGuest, ...overrides };
}

describe("publicPlateOf", () => {
  it("exposes only what the guest should see", () => {
    const plate = publicPlateOf(baseGuest);
    expect(plate).toEqual({
      id: "guest-1",
      fullName: "Ana García",
      alias: null,
      allergies: ["gluten"],
      musicPrefs: ["rock"],
      plusOneAllowed: true,
      plusOneName: "Luis",
      rsvpStatus: "pending",
    });
  });

  it("redacts phone, tableId, notes and internal fields", () => {
    const plate = publicPlateOf(baseGuest) as unknown as Record<
      string,
      unknown
    >;
    expect(plate).not.toHaveProperty("phone");
    expect(plate).not.toHaveProperty("tableId");
    expect(plate).not.toHaveProperty("notes");
    expect(plate).not.toHaveProperty("paperInvitation");
  });

  it("coerces an unknown stored status to pending", () => {
    const plate = publicPlateOf(sampleGuest({ rsvpStatus: "sí-voy" }));
    expect(plate.rsvpStatus).toBe("pending");
  });
});

describe("buildInvitationView", () => {
  it("fills template defaults for sparse template content", () => {
    const view = buildInvitationView({
      wedding,
      template: { titleA: "María & Pedro" },
      invitation,
      guests: [sampleGuest()],
    });
    expect(view.content.message).toBe(DEFAULT_TEMPLATE.message);
    expect(view.content.colors.primary).toBe(DEFAULT_TEMPLATE.colors.primary);
    expect(view.content.titleA).toBe("María & Pedro");
    expect(view.content.sections).toEqual([]);
  });

  it("personalizes the greeting to a single invitee by full name", () => {
    const view = buildInvitationView({
      wedding,
      template: {},
      invitation,
      guests: [sampleGuest()],
    });
    expect(view.greeting).toBe("¡Hola, Ana García!");
  });

  it("lists multiple invitees joined in the greeting", () => {
    const view = buildInvitationView({
      wedding,
      template: {},
      invitation,
      guests: [
        sampleGuest({ id: "g1", fullName: "Ana García" }),
        sampleGuest({ id: "g2", fullName: "Luis García" }),
      ],
    });
    expect(view.greeting).toBe("¡Hola, Ana García y Luis García!");
  });

  it("treats an empty invitee list gracefully", () => {
    const view = buildInvitationView({
      wedding,
      template: {},
      invitation,
      guests: [],
    });
    expect(view.greeting).toBe("¡Hola!");
    expect(view.invitees).toEqual([]);
  });

  it("surfaces the couple names and bank account", () => {
    const view = buildInvitationView({
      wedding,
      template: {},
      invitation,
      guests: [sampleGuest()],
    });
    expect(view.wedding.coupleNameA).toBe("María");
    expect(view.wedding.coupleNameB).toBe("Pedro");
    expect(view.bankAccount).toBe(wedding.bankAccount);
  });

  it("reflects the invitee's existing RSVP and preferences through the redacted plate", () => {
    const view = buildInvitationView({
      wedding,
      template: {},
      invitation,
      guests: [
        sampleGuest({
          rsvpStatus: "confirmed",
          allergies: ["gluten", "lácteos"],
          musicPrefs: ["rock"],
        }),
      ],
    });
    expect(view.invitees[0].rsvpStatus).toBe("confirmed");
    expect(view.invitees[0].allergies).toEqual(["gluten", "lácteos"]);
    expect(view.invitees[0].musicPrefs).toEqual(["rock"]);
    expect(view.invitees[0]).not.toHaveProperty("phone");
  });

  it("exposes the invitation token for the client to act against", () => {
    const view = buildInvitationView({
      wedding,
      template: {},
      invitation: { id: "inv-42" },
      guests: [sampleGuest()],
    });
    expect(view.token).toBe("inv-42");
  });

  it("an invitation with no own content inherits the template's frame + image", () => {
    const view = buildInvitationView({
      wedding,
      template: { frame: "flores", imageUrl: "/api/photos/x/file" },
      invitation,
      guests: [sampleGuest()],
    });
    expect(view.inline.frame).toBe("flores");
    expect(view.inline.imageUrl).toBe("/api/photos/x/file");
  });

  it("an invitation with its own content overrides the template frame + image", () => {
    const view = buildInvitationView({
      wedding,
      template: { frame: "flores", imageUrl: "/api/photos/x/file" },
      invitation,
      inline: { frame: "lino", imageUrl: "/api/photos/y/file" },
      guests: [sampleGuest()],
    });
    expect(view.inline.frame).toBe("lino");
    expect(view.inline.imageUrl).toBe("/api/photos/y/file");
  });

  it("falls back to the default frame when neither template nor invitation set one", () => {
    const view = buildInvitationView({
      wedding,
      template: {},
      invitation,
      guests: [sampleGuest()],
    });
    expect(view.inline.frame).toBe(DEFAULT_FRAME);
    expect(view.inline.imageUrl).toBeNull();
  });
});
