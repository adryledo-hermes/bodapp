import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the Prisma client — now uses findMany + update (per-guest), not updateMany.
const { findMany, update, $transaction } = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  $transaction: vi.fn((updates: Promise<unknown>[]) => Promise.all(updates)),
}));

vi.mock("@/lib/db", () => ({ prisma: { guest: { findMany, update }, $transaction } }));

vi.mock("@/lib/otp-flow-db", () => ({
  findInvitationByToken: vi.fn(),
}));

vi.mock("@/lib/otp-session", () => ({
  getInvitationAccess: vi.fn(),
}));

vi.mock("@/lib/invitation-public-db", () => ({
  loadPublicInvitationView: vi.fn(),
}));

import { POST } from "../../src/app/api/rsvp/route";
import { findInvitationByToken } from "@/lib/otp-flow-db";
import { getInvitationAccess } from "@/lib/otp-session";
import { loadPublicInvitationView } from "@/lib/invitation-public-db";
import type { InvitationView } from "@/lib/invitation-public";
import type { RsvpStatus } from "@/lib/rsvp";

const mockedFindInvitation = vi.mocked(findInvitationByToken);
const mockedGetAccess = vi.mocked(getInvitationAccess);
const mockedLoadView = vi.mocked(loadPublicInvitationView);

const INVITATION = {
  id: "inv-family",
  weddingId: "wed-1",
  acceptedPhones: ["+346****0001", "+346****0002"],
  content: null,
};

interface ViewGuest {
  id: string;
  fullName: string;
  alias: null;
  isChild: boolean;
  allergies: string[];
  musicPrefs: string[];
  plusOneAllowed: boolean;
  plusOneName: null;
  rsvpStatus: RsvpStatus;
}

function guest(
  overrides: { id: string; fullName: string } & Partial<ViewGuest>
): ViewGuest {
  return {
    alias: null,
    isChild: false,
    allergies: [],
    musicPrefs: [],
    plusOneAllowed: false,
    plusOneName: null,
    rsvpStatus: "pending",
    ...overrides,
  };
}

function sampleView(
  invitees: ViewGuest[] = [
    guest({ id: "g-ana", fullName: "Ana", allergies: ["gluten"], musicPrefs: ["rock"] }),
    guest({
      id: "g-luis",
      fullName: "Luis",
      allergies: ["mariscos"],
      musicPrefs: ["funky"],
      rsvpStatus: "confirmed",
    }),
  ]
): InvitationView {
  return {
    token: "inv-family",
    wedding: { coupleNameA: "María", coupleNameB: "Pedro" },
    content: {} as InvitationView["content"],
    invitees,
    greeting: "¡Hola, Ana y Luis!",
    bankAccount: null,
    inline: { imageUrl: null }
  };
}

/** Build a request with the per-guest body format. */
function makeRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/rsvp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guests: [
        {
          id: "g-luis",
          rsvpStatus: "confirmed",
          allergies: ["lácteos"],
          musicPrefs: ["jazz"],
          ...overrides,
        },
      ],
    }),
  });
}

describe("POST /api/rsvp", () => {
  beforeEach(() => {
    update.mockClear();
    findMany.mockClear();
    mockedLoadView.mockResolvedValue(sampleView());
    // By default, all guests in the invitation are valid
    findMany.mockResolvedValue([
      { id: "g-ana" },
      { id: "g-luis" },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the invitation_access cookie is absent", async () => {
    mockedGetAccess.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 404 when the invitation id or wedding does not match the cookie", async () => {
    mockedGetAccess.mockResolvedValue({
      invitationId: "inv-family",
      weddingId: "wed-1",
      phone: "+346****0001",
    });
    mockedFindInvitation.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();

    mockedFindInvitation.mockResolvedValue({
      ...INVITATION,
      weddingId: "wed-OTHER",
    });
    const res2 = await POST(makeRequest());
    expect(res2.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 400 when the guest id is omitted or body is empty", async () => {
    mockedGetAccess.mockResolvedValue({
      invitationId: "inv-family",
      weddingId: "wed-1",
      phone: "+346****0001",
    });
    mockedFindInvitation.mockResolvedValue(INVITATION);

    // Empty guests array
    const res = await POST(new Request("http://localhost/api/rsvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guests: [] }),
    }));
    expect(res.status).toBe(400);

    // No guests key
    const res2 = await POST(new Request("http://localhost/api/rsvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(res2.status).toBe(400);
  });

  it("FIX I-1: scopes the write to the authenticated guest's ID, not every invitee", async () => {
    mockedGetAccess.mockResolvedValue({
      invitationId: "inv-family",
      weddingId: "wed-1",
      phone: "+346****0002",
    });
    mockedFindInvitation.mockResolvedValue(INVITATION);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // Must update only the guest with id "g-luis" (the one in the body that
    // belongs to this invitation). Ana's row is untouched.
    expect(update).toHaveBeenCalledWith({
      where: { id: "g-luis" },
      data: {
        rsvpStatus: "confirmed",
        plusOneName: null,
        allergies: ["lácteos"],
        musicPrefs: ["jazz"],
      },
    });
    // Should only have called update once
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("returns the updated view in the response for immediate re-render", async () => {
    mockedGetAccess.mockResolvedValue({
      invitationId: "inv-family",
      weddingId: "wed-1",
      phone: "+346****0002",
    });
    mockedFindInvitation.mockResolvedValue(INVITATION);
    mockedLoadView.mockResolvedValue({
      ...sampleView(),
      invitees: [
        {
          id: "g-ana",
          fullName: "Ana",
          alias: null,
          isChild: false,
          allergies: ["gluten"],
          musicPrefs: ["rock"],
          plusOneAllowed: false,
          plusOneName: null,
          rsvpStatus: "pending",
        },
        {
          id: "g-luis",
          fullName: "Luis",
          alias: null,
          isChild: false,
          allergies: ["lácteos"],
          musicPrefs: ["jazz"],
          plusOneAllowed: false,
          plusOneName: null,
          rsvpStatus: "confirmed",
        },
      ],
      greeting: "¡Hola, Ana y Luis!",
      bankAccount: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.view.invitees[1].allergies).toEqual(["lácteos"]);
    expect(body.view.invitees[1].musicPrefs).toEqual(["jazz"]);
    // Ana's row is untouched by the write for Luis's phone.
    expect(body.view.invitees[0].allergies).toEqual(["gluten"]);
    expect(body.view.invitees[0].musicPrefs).toEqual(["rock"]);
  });
});