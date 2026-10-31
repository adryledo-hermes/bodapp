/**
 * Pure helpers for the account-security email flows (v1.4): email validation
 * on signup and password recovery. No React / Next / Prisma imports, so the
 * module is unit-testable in isolation (same rule as src/lib/otp.ts).
 *
 * Security invariants:
 *  - Tokens are 32 random bytes as hex; only their SHA-256 hash is stored.
 *  - Every token is single-use (consumedAt) and short-lived (TTLs below).
 *  - Token comparison happens in constant time.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** Validation links stay valid for 24 hours. */
export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;

/** Password-reset links stay valid for 60 minutes. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** Max forgot-password / resend requests per email per rolling hour. */
export const EMAIL_RATE_LIMIT_PER_HOUR = 5;

/** Generate a single-use token (32 random bytes, hex-encoded). */
export function generateEmailToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hash (hex) of a token — the only form we ever persist. */
export function hashEmailToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time check of a candidate token against a stored hash. */
export function verifyEmailToken(token: string, tokenHash: string): boolean {
  if (typeof token !== "string" || typeof tokenHash !== "string") return false;
  if (!token || !tokenHash) return false;
  const candidate = Buffer.from(hashEmailToken(token), "hex");
  const stored = Buffer.from(tokenHash, "hex");
  if (candidate.length === 0 || candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

/** A stored token is usable only if it is neither expired nor consumed. */
export function isTokenUsable(
  token: { expiresAt: Date | string; consumedAt: Date | string | null },
  now: number = Date.now()
): boolean {
  if (token.consumedAt) return false;
  const expiresAt = new Date(token.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt > now;
}

/** Absolute expiry date for a TTL (injectable clock for deterministic tests). */
export function expiryFrom(ttlMs: number, now: number = Date.now()): Date {
  return new Date(now + ttlMs);
}

/**
 * Whether login REQUIRES a validated signup email (EMAIL_VERIFICATION_REQUIRED).
 * Off by default: switching it on hard-blocks anyone whose validation email
 * never landed, so it stays an explicit operator decision. The migration
 * backfills pre-existing accounts as verified, so enabling it later only
 * affects accounts created after v1.4.
 */
export function emailVerificationRequired(
  env: Pick<NodeJS.ProcessEnv, string> = process.env
): boolean {
  const value = String(env.EMAIL_VERIFICATION_REQUIRED ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/** Trim + lowercase so rate-limit buckets and lookups do not fragment. */
export function normalizeEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * Base URL for emailed links (PUBLIC_BASE_URL), trailing slashes stripped.
 * Empty string when unset — link builders then fall back to localhost, and
 * the caller can decide whether an unset base is worth logging.
 */
export function publicBaseUrl(env: Pick<NodeJS.ProcessEnv, string> = process.env): string {
  return String(env.PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

function buildLink(baseUrl: string, pathname: string, token: string): string {
  const base = baseUrl || "http://localhost:3000";
  const url = new URL(pathname, base);
  url.searchParams.set("token", token);
  return url.toString();
}

/** Link the couple clicks to validate their signup email. */
export function buildVerifyEmailUrl(baseUrl: string, token: string): string {
  return buildLink(baseUrl, "/api/auth/verify-email", token);
}

/** Link the couple clicks to choose a new password. */
export function buildResetPasswordUrl(baseUrl: string, token: string): string {
  return buildLink(baseUrl, "/reset-password", token);
}

export interface EmailRateLimiter {
  allowed(email: string): boolean;
}

/**
 * Sliding-window in-memory rate limiter keyed by normalized email. Same
 * documented trade-off as createPhoneRateLimiter in otp.ts: fine on a single
 * Node instance; a multi-instance deploy would need a shared store.
 */
export function createEmailRateLimiter(opts: {
  limit: number;
  windowMs: number;
  /** Injectable clock for deterministic tests; defaults to Date.now(). */
  now?: () => number;
}): EmailRateLimiter {
  const { limit, windowMs } = opts;
  const clock = opts.now ?? Date.now;
  const buckets = new Map<string, number[]>();
  return {
    allowed(email: string): boolean {
      const key = normalizeEmail(email);
      if (!key) return false;
      const now = clock();
      const cutoff = now - windowMs;
      const timestamps = (buckets.get(key) ?? []).filter((t) => t > cutoff);
      if (timestamps.length >= limit) {
        // Keep the window alive without recording the rejected request twice.
        buckets.set(key, timestamps);
        return false;
      }
      timestamps.push(now);
      buckets.set(key, timestamps);
      return true;
    },
  };
}
