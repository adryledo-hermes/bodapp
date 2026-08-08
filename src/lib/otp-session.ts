import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cookieSecure } from "./cookie-secure";

/**
 * Short-lived signed access for a guest who has passed the OTP challenge
 * (Task 9). This is NOT the couple/planner session (src/lib/session.ts) — it is
 * scoped to a single guest invitation, so it can never authorize the panel.
 */

const COOKIE_NAME = "invitation_access";
const MAX_AGE = 30 * 60; // 30 minutes

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  // Fail closed in production (FIX I1): this guards a public gate, so a missing
  // SESSION_SECRET must never fall back to a predictable dev value there.
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET is required in production (invitation access JWT).",
      );
    }
    // Dev/test only: keep a stable fallback so local runs and tests work.
    return new TextEncoder().encode("dev-insecure-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

export interface InvitationAccessPayload {
  invitationId: string;
  weddingId: string;
  phone: string;
  [key: string]: string; // jose JWTPayload compat
}

/** Sign and set the guest invitation-access cookie (httpOnly). */
export async function createInvitationAccess(
  payload: InvitationAccessPayload
): Promise<void> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Verify and return the guest-access payload, or null when absent/invalid. */
export async function getInvitationAccess(): Promise<InvitationAccessPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as InvitationAccessPayload;
  } catch {
    return null;
  }
}

/** Clear the guest-access cookie (e.g. expiry or explicit logout). */
export async function clearInvitationAccess(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

export { COOKIE_NAME as INVITATION_ACCESS_COOKIE };
