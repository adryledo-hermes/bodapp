import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyOtpRequest } from "@/lib/otp-flow";
import {
  defaultOtpDeps,
  findInvitationByToken,
} from "@/lib/otp-flow-db";
import { createInvitationAccess } from "@/lib/otp-session";

// POST /api/otp/verify — public, no session. Verifies a submitted code and, on
// success, issues the short-lived guest invitation-access cookie.
const verifySchema = z.object({
  token: z.string().min(1),
  phone: z.string().min(3),
  code: z.string().min(4).max(8),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const { token, phone, code } = parsed.data;
  const outcome = await verifyOtpRequest(token, phone, code, defaultOtpDeps());

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }

  // Resolve the invitation's ids to scope the access cookie. verifyOtpRequest
  // only succeeds when the invitation exists, so it is safe to use its ids
  // directly — fail closed rather than silently issuing a bogus-scoped cookie.
  const invitation = await findInvitationByToken(token);
  if (!invitation) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  await createInvitationAccess({
    invitationId: invitation.id,
    weddingId: invitation.weddingId,
    phone,
  });

  return NextResponse.json({ ok: true });
}
