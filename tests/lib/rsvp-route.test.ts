import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the Prisma client + invitation resolver + access cookie so the route
// can be exercised with full determinism and no database / network I/O.
const { updateMany } = vi.hoisted(() => ({
  updateMany: vi.fn().mockResolvedValue({ count: 1 }),
}));

vi.mock("@/lib/db", () => ({ prisma: { guest: { updateMany } } }));

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
  acceptedPhones: ["+34600000001", "+34600000002"],
};

interface ViewGuest {
  id: string;
  fullName: string;
  alias: null;
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
  };
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/rsvp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rsvpStatus: "confirmed",
      allergies: ["lácteos"],
      musicPrefs: ["jazz"],
      ...overrides,
    }),
  });
}

describe("POST /api/rsvp", () => {
  beforeEach(() => {
    updateMany.mockClear();
    mockedLoadView.mockResolvedValue(sampleView());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the invitation_access cookie is absent", async () => {
    mockedGetAccess.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the invitation id or wedding does not match the cookie", async () => {
    mockedGetAccess.mockResolvedValue({
      invitationId: "inv-family",
      weddingId: "wed-1",
      phone: "+34600000001",
    });
    mockedFindInvitation.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(updateMany).not.toHaveBeenCalled();

    mockedFindInvitation.mockResolvedValue({
      ...INVITATION,
      weddingId: "wed-OTHER", // mismatch
    });
    const res2 = await POST(makeRequest());
    expect(res2.status).toBe(404);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("FIX I-1: scopes the write to the authenticated phone's guest row, not every invitee", async () => {
    mockedGetAccess.mockResolvedValue({
      invitationId: "inv-family",
      weddingId: "wed-1",
      phone: "+34600000002", // Luis confirmed previously; Ana submitted
    });
    mockedFindInvitation.mockResolvedValue(INVITATION);

    const res = await POST(
      makeRequest({
        rsvpStatus: "confirmed",
        allergies: ["lácteos"],
        musicPrefs: ["jazz"],
      })
    );

    expect(res.status).toBe(200);
    // Must scope the update to the authenticated phone only — NOT every guest
    // whose phone is in the invitation's acceptedPhones. This preserves Ana's
    // distinct allergies/music (["gluten"]/["rock"]) instead of clobbering them.
    expect(updateMany).toHaveBeenCalledWith({
      where: { weddingId: "wed-1", phone: "+34600000002" },
      data: {
        rsvpStatus: "confirmed",
        allergies: ["lácteos"],
        musicPrefs: ["jazz"],
      },
    });
  });

  it("returns the updated view in the response for immediate re-render", async () => {
    mockedGetAccess.mockResolvedValue({
      invitationId: "inv-family",
      weddingId: "wed-1",
      phone: "+34600000002",
    });
    mockedFindInvitation.mockResolvedValue(INVITATION);
    mockedLoadView.mockResolvedValue({
      ...sampleView(),
      invitees: [
        {
          id: "g-ana",
          fullName: "Ana",
          alias: null,
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
