import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cookieSecure } from "./cookie-secure";

const SESSION_COOKIE = "bodapp_session";

// Expiration of the login session, configurable in HOURS via env
// SESSION_MAX_AGE_HOURS (default 1). The cookie maxAge and the JWT exp are kept
// in lockstep so a cookie can never outlive its signed token (or vice versa).
function sessionMaxAgeSeconds(): number {
  const hours = Number(process.env.SESSION_MAX_AGE_HOURS);
  const valid = Number.isFinite(hours) && hours > 0;
  return (valid ? hours : 1) * 60 * 60;
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  weddingId: string;
  role: string;
  [key: string]: string; // jose JWTPayload compat
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const maxAge = sessionMaxAgeSeconds();
  // jose's setExpirationTime treats a NUMBER as an absolute Unix timestamp
  // (seconds since epoch), not a relative duration — so passing the raw seconds
  // would expire the token in 1970 and break login. Pass an absolute value:
  // now + maxAge. (A relative string like "1h" also works; absolute is exact.)
  const expiresAt = Math.floor(Date.now() / 1000) + maxAge;
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

export { SESSION_COOKIE };
