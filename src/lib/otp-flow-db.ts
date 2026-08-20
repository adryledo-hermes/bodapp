import { prisma } from "@/lib/db";
import {
  OTP_MAX_ATTEMPTS,
  OTP_RATE_LIMIT_PER_HOUR,
  createPhoneRateLimiter,
  otpTtlMs,
} from "@/lib/otp";
import { sendOtpSms } from "@/lib/otp-sms";
import { baseGen, type OtpFlowDeps } from "@/lib/otp-flow";

/**
 * Prisma/Twilio-wired dependency provider for the OTP flow. Kept separate from
 * otp-flow.ts (which is pure) so tests import only the pure module.
 */

/**
 * Module-level SINGLETON rate limiter (FIX C1). Built once at import time and
 * shared by every `defaultOtpDeps()` call. Constructing a fresh limiter inside
 * `defaultOtpDeps()` — as before — reset the in-memory window on every request,
 * which made the rate limit completely ineffective in production (unlimited
 * OTP sends and unlimited brute-force guesses). Sharing one instance keeps the
 * per-phone sliding-window state alive across requests.
 */
const sharedRateLimiter = createPhoneRateLimiter({
  limit: OTP_RATE_LIMIT_PER_HOUR,
  windowMs: 60 * 60 * 1000,
});

/**
 * Resolve an invitation by its token/id. Invitation.id is a globally-unique
 * UUID tied to exactly one wedding, so this inherent scoping is tenant-safe.
 */
export async function findInvitationByToken(
  token: string
): Promise<
  | { id: string; weddingId: string; acceptedPhones: string[]; content: unknown }
  | null
> {
  return prisma.invitation.findUnique({
    where: { id: token },
    select: { id: true, weddingId: true, acceptedPhones: true, content: true },
  });
}

/** Default deps wired to Prisma + real rate limiter + real Twilio transport. */
export function defaultOtpDeps(): OtpFlowDeps {
  return {
    findInvitation: findInvitationByToken,
    createOtp: async ({ invitationId, phone, codeHash, expiresAt }) => {
      // Bound stale rows (FIX I3): invalidate any prior unconsumed OTP for this
      // invitation+phone so only the latest code stays usable and the OtpCode
      // table doesn't grow unboundedly with superseded, still-valid rows.
      await prisma.otpCode.updateMany({
        where: { invitationId, phone, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      const row = await prisma.otpCode.create({
        data: { invitationId, phone, codeHash, expiresAt },
      });
      return row.id;
    },
    findPendingOtp: async (invitationId, phone) => {
      const row = await prisma.otpCode.findFirst({
        where: {
          invitationId,
          phone,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, codeHash: true, attempts: true },
      });
      return row;
    },
    incrementAttempts: async (id) => {
      // Atomic lockout (FIX I2): only increment while attempts are below the
      // cap, so a race between concurrent verify requests can never push the
      // counter past OTP_MAX_ATTEMPTS. Returns the number of rows updated —
      // 0 when the OTP is already at/over the cap (i.e. locked out).
      const updated = await prisma.otpCode.updateMany({
        where: { id, attempts: { lt: OTP_MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      return updated.count;
    },
    consumeOtp: async (id) => {
      await prisma.otpCode.update({
        where: { id },
        data: { consumedAt: new Date() },
      });
    },
    rateLimiter: sharedRateLimiter,
    sendSms: sendOtpSms,
    gen: baseGen(),
    otpTtlMs,
  };
}
