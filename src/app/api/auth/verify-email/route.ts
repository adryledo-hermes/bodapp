import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  hashEmailToken,
  isTokenUsable,
  verifyEmailToken,
} from "@/lib/auth-email";

// An emailed link must always be evaluated at request time, never cached.
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/verify-email?token=… — the link inside the validation email.
 *
 * Single-use + TTL enforced here: the token row is consumed and the user's
 * `emailVerifiedAt` is stamped in one transaction. Always redirects to the
 * login screen so a click never dead-ends, with `verified=1|0` telling the UI
 * which message to show. A bad token redirects just like an expired one —
 * this endpoint never reveals which part failed.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const redirectToLogin = (ok: boolean) =>
    NextResponse.redirect(
      new URL(`/login?verified=${ok ? "1" : "0"}`, request.url)
    );

  if (!token) return redirectToLogin(false);

  try {
    const tokenHash = hashEmailToken(token);
    const record = await prisma.authEmailToken.findFirst({
      where: { tokenHash, kind: "verify_email" },
      include: { user: true },
    });

    if (
      !record ||
      !verifyEmailToken(token, record.tokenHash) ||
      !isTokenUsable(record)
    ) {
      return redirectToLogin(false);
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.authEmailToken.update({
        where: { id: record.id },
        data: { consumedAt: now },
      });
      // Keep an existing timestamp: re-clicking a fresh link must not move it.
      if (!record.user.emailVerifiedAt) {
        await tx.user.update({
          where: { id: record.userId },
          data: { emailVerifiedAt: now },
        });
      }
    });

    return redirectToLogin(true);
  } catch (err) {
    console.error("[verify-email] failed:", err);
    return redirectToLogin(false);
  }
}