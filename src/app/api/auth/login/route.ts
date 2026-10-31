import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { emailVerificationRequired } from "@/lib/auth-email";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  // v1.4: with EMAIL_VERIFICATION_REQUIRED on, an unvalidated signup email
  // blocks the sign-in (the login screen offers a resend for that case).
  if (emailVerificationRequired() && !user.emailVerifiedAt) {
    return NextResponse.json({ error: "email_not_verified" }, { status: 401 });
  }

  await createSession({
    userId: user.id,
    weddingId: user.weddingId,
    role: user.role,
  });

  return NextResponse.json({
    ok: true,
    redirect: "/panel",
    emailVerified: Boolean(user.emailVerifiedAt),
  });
}
