/**
 * Failure logging for outbound email.
 *
 * Why this exists: the provider layer deliberately NEVER throws (a dead
 * provider must not fail a signup or a password reset), so failures travel
 * back to the caller as a plain `{ ok:false, error, code }` value. That made
 * a broken deployment silent — the route answered 200 and nothing useful
 * reached the logs. This module is the one place that turns that value into
 * an operator-visible ERROR line.
 *
 * SECURITY — what a log line may contain:
 *   ✓ provider name, error code, a short redacted reason (e.g. the base URL
 *     that could not be reached, an HTTP status);
 *   ✗ recipients/senders (email addresses), reset/verification links or any
 *     URL query string (tokens live there), API keys, bearer headers,
 *     connection strings — all scrubbed by `redactEmailLog`.
 *
 * The HTTP response itself is untouched: routes keep answering `{ ok:true }`
 * for well-formed input so nobody can enumerate which addresses have
 * accounts here. Observability is server-side only.
 */

import type { EmailProviderResult } from "./types";

/** Env values that must never appear in a log line. */
const SECRET_ENV_KEYS = [
  "SENDPULSE_API_KEY",
  "SESSION_SECRET",
  "DATABASE_URL",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_ACCOUNT_SID",
];

const MAX_DETAIL_CHARS = 240;

/**
 * Scrub a free-text provider error before it reaches the logs:
 * known secret values, bearer tokens, URL query strings (reset tokens) and
 * every email address. Exported for tests.
 */
export function redactEmailLog(text: string): string {
  let out = String(text ?? "");

  // Exact secret values from the environment (API keys, DSNs, session secret).
  for (const key of SECRET_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.length >= 4) {
      out = out.split(value).join("***");
    }
  }

  // Authorization headers that can ride along inside an error body.
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***");

  // Query strings carry single-use tokens (?token=…, ?access_token=…).
  out = out.replace(/\?[A-Za-z0-9_\-=&%./+]+/g, "?<redacted>");

  // Any address — we never log who was written to (recipient OR sender).
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");

  out = out.replace(/\s+/g, " ").trim();
  return out.length > MAX_DETAIL_CHARS
    ? `${out.slice(0, MAX_DETAIL_CHARS)}…`
    : out;
}

/**
 * Emit one ERROR line for a failed send. Called by the abstraction layer, so
 * every caller (setup, verification resend, password reset, …) gets it for
 * free. Never throws: a logging problem must not break the request.
 */
export function logEmailFailure(
  provider: string,
  result: EmailProviderResult
): void {
  try {
    const detail = redactEmailLog(result.error ?? "no detail");
    const code = result.code ?? "unknown";
    console.error(
      `[email] SEND FAILED provider=${provider} code=${code} detail="${detail}"`
    );
  } catch {
    // Logging is best-effort by design.
  }
}