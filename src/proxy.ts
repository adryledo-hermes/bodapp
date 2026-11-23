import { NextResponse, type NextRequest } from "next/server";
import {
  RATE_LIMITS,
  checkRateLimit,
  getClientIp,
  getTier,
} from "@/lib/rate-limit";

/**
 * IP-based rate limiting that runs BEFORE any route handler.
 *
 * Next.js 16 convention: this lives in `src/proxy.ts` (the `middleware.ts`
 * file convention was deprecated and renamed to `proxy` in v16 — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 *
 * Rejected requests never touch the database, auth checks, or business
 * logic — a flood costs one Map lookup and returns 429. Complements (does
 * not replace) the per-phone OTP limit and per-email send limits, which
 * throttle by resource rather than by source; the tiers and window logic
 * live in @/lib/rate-limit (pure, unit-tested).
 *
 * Client IP comes from the RIGHTMOST X-Forwarded-For entry — Caddy is our
 * only reverse proxy (app port is loopback-only) and it appends the TCP
 * peer it actually saw, so that position cannot be forged by a client.
 *
 * Static assets (_next/static, _next/image, favicon) are excluded by the
 * matcher below and never execute this code; /healthz is exempted in
 * getTier so Docker/Caddy/deploy health probes are never throttled.
 */
export function proxy(req: NextRequest) {
  const tier = getTier(req.nextUrl.pathname);
  if (tier === null) return NextResponse.next(); // exempt (e.g. /healthz)

  const ip = getClientIp(req);
  const config = RATE_LIMITS[tier];
  const result = checkRateLimit(`${ip}:${tier}`, config);

  if (!result.allowed) {
    return new NextResponse(
      JSON.stringify({ error: "Too Many Requests" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfterSeconds),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(result.resetAt),
        },
      }
    );
  }

  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", String(result.limit));
  res.headers.set("X-RateLimit-Remaining", String(result.remaining));
  res.headers.set("X-RateLimit-Reset", String(result.resetAt));
  return res;
}

export const config = {
  // Match every route except static assets (which don't need rate limiting).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};