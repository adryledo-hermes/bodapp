import { SignJWT, type JWTPayload } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INVITATION_ACCESS_COOKIE,
  INVITATION_TRUST_COOKIE,
  createInvitationAccess,
  createInvitationTrust,
  getInvitationAccess,
  invitationTrustMaxAge,
} from "../../src/lib/otp-session";

/**
 * Trusted-device behaviour: a guest who verifies once (with "don't ask again
 * on this device" ticked) gets a long-lived `invitation_device` cookie, and
 * getInvitationAccess() honours it — so the next visit skips the OTP entirely.
 * next/headers is faked with an in-memory cookie jar.
 */

const h = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  setCalls: [] as Array<{
    name: string;
    value: string;
    opts?: Record<string, unknown>;
  }>,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      h.jar.has(name) ? { name, value: h.jar.get(name)! } : undefined,
    set: (name: string, value: string, opts?: Record<string, unknown>) => {
      h.setCalls.push({ name, value, opts });
      h.jar.set(name, value);
    },
  }),
}));

const SECRET = "unit-test-secret";
const PAYLOAD = {
  invitationId: "inv-1",
  weddingId: "wed-1",
  phone: "+34612345678",
};

let savedSecret: string | undefined;
let savedDays: string | undefined;

beforeEach(() => {
  savedSecret = process.env.SESSION_SECRET;
  savedDays = process.env.GUEST_TRUST_DAYS;
  process.env.SESSION_SECRET = SECRET;
  delete process.env.GUEST_TRUST_DAYS;
  h.jar.clear();
  h.setCalls.length = 0;
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = savedSecret;
  if (savedDays === undefined) delete process.env.GUEST_TRUST_DAYS;
  else process.env.GUEST_TRUST_DAYS = savedDays;
});

/** Forge a signed cookie value the way the module itself signs them. */
async function sign(payload: JWTPayload, expSeconds: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expSeconds)
    .sign(new TextEncoder().encode(SECRET));
}

describe("invitationTrustMaxAge (GUEST_TRUST_DAYS)", () => {
  it("defaults to 30 days", () => {
    expect(invitationTrustMaxAge()).toBe(30 * 24 * 60 * 60);
  });

  it("honours an explicit value", () => {
    process.env.GUEST_TRUST_DAYS = "7";
    expect(invitationTrustMaxAge()).toBe(7 * 24 * 60 * 60);
  });

  it("falls back to the default for junk and clamps the range", () => {
    process.env.GUEST_TRUST_DAYS = "banana";
    expect(invitationTrustMaxAge()).toBe(30 * 24 * 60 * 60);
    process.env.GUEST_TRUST_DAYS = "0";
    expect(invitationTrustMaxAge()).toBe(30 * 24 * 60 * 60);
    process.env.GUEST_TRUST_DAYS = "99999";
    expect(invitationTrustMaxAge()).toBe(730 * 24 * 60 * 60);
    process.env.GUEST_TRUST_DAYS = "365.9";
    expect(invitationTrustMaxAge()).toBe(365 * 24 * 60 * 60);
  });
});

describe("createInvitationTrust", () => {
  it("sets a long-lived httpOnly cookie named invitation_device", async () => {
    await createInvitationTrust(PAYLOAD);
    const call = h.setCalls.find((c) => c.name === INVITATION_TRUST_COOKIE);
    expect(call).toBeDefined();
    expect(call!.name).toBe("invitation_device");
    expect(call!.opts).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    });
    // Distinct from the 30-minute access cookie.
    expect(Number(call!.opts!.maxAge)).toBeGreaterThan(24 * 60 * 60);
  });

  it("uses GUEST_TRUST_DAYS for the cookie lifetime", async () => {
    process.env.GUEST_TRUST_DAYS = "3";
    await createInvitationTrust(PAYLOAD);
    const call = h.setCalls.find((c) => c.name === INVITATION_TRUST_COOKIE);
    expect(call!.opts!.maxAge).toBe(3 * 24 * 60 * 60);
  });
});

describe("getInvitationAccess — access vs trusted device", () => {
  it("returns null with no cookies at all", async () => {
    expect(await getInvitationAccess()).toBeNull();
  });

  it("resolves the short-lived access cookie", async () => {
    h.jar.set(
      INVITATION_ACCESS_COOKIE,
      await sign(PAYLOAD, 30 * 60)
    );
    const access = await getInvitationAccess();
    expect(access).toMatchObject(PAYLOAD);
  });

  it("resolves the TRUSTED DEVICE cookie when the access cookie is gone — no new OTP needed", async () => {
    h.jar.set(
      INVITATION_TRUST_COOKIE,
      await sign(PAYLOAD, 30 * 24 * 60 * 60)
    );
    const access = await getInvitationAccess();
    expect(access).toMatchObject(PAYLOAD);
  });

  it("keeps granting access while the trust token is valid", async () => {
    // Simulate a visit 20 days later: access cookie long expired, trust not.
    h.jar.set(INVITATION_ACCESS_COOKIE, await sign(PAYLOAD, -60));
    h.jar.set(INVITATION_TRUST_COOKIE, await sign(PAYLOAD, 10 * 24 * 60 * 60));
    expect(await getInvitationAccess()).toMatchObject(PAYLOAD);
  });

  it("stops granting access once the trust token expires (device must verify again)", async () => {
    h.jar.set(INVITATION_TRUST_COOKIE, await sign(PAYLOAD, -60));
    expect(await getInvitationAccess()).toBeNull();
  });

  it("rejects a tampered/forged token", async () => {
    h.jar.set(INVITATION_TRUST_COOKIE, "not-a-jwt");
    expect(await getInvitationAccess()).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const forged = await new SignJWT(PAYLOAD)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(new TextEncoder().encode("someone-elses-secret"));
    h.jar.set(INVITATION_TRUST_COOKIE, forged);
    expect(await getInvitationAccess()).toBeNull();
  });

  it("still scopes the payload: a trust grant carries its own invitationId", async () => {
    h.jar.set(
      INVITATION_TRUST_COOKIE,
      await sign({ ...PAYLOAD, invitationId: "inv-OTHER" }, 3600)
    );
    const access = await getInvitationAccess();
    // The caller (invite/invitation/rsvp) compares invitationId — the token
    // must carry the grant's own invitation, never the one being opened.
    expect(access?.invitationId).toBe("inv-OTHER");
  });
});

describe("createInvitationAccess (unchanged 30-minute cookie)", () => {
  it("still sets invitation_access with a 30-minute maxAge", async () => {
    await createInvitationAccess(PAYLOAD);
    const call = h.setCalls.find((c) => c.name === INVITATION_ACCESS_COOKIE);
    expect(call!.opts).toMatchObject({ httpOnly: true, maxAge: 30 * 60 });
    expect(h.setCalls.map((c) => c.name)).toEqual([INVITATION_ACCESS_COOKIE]);
  });
});
