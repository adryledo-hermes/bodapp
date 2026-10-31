import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  EMAIL_RATE_LIMIT_PER_HOUR,
  createEmailRateLimiter,
  expiryFrom,
  generateEmailToken,
  hashEmailToken,
  normalizeEmail,
  publicBaseUrl,
  VERIFY_EMAIL_TTL_MS,
} from "@/lib/auth-email";
import { sendVerificationEmail } from "@/lib/email/account";

const HOUR_MS = 60 * 60 * 1000;

// Same in-memory trade-off as the OTP phone limiter: per-process, per hour.
const limiter = createEmailRateLimiter({
  limit: EMAIL_RATE_LIMIT_PER_HOUR,
  windowMs: HOUR_MS,
});

const schema = z.object({ email: z.string().email() });

/**
 * POST /api/auth/verify-email/resend — re-send the validation email.
 *
 * The response is ALWAYS `{ ok: true }`: whether the address exists, is
 * already verified, or is being throttled must not be observable from outside
 * (no account enumeration, no rate-limit oracle). Real failures are logged.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  if (!limiter.allowed(email)) return NextResponse.json({ ok: true });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) return NextResponse.json({ ok: true });

    // Only the newest link stays live: invalidate whatever we sent before.
    await prisma.authEmailToken.updateMany({
      where: { userId: user.id, kind: "verify_email", consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const token = generateEmailToken();
    await prisma.authEmailToken.create({
      data: {
        userId: user.id,
        kind: "verify_email",
        tokenHash: hashEmailToken(token),
        expiresAt: expiryFrom(VERIFY_EMAIL_TTL_MS),
      },
    });

    const sent = await sendVerificationEmail({
      to: user.email,
      url: `${publicBaseUrl()}/api/auth/verify-email?token=${token}`,
      locale: "es",
    });
    if (!sent) console.warn("[verify-email/resend] provider did not accept the email");
  } catch (err) {
    console.error("[verify-email/resend] failed:", err);
  }

  return NextResponse.json({ ok: true });
}