/**
 * Twilio SMS sender for the public OTP invitation flow (Task 9).
 *
 * SMS is the ONLY OTP channel (no WhatsApp Business number). Sending is done
 * via a plain REST call to the Twilio Messages API — no extra dependency — so
 * the real behaviour stays behind a small, easily mockable seam:
 *
 *   export type OtpSmsTransport = (phone: string, code: string) => Promise<SmsResult>
 *
 * The route handlers call `sendOtpSms(phone, code)` which defaults to the real
 * Twilio transport; unit tests inject a fake transport so they never hit
 * Twilio. If the required env vars are missing we return { ok:false } with a
 * descriptive error and never attempt a network call.
 */

export interface SmsResult {
  ok: boolean;
  error?: string;
}

/** The real transport: POST to Twilio Messages API using env credentials. */
export type OtpSmsTransport = (
  phone: string,
  code: string
) => Promise<SmsResult>;

/** Env names, kept in one place so both this module and docs agree. */
export const TWILIO_ENV = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
] as const;

export function twilioConfigured(): boolean {
  return TWILIO_ENV.every((k) => !!process.env[k]);
}

/** Build a Twilio SMS body. Kept as its own function so it's testable. */
export function buildSmsBody(code: string): string {
  return `Bodapp · Tu código es: ${code}`;
}

/**
 * Real Twilio transport. Never called from tests — the routes inject a mock.
 * Credentials come from env and are never logged.
 */
export const twilioTransport: OtpSmsTransport = async (phone, code) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, error: "sms not configured" };
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phone,
          From: fromNumber,
          Body: buildSmsBody(code),
        }),
      }
    );
    if (!res.ok) {
      return { ok: false, error: "sms send failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "sms send failed" };
  }
};

/**
 * Send an OTP code by SMS. `transport` is injectable so tests never touch
 * Twilio. Returns { ok: false, error } when the code could not be delivered —
 * the route decides whether to surface that to the caller.
 */
export async function sendOtpSms(
  phone: string,
  code: string,
  transport: OtpSmsTransport = twilioTransport
): Promise<SmsResult> {
  return transport(phone, code);
}
