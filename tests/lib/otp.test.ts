import { describe, expect, it, vi } from "vitest";
import {
  OTP_MAX_ATTEMPTS,
  OTP_RATE_LIMIT_PER_HOUR,
  generateOtp,
  hashOtp,
  isPhoneAllowed,
  normalizePhone,
  otpTtlMs,
  verifyOtp,
} from "../../src/lib/otp";
import { createPhoneRateLimiter } from "../../src/lib/otp";

describe("OTP constants", () => {
  it("OTP lives 10 minutes", () => {
    expect(otpTtlMs).toBe(10 * 60 * 1000);
  });
  it("allows at most 3 attempts", () => {
    expect(OTP_MAX_ATTEMPTS).toBe(3);
  });
  it("rate-limits to 5 requests per hour", () => {
    expect(OTP_RATE_LIMIT_PER_HOUR).toBe(5);
  });
});

describe("generateOtp", () => {
  it("produces a 6-digit numeric string with the default RNG", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("respects an injectable RNG (returns 0..1)", () => {
    // 0.0 -> "000000"
    expect(generateOtp(() => 0.0)).toBe("000000");
    // 0.999999 -> "999999"
    expect(generateOtp(() => 0.999999)).toBe("999999");
    // 0.123456 -> "123456"
    expect(generateOtp(() => 0.123456)).toBe("123456");
  });
});

describe("hashOtp / verifyOtp", () => {
  it("hashes to a non-plaintext hex string", () => {
    const h = hashOtp("123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe("123456");
  });

  it("round-trips: correct code verifies true", () => {
    const code = "482913";
    expect(verifyOtp(code, hashOtp(code))).toBe(true);
  });

  it("rejects a wrong code", () => {
    expect(verifyOtp("000000", hashOtp("111111"))).toBe(false);
  });

  it("rejects a malformed/garbage hash", () => {
    expect(verifyOtp("123456", "not-a-hash")).toBe(false);
    expect(verifyOtp("123456", "")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("strips spaces, dashes and parens", () => {
    expect(normalizePhone("+34 612 345 678")).toBe("+34612345678");
    expect(normalizePhone("+34 (612) 345-678")).toBe("+34612345678");
    expect(normalizePhone("+34   612   345   678")).toBe("+34612345678");
  });

  it("keeps the leading + only", () => {
    expect(normalizePhone("+34 612")).toBe("+34612");
    expect(normalizePhone("34612345678")).toBe("34612345678");
  });
});

describe("isPhoneAllowed", () => {
  const allowed = ["+34 612 345 678", "+44 7700 900 123"];

  it("accepts an allowed phone with exact match", () => {
    expect(isPhoneAllowed(allowed, "+34 612 345 678")).toBe(true);
  });

  it("accepts an allowed phone despite different spacing", () => {
    expect(isPhoneAllowed(allowed, "+34612345678")).toBe(true);
    expect(isPhoneAllowed(allowed, "+34 612 345678")).toBe(true);
  });

  it("rejects a phone not in the allowlist", () => {
    expect(isPhoneAllowed(allowed, "+34 999 999 999")).toBe(false);
    expect(isPhoneAllowed(allowed, "+1 234 567 8900")).toBe(false);
  });

  it("rejects when the allowlist is empty", () => {
    expect(isPhoneAllowed([], "+34612345678")).toBe(false);
  });
});

describe("createPhoneRateLimiter", () => {
  it("allows requests up to the limit, then blocks", () => {
    const limiter = createPhoneRateLimiter({
      limit: OTP_RATE_LIMIT_PER_HOUR,
      windowMs: 60 * 60 * 1000,
      now: () => 1_000_000,
    });
    for (let i = 0; i < OTP_RATE_LIMIT_PER_HOUR; i++) {
      expect(limiter.allowed("+34612345678")).toBe(true);
    }
    // The 6th request within the hour is rate-limited (5 allowed per hour).
    expect(limiter.allowed("+34612345678")).toBe(false);
  });

  it("is keyed by normalized phone (independent windows per phone)", () => {
    const limiter = createPhoneRateLimiter({
      limit: 2,
      windowMs: 60 * 60 * 1000,
      now: () => 1_000_000,
    });
    expect(limiter.allowed("+34 612 345 678")).toBe(true);
    expect(limiter.allowed("+34612345678")).toBe(true);
    expect(limiter.allowed("+34612345678")).toBe(false);
    // A different phone is unaffected.
    expect(limiter.allowed("+44 7700 900 123")).toBe(true);
  });
});
