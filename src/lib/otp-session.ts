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

/**
 * "Trust this device" cookie — set once, after the guest has passed the OTP
 * challenge with the remember option ticked, so the SAME device is not asked
 * for a code on every visit. Verified with the same secret and the same
 * invitation-scoped payload as the short cookie; only the lifetime differs
 * (GUEST_TRUST_DAYS, default 30 days).
 */
const TRUST_COOKIE_NAME = "invitation_device";
const TRUST_DEFAULT_DAYS = 30;
const TRUST_MAX_DAYS = 730; // hard ceiling: never an effectively-permanent grant

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
  const direct = await readVerified(cookieStore.get(COOKIE_NAME)?.value);
  // Fall back to the trusted-device cookie: a device that verified once keeps
  // its (invitation-scoped) access until the trust TTL expires. Callers still
  // compare invitationId/weddingId against the invitation being opened, so a
  // trust grant for one invitation never unlocks another.
  return direct ?? (await readVerified(cookieStore.get(TRUST_COOKIE_NAME)?.value));
}

/** Verify one signed cookie token, or null when absent/invalid/expired. */
async function readVerified(
  token: string | undefined
): Promise<InvitationAccessPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as InvitationAccessPayload;
  } catch {
    return null;
  }
}

/**
 * Trusted-device lifetime in seconds, from GUEST_TRUST_DAYS
 * (default 30 days, clamped to 1..730). Non-numeric/absent → default.
 */
export function invitationTrustMaxAge(): number {
  const raw = process.env.GUEST_TRUST_DAYS;
  const parsed = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  const days =
    Number.isFinite(parsed) && parsed >= 1
      ? Math.min(Math.floor(parsed), TRUST_MAX_DAYS)
      : TRUST_DEFAULT_DAYS;
  return days * 24 * 60 * 60;
}

/**
 * Sign and set the long-lived trusted-device cookie (httpOnly). Called only
 * from route handlers (cookies().set is unsafe during server render) and only
 * after a successful OTP verification with rememberDevice requested.
 */
export async function createInvitationTrust(
  payload: InvitationAccessPayload
): Promise<void> {
  const maxAge = invitationTrustMaxAge();
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(TRUST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge,
  });
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

export {
  COOKIE_NAME as INVITATION_ACCESS_COOKIE,
  TRUST_COOKIE_NAME as INVITATION_TRUST_COOKIE,
};
