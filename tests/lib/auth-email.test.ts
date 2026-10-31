import { describe, expect, it } from "vitest";
import {
  EMAIL_RATE_LIMIT_PER_HOUR,
  PASSWORD_RESET_TTL_MS,
  VERIFY_EMAIL_TTL_MS,
  buildResetPasswordUrl,
  buildVerifyEmailUrl,
  createEmailRateLimiter,
  emailVerificationRequired,
  expiryFrom,
  generateEmailToken,
  hashEmailToken,
  isTokenUsable,
  normalizeEmail,
  publicBaseUrl,
  verifyEmailToken,
} from "../../src/lib/auth-email";

describe("token generation + storage", () => {
  it("mints 32 random bytes as a 64-char hex string, never repeating", () => {
    const a = generateEmailToken();
    const b = generateEmailToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("stores only the SHA-256 hash of the token", () => {
    expect(hashEmailToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(hashEmailToken("abc")).toBe(hashEmailToken("abc"));
    expect(hashEmailToken("abc")).not.toBe(hashEmailToken("abd"));
    expect(hashEmailToken("abc")).not.toBe("abc");
  });

  it("accepts only the exact token for a stored hash", () => {
    const token = generateEmailToken();
    const stored = hashEmailToken(token);
    expect(verifyEmailToken(token, stored)).toBe(true);
    expect(verifyEmailToken(token + "0", stored)).toBe(false);
    expect(verifyEmailToken(token.slice(0, -1), stored)).toBe(false);
    expect(verifyEmailToken("", stored)).toBe(false);
    expect(verifyEmailToken(token, "")).toBe(false);
    expect(verifyEmailToken(token, "not-a-hash")).toBe(false);
  });
});

describe("isTokenUsable", () => {
  const now = 1_700_000_000_000;

  it("allows a fresh, unconsumed token", () => {
    expect(
      isTokenUsable({ expiresAt: new Date(now + 1000), consumedAt: null }, now)
    ).toBe(true);
  });

  it("rejects a consumed token", () => {
    expect(
      isTokenUsable(
        { expiresAt: new Date(now + 1000), consumedAt: new Date(now) },
        now
      )
    ).toBe(false);
  });

  it("rejects an expired token (and a garbage expiry)", () => {
    expect(
      isTokenUsable({ expiresAt: new Date(now - 1), consumedAt: null }, now)
    ).toBe(false);
    expect(
      isTokenUsable({ expiresAt: "nonsense", consumedAt: null }, now)
    ).toBe(false);
  });
});

describe("TTLs, expiry and normalization", () => {
  it("keeps the documented lifetimes", () => {
    expect(VERIFY_EMAIL_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(PASSWORD_RESET_TTL_MS).toBe(60 * 60 * 1000);
    expect(EMAIL_RATE_LIMIT_PER_HOUR).toBe(5);
  });

  it("expiryFrom is deterministic with an injected clock", () => {
    expect(expiryFrom(1000, 500).getTime()).toBe(1500);
  });

  it("normalizes emails so buckets and lookups do not fragment", () => {
    expect(normalizeEmail("  Ana@EXample.COM ")).toBe("ana@example.com");
    expect(normalizeEmail(undefined as unknown as string)).toBe("");
  });
});

describe("emailVerificationRequired (login gate)", () => {
  it("is off unless explicitly enabled", () => {
    expect(emailVerificationRequired({})).toBe(false);
    expect(emailVerificationRequired({ EMAIL_VERIFICATION_REQUIRED: "" })).toBe(
      false
    );
    expect(emailVerificationRequired({ EMAIL_VERIFICATION_REQUIRED: "false" })).toBe(
      false
    );
    expect(emailVerificationRequired({ EMAIL_VERIFICATION_REQUIRED: "0" })).toBe(
      false
    );
    expect(emailVerificationRequired({ EMAIL_VERIFICATION_REQUIRED: "no" })).toBe(
      false
    );
  });

  it("treats 1 / true / yes (any case, padded) as on", () => {
    expect(emailVerificationRequired({ EMAIL_VERIFICATION_REQUIRED: "1" })).toBe(
      true
    );
    expect(
      emailVerificationRequired({ EMAIL_VERIFICATION_REQUIRED: "TRUE" })
    ).toBe(true);
    expect(
      emailVerificationRequired({ EMAIL_VERIFICATION_REQUIRED: " yes " })
    ).toBe(true);
  });
});

describe("publicBaseUrl + link builders", () => {
  it("reads PUBLIC_BASE_URL and strips trailing slashes", () => {
    expect(publicBaseUrl({})).toBe("");
    expect(publicBaseUrl({ PUBLIC_BASE_URL: "https://app.example.com/" })).toBe(
      "https://app.example.com"
    );
    expect(
      publicBaseUrl({ PUBLIC_BASE_URL: "  https://app.example.com//  " })
    ).toBe("https://app.example.com");
  });

  it("builds the verification link against the API route", () => {
    expect(buildVerifyEmailUrl("https://app.example.com/", "TOK")).toBe(
      "https://app.example.com/api/auth/verify-email?token=TOK"
    );
  });

  it("builds the reset link against the reset page", () => {
    expect(buildResetPasswordUrl("https://app.example.com", "TOK")).toBe(
      "https://app.example.com/reset-password?token=TOK"
    );
  });

  it("falls back to localhost when no base URL is configured", () => {
    expect(buildResetPasswordUrl("", "TOK")).toBe(
      "http://localhost:3000/reset-password?token=TOK"
    );
  });
});

describe("createEmailRateLimiter", () => {
  it("allows `limit` requests per window, then blocks until it slides", () => {
    let clock = 0;
    const limiter = createEmailRateLimiter({
      limit: 3,
      windowMs: 1000,
      now: () => clock,
    });

    expect(limiter.allowed("a@b.com")).toBe(true);
    expect(limiter.allowed("a@b.com")).toBe(true);
    expect(limiter.allowed("a@b.com")).toBe(true);
    expect(limiter.allowed("a@b.com")).toBe(false);

    clock = 1001; // window slid past the first entries
    expect(limiter.allowed("a@b.com")).toBe(true);
  });

  it("keys buckets on the normalized address and rejects blanks", () => {
    const limiter = createEmailRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.allowed("  A@B.com ")).toBe(true);
    expect(limiter.allowed("a@b.com")).toBe(false); // same bucket
    expect(limiter.allowed("c@d.com")).toBe(true); // separate bucket
    expect(limiter.allowed("")).toBe(false);
  });
});