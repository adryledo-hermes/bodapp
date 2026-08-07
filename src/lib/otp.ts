/**
 * Pure, typed helpers for the public OTP-SMS invitation flow (Task 9).
 * No React/Next/Db imports here so this module is fully unit-testable and free
 * of server/client concerns (mirrors src/lib/invitation.ts, seating.ts, ...).
 *
 * Security invariants enforced here:
 *  - OTP codes are 6-digit strings; only a SHA-256 hash is ever persisted.
 *  - Phone allowlist check (isPhoneAllowed) is the gate BEFORE any OTP is sent.
 *  - Rate limiting bounds how many OTP requests one phone can trigger per hour.
 */

import { createHash, randomInt, timingSafeEqual } from "crypto";

/** OTP lifetime: 10 minutes. */
export const otpTtlMs = 10 * 60 * 1000;

/** Max failed verify attempts before an OTP is invalidated. */
export const OTP_MAX_ATTEMPTS = 3;

/** Max OTP requests allowed per phone per rolling hour (v1 in-memory). */
export const OTP_RATE_LIMIT_PER_HOUR = 5;

export type Rng = () => number; // returns a value in [0, 1)

/**
 * Generate a 6-digit numeric OTP code as a zero-padded string.
 * The default RNG uses a cryptographic source; tests inject a deterministic
 * RNG returning a value in [0, 1).
 */
export function generateOtp(rng: Rng = cryptoRandom): string {
  const raw = Math.floor(clamp01(rng()) * 1_000_000);
  return String(raw).padStart(6, "0");
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v >= 1) return 0.999999;
  return v;
}

function cryptoRandom(): number {
  return randomInt(0, 1_000_000) / 1_000_000;
}

/** SHA-256 hash (hex) of an OTP code — what we store, never the plaintext. */
export function hashOtp(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

/**
 * Verify a code against a stored hash using a constant-time comparison so a
 * wrong-length or malformed hash can't leak timing information about the code.
 */
export function verifyOtp(code: string, hash: string): boolean {
  if (typeof code !== "string" || typeof hash !== "string") return false;
  const candidate = Buffer.from(hashOtp(code), "hex");
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

/**
 * Normalize a phone number for allowlist comparison: trim, drop inner spaces,
 * dashes and parentheses so "+34 612 345 678", "+34612345678" and
 * "(34) 612-345-678" all collapse to the same canonical form. Keeps a single
 * leading "+". Case is irrelevant for digits but we lowercase defensively.
 */
export function normalizePhone(phone: string): string {
  const cleaned = String(phone ?? "")
    .trim()
    .replace(/[\s\-()]/g, "")
    .toLowerCase();
  // Collapse any run of "+" to a single leading "+" if present.
  const plusCount = (cleaned.match(/\+/g) ?? []).length;
  const digits = cleaned.replace(/\+/g, "");
  return plusCount > 0 ? `+${digits}` : digits;
}

/**
 * THE multi-phone allowlist gate. True only when the normalized phone is a
 * member of the invitation's acceptedPhones list. Called BEFORE any OTP send.
 */
export function isPhoneAllowed(allowedPhones: string[], phone: string): boolean {
  if (!Array.isArray(allowedPhones)) return false;
  const norm = normalizePhone(phone);
  if (!norm) return false;
  return allowedPhones.some((p) => normalizePhone(p) === norm);
}

export interface PhoneRateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Injectable clock for deterministic tests; defaults to Date.now(). */
  now?: () => number;
}

/**
 * Sliding-window in-memory rate limiter keyed by normalized phone. V1 stores
 * request timestamps in a Map (per-process). Documented trade-off: on a single
 * Node instance this is fine; a multi-instance deploy would need a shared
 * store (e.g. Redis / a DB table). limit+windowMs are fixed at construction.
 */
export interface PhoneRateLimiter {
  allowed(phone: string): boolean;
}

export function createPhoneRateLimiter(
  opts: PhoneRateLimiterOptions
): PhoneRateLimiter {
  const { limit, windowMs } = opts;
  const clock = opts.now ?? Date.now;
  const buckets = new Map<string, number[]>();

  return {
    allowed(phone: string): boolean {
      const key = normalizePhone(phone);
      const now = clock();
      const cutoff = now - windowMs;
      const timestamps = (buckets.get(key) ?? []).filter((t) => t > cutoff);
      if (timestamps.length >= limit) {
        // Keep the window alive but don't record the rejected request twice.
        buckets.set(key, timestamps);
        return false;
      }
      timestamps.push(now);
      buckets.set(key, timestamps);
      return true;
    },
  };
}
