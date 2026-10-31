import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  EMAIL_RATE_LIMIT_PER_HOUR,
  buildResetPasswordUrl,
  createEmailRateLimiter,
  expiryFrom,
  generateEmailToken,
  hashEmailToken,
  normalizeEmail,
  PASSWORD_RESET_TTL_MS,
  publicBaseUrl,
} from "@/lib/auth-email";
import { sendPasswordResetEmail } from "@/lib/email/account";
import { normalizeSlug } from "@/lib/onboarding";

const HOUR_MS = 60 * 60 * 1000;

// Same in-memory trade-off as the OTP phone limiter: per-process, per hour.
const limiter = createEmailRateLimiter({
  limit: EMAIL_RATE_LIMIT_PER_HOUR,
  windowMs: HOUR_MS,
});

const schema = z.object({ email: z.string().email() });

/**
 * POST /api/auth/password/forgot — the "forgot password" link on /login.
 *
 * ALWAYS answers `{ ok: true }` for a well-formed address: an attacker must
 * not be able to learn which emails have accounts here. When the account does
 * exist we issue a single-use 60-minute token (only its SHA-256 hash is
 * stored), invalidate any older reset link, and email it through the provider
 * abstraction layer.
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
    if (!user) return NextResponse.json({ ok: true });

    await prisma.authEmailToken.updateMany({
      where: { userId: user.id, kind: "password_reset", consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const token = generateEmailToken();
    await prisma.authEmailToken.create({
      data: {
        userId: user.id,
        kind: "password_reset",
        tokenHash: hashEmailToken(token),
        expiresAt: expiryFrom(PASSWORD_RESET_TTL_MS),
      },
    });

    // The locale is per-wedding; fall back to Spanish (the app default).
    const locale = user.weddingId ? await weddingLocale(user.weddingId) : "es";

    const sent = await sendPasswordResetEmail({
      to: user.email,
      url: buildResetPasswordUrl(publicBaseUrl(), token),
      locale,
    });
    if (!sent) console.warn("[password/forgot] provider did not accept the email");
  } catch (err) {
    console.error("[password/forgot] failed:", err);
  }

  return NextResponse.json({ ok: true });
}

/** Wedding locale for the email copy; "es" when it cannot be read. */
async function weddingLocale(weddingId: string): Promise<"es" | "en"> {
  try {
    const wedding = await prisma.wedding.findUnique({
      where: { id: weddingId },
      select: { locale: true },
    });
    return normalizeSlug(wedding?.locale ?? "es") === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}