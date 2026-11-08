/**
 * Twilio implementations of BOTH provider layers
 * (`./otp-providers`: WhatsAppProvider + SmsProvider).
 *
 * Plain REST calls to the Twilio Messages API — no SDK, no extra dependency.
 * The two channels differ only in addressing:
 *   - WhatsApp: To/From carry the `whatsapp:` prefix
 *   - SMS:      bare E.164 numbers
 *
 * Credentials come from env and are never logged:
 *   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN   — shared by both layers
 *   TWILIO_WHATSAPP_FROM                     — WhatsApp sender
 *                                              (default: Twilio sandbox number)
 *   TWILIO_PHONE_NUMBER                      — SMS sender (required for SMS)
 *
 * This module knows nothing about OTPs: it sends a body to a number.
 */

import type {
  ProviderResult,
  SmsProvider,
  WhatsAppProvider,
} from "./otp-providers";

/**
 * Twilio's public WhatsApp sandbox sender — the out-of-the-box default so a
 * fresh deployment can deliver on WhatsApp with no extra config (recipients
 * must have joined the sandbox). Set TWILIO_WHATSAPP_FROM to your own approved
 * WhatsApp sender for production.
 */
export const DEFAULT_WHATSAPP_FROM = "+14155238886";

/**
 * Normalise a configured WhatsApp sender into Twilio's `whatsapp:` address
 * form. Accepts `+14155238886`, `14155238886` or a full `whatsapp:+…`.
 * Pure — unit-tested.
 */
export function whatsappAddress(raw: string): string {
  const value = raw.trim();
  if (value.toLowerCase().startsWith("whatsapp:")) {
    return `whatsapp:${value.slice("whatsapp:".length)}`;
  }
  return `whatsapp:${value.startsWith("+") ? value : `+${value}`}`;
}

/** Recipient address for the WhatsApp channel. Pure — unit-tested. */
export function whatsappRecipient(e164: string): string {
  return `whatsapp:${e164}`;
}

/** Shared POST to Twilio's Messages API. Never throws. */
async function twilioPost(
  to: string,
  from: string,
  body: string
): Promise<ProviderResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return {
      ok: false,
      code: "credentials_missing",
      error:
        "twilio credentials not configured (set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)",
    };
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const authHeader = ["Bearer", auth].join(" ");
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      }
    );
    if (!res.ok) {
      // Twilio explains failures as JSON { code, message, more_info }. Keep
      // the HTTP status AND that message: a bare "twilio send failed" cannot
      // tell a bad token (401/20003) from a rejected sender (21606) from an
      // unjoined WhatsApp sandbox — which is the difference between "fix the
      // .env" and "fix the code". The caller redacts it before logging.
      let detail = `twilio http ${res.status}`;
      try {
        const payload = (await res.json()) as {
          code?: number;
          message?: string;
        };
        if (payload && typeof payload.code === "number") {
          detail += ` twilio_code=${payload.code}`;
        }
        if (payload && typeof payload.message === "string") {
          detail += ` message="${payload.message}"`;
        }
      } catch {
        // Non-JSON body (proxy error page, empty reply) — the status stands.
      }
      return { ok: false, code: "http_error", error: detail };
    }
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: "network_error",
      error: `twilio unreachable: ${reason}`,
    };
  }
}

/** Layer 1 — WhatsApp over Twilio. */
export const twilioWhatsAppProvider: WhatsAppProvider = {
  name: "twilio",
  async send(to, body) {
    const from = process.env.TWILIO_WHATSAPP_FROM || DEFAULT_WHATSAPP_FROM;
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return {
        ok: false,
        code: "credentials_missing",
        error:
          "twilio credentials not configured (set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)",
      };
    }
    if (!from) {
      return {
        ok: false,
        code: "sender_missing",
        error: "whatsapp sender not configured (TWILIO_WHATSAPP_FROM)",
      };
    }
    return twilioPost(whatsappRecipient(to), whatsappAddress(from), body);
  },
};

/** Layer 2 — SMS over Twilio. */
export const twilioSmsProvider: SmsProvider = {
  name: "twilio",
  async send(to, body) {
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return {
        ok: false,
        code: "credentials_missing",
        error:
          "twilio credentials not configured (set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)",
      };
    }
    if (!from) {
      return {
        ok: false,
        code: "sender_missing",
        error: "sms sender not configured (TWILIO_PHONE_NUMBER)",
      };
    }
    return twilioPost(to, from, body);
  },
};
