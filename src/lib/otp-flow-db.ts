import { prisma } from "@/lib/db";
import {
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
 * Resolve an invitation by its token/id. Invitation.id is a globally-unique
 * UUID tied to exactly one wedding, so this inherent scoping is tenant-safe.
 */
export async function findInvitationByToken(
  token: string
): Promise<{ id: string; weddingId: string; acceptedPhones: string[] } | null> {
  return prisma.invitation.findUnique({
    where: { id: token },
    select: { id: true, weddingId: true, acceptedPhones: true },
  });
}

/** Default deps wired to Prisma + real rate limiter + real Twilio transport. */
export function defaultOtpDeps(): OtpFlowDeps {
  return {
    findInvitation: findInvitationByToken,
    createOtp: async ({ invitationId, phone, codeHash, expiresAt }) => {
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
      const updated = await prisma.otpCode.update({
        where: { id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      return updated.attempts;
    },
    consumeOtp: async (id) => {
      await prisma.otpCode.update({
        where: { id },
        data: { consumedAt: new Date() },
      });
    },
    rateLimiter: createPhoneRateLimiter({
      limit: OTP_RATE_LIMIT_PER_HOUR,
      windowMs: 60 * 60 * 1000,
    }),
    sendSms: sendOtpSms,
    gen: baseGen(),
    otpTtlMs,
  };
}
