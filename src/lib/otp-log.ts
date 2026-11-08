/**
 * Failure logging for the OTP delivery path (invitation link → WhatsApp code).
 *
 * Why this exists: every layer of that path is deliberately non-throwing —
 * the Twilio providers answer `{ ok:false, error }`, `sendOtp` walks the
 * channels and returns `{ ok:false }`, and `POST /api/otp/request` still
 * answers a well-formed 400/200. That is correct behaviour for a public flow,
 * but it made a broken deployment *silent*: the guest simply never receives
 * the code and the operator sees nothing in the logs. This module is the one
 * place that turns those values into operator-visible lines, so "no WhatsApp
 * arrived" is diagnosable from Dozzle without reproducing it by hand.
 *
 * Line shapes (greppable, mirroring [email] SEND FAILED):
 *   [otp] SEND FAILED channel=whatsapp provider=twilio code=http_error detail="…"
 *   [otp] SEND FAILED code=no_channel detail="…"
 *   [otp] REQUEST REFUSED reason=phone_not_allowed
 *   [otp] SEND OK channel=whatsapp provider=twilio duration_ms=412
 *
 * SECURITY — what an OTP log line may contain:
 *   ✓ channel, provider, machine code, a short redacted reason (HTTP status,
 *     Twilio error code/message, which env flag is off);
 *   ✗ phone numbers (the guest's PII), the 6-digit code itself, invitation
 *     tokens (they ARE the link), credentials — all scrubbed by
 *     `redactOtpLog`. The HTTP response is untouched: the API keeps its
 *     uniform answers so no prober can tell an unknown link from a
 *     disallowed phone. Observability is server-side only.
 */

import { redactLogText } from "./redact";

// Redaction itself lives in ./redact so every log helper in the app (this
// module and ./failure-log) scrubs by the SAME rules instead of drifting.
// The otp-specific name stays for its callers and tests.
export { redactLogText as redactOtpLog };

/** One delivery failure — channel/provider when a provider was involved. */
export interface OtpFailureLog {
  /** whatsapp | sms (unset for pre-flight failures like "no channel"). */
  channel?: string;
  /** Provider name, or "(none)" when none was configured. */
  provider?: string;
  /** Machine code: http_error, credentials_missing, no_channel, … */
  code?: string;
  /** Human reason — redacted before it is written. */
  detail?: string;
}

/**
 * Emit one ERROR line for a failed OTP delivery. Called by the channel layer,
 * so every caller (the invitation OTP request) gets it for free.
 * Never throws: a logging problem must not break the request.
 */
export function logOtpFailure(failure: OtpFailureLog): void {
  try {
    const parts = ["[otp] SEND FAILED"];
    if (failure.channel) parts.push(`channel=${failure.channel}`);
    parts.push(`provider=${failure.provider ?? "(none)"}`);
    parts.push(`code=${failure.code ?? "unknown"}`);
    parts.push(`detail="${redactLogText(failure.detail ?? "no detail")}"`);
    console.error(parts.join(" "));
  } catch {
    // Logging is best-effort by design.
  }
}

/**
 * The request was refused BEFORE any send (unknown link, phone not on the
 * invitation's allowlist, rate limit). Server-side only — the HTTP response
 * stays the uniform generic error, so these lines are invisible to clients.
 */
export function logOtpRefusal(reason: string, detail?: string): void {
  try {
    const suffix = detail ? ` detail="${redactLogText(detail)}"` : "";
    console.error(`[otp] REQUEST REFUSED reason=${reason}${suffix}`);
  } catch {
    // Logging is best-effort by design.
  }
}

/**
 * A provider ACCEPTED the message (Twilio answered 2xx). Logged too: when a
 * guest still receives nothing, this line proves the app side worked and the
 * problem is on the provider's side (e.g. a sandbox the recipient never
 * joined), which is a completely different fix than a code bug.
 */
export function logOtpSent(
  channel: string,
  provider: string,
  durationMs: number
): void {
  try {
    console.log(
      `[otp] SEND OK channel=${channel} provider=${provider} duration_ms=${durationMs}`
    );
  } catch {
    // Logging is best-effort by design.
  }
}