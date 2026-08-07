import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOtp } from "@/lib/otp-flow";
import { defaultOtpDeps } from "@/lib/otp-flow-db";

// POST /api/otp/request — public, no session. Requests an OTP code for a phone
// against an invitation's allowlist. Never returns the code; uniform 400 for
// an unknown token vs a disallowed phone (anti-probing).
const requestSchema = z.object({
  token: z.string().min(1),
  phone: z.string().min(3),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const { token, phone } = parsed.data;
  const outcome = await requestOtp(token, phone, defaultOtpDeps());

  if (!outcome.ok) {
    // GENERIC_ERROR for unknown token / disallowed phone; rate-limit message
    // for an over-limit phone. Same 400 status either way — no probing signal.
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, sent: outcome.sent });
}
