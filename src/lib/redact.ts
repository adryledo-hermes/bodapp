/**
 * Log redaction — one implementation, shared by every server log helper
 * (`otp-log.ts`, `failure-log.ts`), so "what must never reach Dozzle" is
 * decided in ONE place instead of drifting per module.
 *
 * SECURITY — a log line may carry:
 *   ✓ machine codes, statuses, file names, redacted reasons;
 * never:
 *   ✗ secrets (the env values below, bearer tokens), query strings (single-
 *     use tokens live there), email addresses, phone numbers (E.164, local
 *     runs, `whatsapp:+…` addressing), or a 6-digit OTP code.
 *
 * 3–5 digit numbers (HTTP status, Twilio error codes like 20003) stay
 * readable on purpose: they are the diagnostic content of the line.
 *
 * Exported helpers are pure and unit-tested (tests/lib/otp-failure-log.test.ts,
 * tests/lib/server-failure-log.test.ts).
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
 * Scrub free text before it reaches the logs: known secret values, bearer
 * tokens, URL query strings, every email address, every phone number and any
 * 6-digit code. Truncated to `MAX_DETAIL_CHARS`.
 */
export function redactLogText(text: string): string {
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
  // (+34611223344), then a bare 7+ digit run (local format / spaced groups).
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

/**
 * Reduce an unknown thrown value to a short loggable reason.
 * Never includes a stack (noisy, and can embed request internals).
 */
export function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}