import { beforeEach, describe, expect, it } from "vitest";
import {
  RATE_LIMITS,
  checkRateLimit,
  getClientIp,
  getTier,
  resetStore,
} from "../../src/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => resetStore());

  it("allows requests up to the limit", () => {
    const cfg = { windowMs: 60_000, max: 3 };
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit("k", cfg, 1_000);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(2 - i);
    }
  });

  it("rejects the request over the limit with 429 semantics", () => {
    const cfg = { windowMs: 60_000, max: 2 };
    checkRateLimit("k", cfg, 1_000);
    checkRateLimit("k", cfg, 1_000);
    const r = checkRateLimit("k", cfg, 1_000);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(r.resetAt).toBe(Math.ceil((1_000 + 60_000) / 1000));
  });

  it("slides: old requests fall out of the window", () => {
    const cfg = { windowMs: 1_000, max: 2 };
    checkRateLimit("k", cfg, 0); // t=0
    checkRateLimit("k", cfg, 0); // t=0 → window full
    expect(checkRateLimit("k", cfg, 500).allowed).toBe(false);
    // t=1001: first two requests are older than 1000ms → out of window
    expect(checkRateLimit("k", cfg, 1_001).allowed).toBe(true);
  });

  it("does not leak quota across keys", () => {
    const cfg = { windowMs: 60_000, max: 1 };
    checkRateLimit("a", cfg, 1_000);
    expect(checkRateLimit("a", cfg, 1_000).allowed).toBe(false);
    expect(checkRateLimit("b", cfg, 1_000).allowed).toBe(true);
  });

  it("returns correct resetAt for allowed requests", () => {
    const cfg = { windowMs: 60_000, max: 10 };
    const r = checkRateLimit("k", cfg, 10_000);
    expect(r.resetAt).toBe(Math.ceil((10_000 + 60_000) / 1000));
  });

  it("all production tiers have sane limits", () => {
    expect(RATE_LIMITS.sensitive.max).toBeLessThanOrEqual(20);
    expect(RATE_LIMITS.api.max).toBeGreaterThan(RATE_LIMITS.sensitive.max);
    expect(RATE_LIMITS.page.max).toBeGreaterThan(RATE_LIMITS.api.max);
    for (const tier of Object.values(RATE_LIMITS)) {
      expect(tier.windowMs).toBeGreaterThan(0);
      expect(tier.max).toBeGreaterThan(0);
    }
  });
});

describe("getTier", () => {
  it("exempts health checks", () => {
    expect(getTier("/healthz")).toBeNull();
  });

  it("routes auth + OTP + public write endpoints to sensitive", () => {
    expect(getTier("/api/auth/login")).toBe("sensitive");
    expect(getTier("/api/auth/password/forgot")).toBe("sensitive");
    expect(getTier("/api/auth/verify-email/resend")).toBe("sensitive");
    expect(getTier("/api/otp/request")).toBe("sensitive");
    expect(getTier("/api/otp/verify")).toBe("sensitive");
    expect(getTier("/api/setup")).toBe("sensitive");
    expect(getTier("/api/rsvp")).toBe("sensitive");
    expect(getTier("/api/guest/access")).toBe("sensitive");
  });

  it("routes general API endpoints to api", () => {
    expect(getTier("/api/guests")).toBe("api");
    expect(getTier("/api/photos")).toBe("api");
    expect(getTier("/api/tables/1/guests")).toBe("api");
    expect(getTier("/api/account")).toBe("api");
  });

  it("routes pages to page tier", () => {
    expect(getTier("/")).toBe("page");
    expect(getTier("/login")).toBe("page");
    expect(getTier("/panel")).toBe("page");
    expect(getTier("/w/my-wedding")).toBe("page");
  });
});

describe("getClientIp", () => {
  // Duck-typed request: getClientIp takes a structural { headers.get } type.
  const req = (xff: string | null) => ({
    headers: { get: (name: string) => (name === "x-forwarded-for" ? xff : null) },
  });

  it("takes the rightmost X-Forwarded-For entry (Caddy-appended, spoof-proof)", () => {
    expect(getClientIp(req("203.0.113.9"))).toBe("203.0.113.9");
    // A client-supplied leftmost value must be ignored in favour of the
    // rightmost one Caddy appended.
    expect(getClientIp(req("1.2.3.4, 5.6.7.8"))).toBe("5.6.7.8");
    expect(getClientIp(req(" 1.2.3.4 ,  203.0.113.9 "))).toBe("203.0.113.9");
  });

  it("buckets missing or blank headers as one shared 'unknown'", () => {
    expect(getClientIp(req(null))).toBe("unknown");
    expect(getClientIp(req(""))).toBe("unknown");
    expect(getClientIp(req(" , "))).toBe("unknown");
  });
});