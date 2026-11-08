/**
 * Logging for swallowed server-side failure paths.
 *
 * WHY THIS EXISTS: a route that answers a well-formed error (500/404/401)
 * from inside a `catch` is invisible — the caller gets its JSON, the exception
 * never reaches Next's own error logging, and Dozzle stays empty. This module
 * is the standard line format for those paths, so an operator can grep one
 * shape across the whole app:
 *
 *   [photos] FAILED code=save_failed detail="storage write failed: EACCES …"
 *   [auth]   WARN   code=login_failed detail="bad password for a***@example.com"
 *
 * FAILED  → console.error — data loss or a broken feature (5xx paths).
 * WARN    → console.warn  — degraded but self-healing (orphan file left on
 *           disk, a link that could not be resolved, an expected auth refusal
 *           worth watching for).
 *
 * WHAT IS DELIBERATELY NOT LOGGED (see PR notes):
 *   - client-input 400s (`invalid json`, zod) — routine, no signal;
 *   - `jwtVerify` failures in session.ts/otp-session.ts — the normal path for
 *     every anonymous visitor; logging would bury everything else;
 *   - business 409s in setup (email_exists / slug_conflict);
 *   - uncaught exceptions — Next logs those itself.
 *
 * Details pass through `redactLogText`, so no secret/phone/email/token can
 * reach the log even if the underlying error contains one. Never throws.
 */

import { errText, redactLogText } from "./redact";

/** Emit `[area] FAILED code=… detail="…"` (console.error). */
export function logFailure(area: string, code: string, detail?: string): void {
  try {
    console.error(
      `[${area}] FAILED code=${code} detail="${redactLogText(detail ?? "no detail")}"`
    );
  } catch {
    // Logging is best-effort by design.
  }
}

/** Emit `[area] WARN code=… detail="…"` (console.warn). */
export function logWarn(area: string, code: string, detail?: string): void {
  try {
    console.warn(
      `[${area}] WARN code=${code} detail="${redactLogText(detail ?? "no detail")}"`
    );
  } catch {
    // Logging is best-effort by design.
  }
}

/**
 * Identify an account in a log line WITHOUT writing its address: the first
 * local character plus the domain (`ana@example.com` → `a***@example.com`).
 * Enough for an owner/ops to recognise the account; not enough to harvest
 * addresses from the logs. Survives `redactLogText` (its `*`s break the
 * address-matching rule) — asserted by tests.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "[email]";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local[0]}***@${domain}`;
}

export { errText };