import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "./session";

/**
 * Require an authenticated couple/planner session.
 * Returns the session payload, or a 401 NextResponse if unauthenticated.
 */
export async function requireSession(): Promise<
  | { session: SessionPayload; error: null }
  | { session: null; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { session, error: null };
}

/** Tenant-scope where clause helper: every panel query must include weddingId. */
export function tenantWhere(session: SessionPayload, extra = {}) {
  // Spread extra FIRST so the session's weddingId always wins — a caller can
  // never scope a query to another tenant.
  return { ...extra, weddingId: session.weddingId };
}
