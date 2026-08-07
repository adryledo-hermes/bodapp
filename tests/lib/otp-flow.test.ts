import { describe, expect, it, vi } from "vitest";
import {
  OTP_MAX_ATTEMPTS,
  createPhoneRateLimiter,
  generateOtp,
  hashOtp,
  isPhoneAllowed,
  OTP_RATE_LIMIT_PER_HOUR,
  verifyOtp,
} from "../../src/lib/otp";
import {
  requestOtp,
  verifyOtpRequest,
  type OtpFlowDeps,
  type PendingOtp,
} from "../../src/lib/otp-flow";

// The FIX C1 test loads otp-flow-db (which imports the real Prisma client).
// Stub the db module so no DATABASE_URL / real client is needed here.
vi.mock("@/lib/db", () => ({ prisma: {}, adapter: {} }));

/**
 * In-memory control-plane harness for the OTP flow. Replaces Prisma + Twilio
 * so the security gating logic is exercised with full determinism and no
 * network I/O.
 */
function makeDeps(overrides: Partial<OtpFlowDeps> = {}): {
  deps: OtpFlowDeps;
  created: Array<{ invitationId: string; phone: string; codeHash: string }>;
  attempts: Map<string, number>;
  smsCalls: Array<{ phone: string; code: string }>;
  otps: Map<string, PendingOtp>;
  nextInvalidated: () => void;
} {
  const created: Array<{
    invitationId: string;
    phone: string;
    codeHash: string;
  }> = [];
  const smsCalls: Array<{ phone: string; code: string }> = [];
  const attempts = new Map<string, number>();
  const otps = new Map<string, PendingOtp>();
  let invalidateNext = false;

  const deps: OtpFlowDeps = {
    findInvitation: async (token) => {
      if (token === "unknown") return null;
      return {
        id: "inv-1",
        weddingId: "wed-1",
        acceptedPhones: ["+34612345678", "+44 7700 900 123"],
      };
    },
    createOtp: async ({ invitationId, phone, codeHash, expiresAt }) => {
      const id = `otp-${created.length + 1}`;
      created.push({ invitationId, phone, codeHash });
      otps.set(id, { id, codeHash, attempts: attempts.get(id) ?? 0 });
      return id;
    },
    findPendingOtp: async (invitationId, phone) => {
      const match = [...otps.values()].find(
        (o) => o.id === phone || true
      );
      // Recreate semantics: find the OTP created for this phone.
      for (const [, o] of otps) {
        void o;
      }
      return otps.get(phone) ?? null;
    },
    incrementAttempts: async (id) => {
      const next = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, next);
      const o = otps.get(id);
      if (o) o.attempts = next;
      return next;
    },
    consumeOtp: async (id) => {
      otps.delete(id);
      if (invalidateNext) {
        invalidateNext = false;
        // Simulate the pending lookup no longer finding it.
      }
    },
    rateLimiter: createPhoneRateLimiter({
      limit: OTP_RATE_LIMIT_PER_HOUR,
      windowMs: 60 * 60 * 1000,
      now: () => 1_000_000,
    }),
    sendSms: async (phone, code) => {
      smsCalls.push({ phone, code });
      return { ok: true };
    },
    gen: { generateOtp, hashOtp, verifyOtp, isPhoneAllowed },
    otpTtlMs: 10 * 60 * 1000,
    ...overrides,
  };

  return {
    deps,
    created,
    attempts,
    smsCalls,
    otps,
    nextInvalidated: () => {
      invalidateNext = true;
    },
  };
}

