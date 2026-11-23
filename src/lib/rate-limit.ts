/**
 * In-memory sliding-window rate limiter for the Next.js proxy
 * (src/proxy.ts — Next 16 renamed the middleware convention to proxy).
 *
 * Single-instance deployment (one Docker container), so in-memory state is
 * sufficient — state resets on container restart, which is acceptable for
 * rate limiting (an attacker can't accumulate quota across restarts either).
 *
 * Tiers (per-IP, sliding 60s window):
 *   sensitive — auth, OTP, RSVP, guest-access, setup: 10 req/min
 *   api       — general CRUD endpoints:                60 req/min
 *   page      — SSR/page navigation:                  120 req/min
 *
 * Exempt: /healthz (Docker/Caddy health checks), static assets (handled by
 * the proxy matcher, never reach this code).
 */

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  /** Unix timestamp (seconds) when the current window resets. */
  resetAt: number;
}

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  sensitive: { windowMs: 60_000, max: 10 },
  api: { windowMs: 60_000, max: 60 },
  page: { windowMs: 60_000, max: 120 },
};

/** Paths completely exempt from rate limiting. */
export const EXEMPT_PREFIXES = ["/healthz"];

/**
 * Path prefixes that get the strictest (sensitive) tier.
 * These are public/unauthenticated endpoints where abuse matters most:
 * credential stuffing, OTP brute-force, RSVP spam, token guessing.
 */
export const SENSITIVE_PREFIXES = [
  "/api/auth/",
  "/api/otp/",
  "/api/setup",
  "/api/rsvp",
  "/api/guest/access",
];

/**
 * Classify a pathname into a rate-limit tier.
 * Returns null for exempt paths (no rate limiting applied).
 */
export function getTier(pathname: string): string | null {
  for (const p of EXEMPT_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/")) return null;
  }
  for (const p of SENSITIVE_PREFIXES) {
    if (pathname.startsWith(p)) return "sensitive";
  }
  if (pathname.startsWith("/api/")) return "api";
  return "page";
}

// ---------------------------------------------------------------------------
// Sliding-window store
// ---------------------------------------------------------------------------

// key (ip:tier) -> timestamps (ms) of requests inside the current window
const store = new Map<string, number[]>();

let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60_000; // at most once every 5 min
const EXPIRY_MS = 120_000; // keep entries for 2× the longest window (60 s)

/** Remove stale entries so the Map never grows unboundedly. */
function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, timestamps] of store) {
    const newest = timestamps.length
      ? timestamps[timestamps.length - 1]
      : 0;
    if (now - newest > EXPIRY_MS) store.delete(key);
  }
}

/**
 * Check a request against the rate limit for `key`.
 * When allowed, the request is recorded (consumes quota).
 * `now` is injectable for deterministic tests.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  now: number = Date.now()
): RateLimitResult {
  cleanup(now);

  const windowStart = now - config.windowMs;
  let timestamps = store.get(key);
  if (!timestamps) {
    timestamps = [];
    store.set(key, timestamps);
  }

  // Drop timestamps that have fallen out of the sliding window.
  // (In-place compaction keeps allocation minimal.)
  let write = 0;
  for (let read = 0; read < timestamps.length; read++) {
    if (timestamps[read] > windowStart) {
      timestamps[write++] = timestamps[read];
    }
  }
  timestamps.length = write;

  if (timestamps.length >= config.max) {
    const oldest = timestamps[0];
    const resetAtMs = oldest + config.windowMs;
    return {
      allowed: false,
      limit: config.max,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((resetAtMs - now) / 1000)
      ),
      resetAt: Math.ceil(resetAtMs / 1000),
    };
  }

  timestamps.push(now);
  return {
    allowed: true,
    limit: config.max,
    remaining: config.max - timestamps.length,
    retryAfterSeconds: 0,
    resetAt: Math.ceil((now + config.windowMs) / 1000),
  };
}

/** Clear all state — used by tests. */
export function resetStore(): void {
  store.clear();
  lastCleanup = Date.now();
}

/**
 * Extract the real client IP from a request's headers.
 *
 * Takes the RIGHTMOST X-Forwarded-For entry: Caddy (our only reverse proxy
 * — the app port is loopback-only) appends the TCP peer it actually saw
 * after any value the client sent, so the rightmost position cannot be
 * forged. Taking leftmost would trust a spoofable header and let an
 * attacker mint unlimited fresh buckets.
 *
 * Missing/blank header → "unknown": all header-less callers share one
 * bucket, which is the safe direction (shared quota, not a free pass).
 *
 * Structural parameter type keeps this module dependency-free and
 * unit-testable without next/server; NextRequest satisfies it.
 */
export function getClientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    const last = parts[parts.length - 1];
    if (last && last.trim()) return last.trim();
  }
  return "unknown";
}