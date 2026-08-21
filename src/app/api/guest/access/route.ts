import { NextResponse } from "next/server";
import { z } from "zod";
import { findInvitationByToken } from "@/lib/otp-flow-db";
import { guestOtpBypassEnabled } from "@/lib/guest-access";
import { INVITATION_ACCESS_COOKIE } from "@/lib/otp-session";
import { SignJWT } from "jose";
import { cookieSecure } from "@/lib/cookie-secure";

const schema = z.object({
  token: z.string().min(1),
  slug: z.string().min(1),
});

const COOKIE_MAX_AGE = 30 * 60; // 30 minutes

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is required in production (invitation access JWT).");
    }
    return new TextEncoder().encode("dev-insecure-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

async function signAccessToken(payload: {
  invitationId: string;
  weddingId: string;
  phone: string;
}): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(getSecret());
}

function publicBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(req.url).origin;
}

/**
 * GET /api/guest/access?token=...&slug=...
 *
 * Used ONLY when REQUIRE_GUEST_OTP=false. Signs the access JWT inline and
 * includes it as a Set-Cookie header on the redirect response — this avoids
 * the cookies().set() + NextResponse.redirect incompatibility that caused
 * the "too many redirects" loop (the cookie was silently dropped).
 */
export async function GET(req: Request) {
  if (!guestOtpBypassEnabled()) {
    return NextResponse.json({ error: "otp is required" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = schema.safeParse({
    token: searchParams.get("token"),
    slug: searchParams.get("slug"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }

  const { token, slug } = parsed.data;

  const invitation = await findInvitationByToken(token);
  if (!invitation) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const phone = (invitation.acceptedPhones ?? [])[0] ?? "otp-disabled";
  const jwt = await signAccessToken({
    invitationId: invitation.id,
    weddingId: invitation.weddingId,
    phone,
  });

  const base = publicBaseUrl(req);
  const dest = `${base}/w/${slug}/invitation?g=${encodeURIComponent(token)}`;

  return NextResponse.redirect(dest, {
    status: 302,
    headers: {
      "Set-Cookie": `${INVITATION_ACCESS_COOKIE}=${jwt}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${
        cookieSecure() ? "; Secure" : ""
      }`,
    },
  });
}