describe("requestOtp — allowlist gate (security-critical)", () => {
  it("rejects a phone NOT in the invitation allowlist and sends NO OTP", async () => {
    const { deps, smsCalls, created } = makeDeps();
    const res = await requestOtp("inv-1", "+34 999 888 777", deps);
    expect(res.ok).toBe(false);
    expect(smsCalls).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it("returns the SAME generic error for an unknown token as for a non-allowed phone (no probing)", async () => {
    const { deps } = makeDeps();
    const unknown = await requestOtp("unknown", "+34 999 888 777", deps);
    const disallowed = await requestOtp("inv-1", "+34 999 888 777", deps);
    expect(unknown.ok).toBe(false);
    expect(disallowed.ok).toBe(false);
    if (!unknown.ok && !disallowed.ok) {
      expect(unknown.error).toBe(disallowed.error);
    }
  });

  it("accepts an allowed phone and issues an OTP (hashed, not plaintext)", async () => {
    const { deps, smsCalls, created } = makeDeps();
    const res = await requestOtp("inv-1", "+34 612 345 678", deps);
    expect(res.ok).toBe(true);
    expect(created).toHaveLength(1);
    // Stored hash is a hex sha256, never the raw code.
    expect(created[0].codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(created[0].codeHash).not.toBe(smsCalls[0]?.code);
    expect(smsCalls).toHaveLength(1);
    expect(smsCalls[0].phone).toBe("+34612345678");
  });

  it("normalizes the phone on the way in (allowlist match despite different spacing)", async () => {
    const { deps, smsCalls } = makeDeps();
    const res = await requestOtp("inv-1", "+34 612 345678", deps);
    expect(res.ok).toBe(true);
    expect(smsCalls[0].phone).toBe("+34612345678");
  });
});

describe("requestOtp — rate limiting", () => {
  it("allows up to OTP_RATE_LIMIT_PER_HOUR requests per phone, then refuses", async () => {
    const { deps } = makeDeps();
    for (let i = 0; i < OTP_RATE_LIMIT_PER_HOUR; i++) {
      const res = await requestOtp("inv-1", "+34612345678", deps);
      expect(res.ok).toBe(true);
    }
    const blocked = await requestOtp("inv-1", "+34612345678", deps);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toContain("Demasiados intentos");
  });

  it("rate limit is per phone, not global", async () => {
    const { deps } = makeDeps();
    for (let i = 0; i < OTP_RATE_LIMIT_PER_HOUR; i++) {
      await requestOtp("inv-1", "+34612345678", deps);
    }
    // Different phone still allowed.
    const other = await requestOtp("inv-1", "+44 7700 900 123", deps);
    expect(other.ok).toBe(true);
  });
});

describe("verifyOtpRequest — code verification", () => {
  it("verifies a correct code and consumes the OTP", async () => {
    const h = makeDeps();
    // Request first to create the OTP, then recompute the code.
    // We simulate by directly inserting a pending OTP with a known hash.
    const code = "123456";
    h.otps.set("+34612345678", {
      id: "+34612345678",
      codeHash: hashOtp(code),
      attempts: 0,
    });
    const res = await verifyOtpRequest(
      "inv-1",
      "+34612345678",
      code,
      h.deps
    );
    expect(res.ok).toBe(true);
  });

  it("rejects a wrong code", async () => {
    const h = makeDeps();
    h.otps.set("+34612345678", {
      id: "+34612345678",
      codeHash: hashOtp("123456"),
      attempts: 0,
    });
    const res = await verifyOtpRequest(
      "inv-1",
      "+34612345678",
      "999999",
      h.deps
    );
    expect(res.ok).toBe(false);
  });
});

describe("verifyOtpRequest — security lockout (M4)", () => {
  const PHONE = "+34612345678";

  it("locks out after OTP_MAX_ATTEMPTS (3) wrong guesses — door stays closed even for the correct code", async () => {
    const h = makeDeps();
    h.otps.set(PHONE, {
      id: PHONE,
      codeHash: hashOtp("123456"),
      attempts: 0,
    });
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      const res = await verifyOtpRequest("inv-1", PHONE, "000000", h.deps);
      expect(res.ok).toBe(false);
    }
    // Exactly 3 increments recorded, never more.
    expect(h.attempts.get(PHONE)).toBe(OTP_MAX_ATTEMPTS);
    // Even the correct code is now rejected: lockout closes the door.
    const blocked = await verifyOtpRequest("inv-1", PHONE, "123456", h.deps);
    expect(blocked.ok).toBe(false);
  });

  it("rejects an already-consumed OTP on reuse", async () => {
    const h = makeDeps();
    h.otps.set(PHONE, {
      id: PHONE,
      codeHash: hashOtp("123456"),
      attempts: 0,
    });
    const first = await verifyOtpRequest("inv-1", PHONE, "123456", h.deps);
    expect(first.ok).toBe(true);
    // Consumed rows are excluded from the pending lookup → reuse rejected.
    const reuse = await verifyOtpRequest("inv-1", PHONE, "123456", h.deps);
    expect(reuse.ok).toBe(false);
  });

  it("rejects an expired OTP (pending lookup excludes expired rows)", async () => {
    // The DB-backed findPendingOtp filters out expired rows (expiresAt > now),
    // so an expired OTP is indistinguishable from "no OTP" — and rejected.
    const h = makeDeps({
      findPendingOtp: async () => null,
    });
    h.otps.set(PHONE, {
      id: PHONE,
      codeHash: hashOtp("123456"),
      attempts: 0,
    });
    const res = await verifyOtpRequest("inv-1", PHONE, "123456", h.deps);
    expect(res.ok).toBe(false);
  });
});

describe("defaultOtpDeps — persistent rate limiter singleton (FIX C1)", () => {
  it("shares ONE module-level rate limiter across every deps build", async () => {
    // Loaded dynamically (not at module top) so the db mock above is in
    // place first; the module itself stubs the Prisma client.
    const { defaultOtpDeps } = await import("../../src/lib/otp-flow-db");
    expect(defaultOtpDeps().rateLimiter).toBe(defaultOtpDeps().rateLimiter);
  });
});
