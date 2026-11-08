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

/** Env values that must never appear in a log line. */
const SECRET_ENV_KEYS = [
  "TWILIO_AUTH_TOKEN",
  "TWILIO_ACCOUNT_SID",
  "SENDPULSE_API_KEY",
  "SESSION_SECRET",
  "DATABASE_URL",
];

const MAX_DETAIL_CHARS = 240;

/**
 * Scrub a free-text provider/flow reason before it reaches the logs:
 * known secret values, bearer tokens, URL query strings (invitation links),
 * every email address and every phone number. Exported for tests.
 */
export function redactOtpLog(text: string): string {
  let out = String(text ?? "");

  // Exact secret values from the environment (Twilio creds, DSN, keys).
  for (const key of SECRET_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.length >= 4) {
      out = out.split(value).join("***");
    }
  }

  // Authorization headers that can ride along inside an error body.
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***");

  // Query strings carry single-use tokens (?token=…, /i/<uuid>).
  out = out.replace(/\?[A-Za-z0-9_\-=&%./+]+/g, "?<redacted>");

  // Any address — we never log who was written to.
  out = out.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    "[email]"
  );

  // Phone numbers: the WhatsApp addressing form first, then any E.164 run
  // (+3461223344), then a bare 7+ digit run (local format / spaced groups).
  out = out.replace(/whatsapp:\+?\d[\d\s.-]*/gi, "whatsapp:+***");
  out = out.replace(/\+\d{6,}/g, "+***");
  out = out.replace(/(?<![\d+])\d(?:[\s.-]?\d){6,}(?![\d])/g, "[phone]");

  // The OTP itself is 6 digits — never let it ride along inside a provider
  // message. Longer digit runs are phones (handled above); 3–5 digit numbers
  // (HTTP statuses, Twilio error codes like 20003) stay readable.
  out = out.replace(/(?<![\w-])\d{6}(?![\w-])/g, "[code]");

  out = out.replace(/\s+/g, " ").trim();
  return out.length > MAX_DETAIL_CHARS
    ? `${out.slice(0, MAX_DETAIL_CHARS)}…`
    : out;
}

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
    parts.push(`detail="${redactOtpLog(failure.detail ?? "no detail")}"`);
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
    const suffix = detail ? ` detail="${redactOtpLog(detail)}"` : "";
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