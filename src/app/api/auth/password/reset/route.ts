import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  hashEmailToken,
  isTokenUsable,
  verifyEmailToken,
} from "@/lib/auth-email";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

/**
 * POST /api/auth/password/reset — submits the form at /reset-password.
 *
 * The token is looked up by its hash (so plaintext is never stored), must be
 * of kind password_reset, unconsumed and unexpired. On success the password is
 * re-hashed AND every outstanding reset link for that user is consumed, so a
 * single email can only be spent once — even if it was copied beforehand.
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

  const { token, password } = parsed.data;

  try {
    const tokenHash = hashEmailToken(token);
    const record = await prisma.authEmailToken.findFirst({
      where: { tokenHash, kind: "password_reset" },
    });

    if (
      !record ||
      !verifyEmailToken(token, record.tokenHash) ||
      !isTokenUsable(record)
    ) {
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await tx.authEmailToken.updateMany({
        where: { userId: record.userId, kind: "password_reset", consumedAt: null },
        data: { consumedAt: now },
      });
    });

    return NextResponse.json({ ok: true, redirect: "/login?reset=1" });
  } catch (err) {
    console.error("[password/reset] failed:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}