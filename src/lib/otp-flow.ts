import {
  OTP_MAX_ATTEMPTS,
  generateOtp,
  hashOtp,
  isPhoneAllowed,
  normalizePhone,
  verifyOtp,
} from "@/lib/otp";
import type { OtpChannel, OtpSmsTransport } from "@/lib/otp-channels";
import { logOtpRefusal } from "@/lib/otp-log";

/**
 * Core request/verify business logic for the public OTP invitation flow
 * (Task 9). This module is FREE OF I/O DEPS — no Prisma and no live transport —
 * so the security-critical gating (allowlist first, rate limiting, never
 * leaking validity) is unit-testable without a database or a Twilio call.
 * Defaults wired to Prisma/Twilio live in ./otp-flow-db.ts.
 *
 * The refusals below DO write operator log lines ([otp] REQUEST REFUSED …):
 * they answer the client with one uniform generic error on purpose, so without
 * a server-side line an operator can never tell "link expired", "phone not on
 * the invitation" and "rate limited" apart — and a guest who simply never
 * receives the code leaves no trace at all.
 */

export interface OtpInvitation {
  id: string;
  weddingId: string;
  acceptedPhones: string[];
}

export type OtpInvitationLookup = (
  token: string
) => Promise<OtpInvitation | null>;

/** A pending, not-yet-consumed OTP for a phone+invitation. */
export interface PendingOtp {
  id: string;
  codeHash: string;
  attempts: number;
}

export interface OtpFlowDeps {
  /** Resolve the invitation by token, tenant-scoped to the wedding slug. */
  findInvitation: OtpInvitationLookup;
  /** Create a hashed OTP row; returns its id. */
  createOtp: (data: {
    invitationId: string;
    phone: string;
    codeHash: string;
    expiresAt: Date;
  }) => Promise<string>;
  /** Latest unconsumed, unexpired OTP for this invitation+phone. */
  findPendingOtp: (
    invitationId: string,
    phone: string
  ) => Promise<PendingOtp | null>;
  /** Increment failed-attempt counter and return the new value. */
  incrementAttempts: (id: string) => Promise<number>;
  /** Mark an OTP row consumed. */
  consumeOtp: (id: string) => Promise<void>;
  /** Per-phone sliding-window rate limiter. */
  rateLimiter: {
    allowed(phone: string): boolean;
  };
  /** SMS transport (mocked in tests). */
  sendSms: OtpSmsTransport;
  /** Injectable OTP generator + hash/verify fns for tests. */
  gen: {
    generateOtp: () => string;
    hashOtp: (code: string) => string;
    verifyOtp: (code: string, hash: string) => boolean;
    isPhoneAllowed: (allowed: string[], phone: string) => boolean;
  };
  /** OTP lifetime in ms (defaults to 10 minutes). */
  otpTtlMs: number;
}

/**
 * The single response the flow returns for "cannot send" — invitation unknown
 * or phone not on the allowlist. Identical in both cases so an attacker cannot
 * tell a valid link from an invalid one, nor a valid phone from an invalid one.
 */
export type OtpRequestOutcome =
  | {
      ok: true;
      sent: boolean;
      normalizedPhone: string;
      /** Channel that actually delivered (undefined when nothing did). */
      channel?: OtpChannel;
    }
  | { ok: false; error: string };

const GENERIC_ERROR =
  "No se pudo procesar la solicitud. Comprueba el enlace o el teléfono.";
export { GENERIC_ERROR };

/** Clean set of real generator/hash/verify functions shared by default deps. */
export function baseGen() {
  return { generateOtp, hashOtp, verifyOtp, isPhoneAllowed };
}

/**
 * Handle an OTP request. ORDER OF OPERATIONS (security-critical):
 *   1. Resolve the invitation from the token (404-equivalent if unknown).
 *   2. GATE: phone MUST be on the invitation's acceptedPhones allowlist.
 *      If not — or if the invitation is unknown — return the SAME generic
 *      error and DO NOT generate or send any OTP.
 *   3. Rate-limit by normalized phone; if exceeded, refuse (no OTP).
 *   4. Generate + hash + persist + send. Never returns the plaintext code.
 */
export async function requestOtp(
  token: string,
  phone: string,
  deps: OtpFlowDeps
): Promise<OtpRequestOutcome> {
  const invitation = await deps.findInvitation(token);

  // Uniform response whether the link is invalid or the phone is not allowed
  // — but the SERVER log says which, since the client never may.
  if (!invitation) {
    logOtpRefusal("invitation_unknown", "no invitation for this token");
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!deps.gen.isPhoneAllowed(invitation.acceptedPhones, phone)) {
    logOtpRefusal(
      "phone_not_allowed",
      "phone is not on the invitation's accepted list"
    );
    return { ok: false, error: GENERIC_ERROR };
  }

  const normalizedPhone = normalizePhone(phone);
  if (!deps.rateLimiter.allowed(normalizedPhone)) {
    logOtpRefusal("rate_limited", "too many OTP requests for this phone");
    return {
      ok: false,
      error: "Demasiados intentos. Inténtalo de nuevo más tarde.",
    };
  }

  const code = deps.gen.generateOtp();
  const codeHash = deps.gen.hashOtp(code);
  const expiresAt = new Date(Date.now() + deps.otpTtlMs);

  await deps.createOtp({
    invitationId: invitation.id,
    phone: normalizedPhone,
    codeHash,
    expiresAt,
  });

  const sent = await deps.sendSms(normalizedPhone, code);
  return {
    ok: true,
    sent: sent.ok,
    normalizedPhone,
    channel: sent.channel,
  };
}

/**
 * Verify a submitted code against the pending OTP for this invitation+phone.
 * On success marks the OTP consumed. Increments the failed counter on a wrong
 * code. Any mismatch that could reveal state (unknown OTP, consumed, expired,
 * too many attempts, wrong code) collapses to the same generic result.
 */
export async function verifyOtpRequest(
  token: string,
  phone: string,
  code: string,
  deps: OtpFlowDeps
): Promise<{ ok: boolean; error?: string }> {
  const invitation = await deps.findInvitation(token);
  if (!invitation) {
    logOtpRefusal("verify_invitation_unknown", "no invitation for this token");
    return { ok: false, error: GENERIC_ERROR };
  }

  const normalizedPhone = normalizePhone(phone);
  const pending = await deps.findPendingOtp(invitation.id, normalizedPhone);
  if (!pending) {
    // Covers consumed and expired codes too — all collapse to "no pending".
    logOtpRefusal("verify_no_pending_code", "no live code for this phone");
    return { ok: false, error: GENERIC_ERROR };
  }
  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    logOtpRefusal("verify_locked_out", "attempt cap reached");
    return { ok: false, error: GENERIC_ERROR };
  }

  const valid = deps.gen.verifyOtp(code, pending.codeHash);
  if (!valid) {
    await deps.incrementAttempts(pending.id);
    // A cluster of these is a brute-force attempt — the reason is server-side
    // only; the client still sees the uniform generic error.
    logOtpRefusal("verify_wrong_code", "code mismatch");
    return { ok: false, error: GENERIC_ERROR };
  }

  await deps.consumeOtp(pending.id);
  return { ok: true };
}
