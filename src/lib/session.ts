import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cookieSecure } from "./cookie-secure";

const SESSION_COOKIE = "bodapp_session";

// Expiration of the login session, configurable in days via env
// SESSION_MAX_AGE_DAYS (default 7). The cookie maxAge and the JWT exp are kept
// in lockstep so a cookie can never outlive its signed token (or vice versa).
function sessionMaxAgeSeconds(): number {
  const days = Number(process.env.SESSION_MAX_AGE_DAYS);
  const valid = Number.isFinite(days) && days > 0;
  return (valid ? days : 7) * 24 * 60 * 60;
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
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(maxAge)
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
