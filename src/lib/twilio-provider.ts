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
 *   TWILIO_WHATSAPP_CONTENT_SID              — optional approved Content
 *                                              Template SID (HX…): when set,
 *                                              OTPs go out as that template
 *                                              (Body omitted) instead of
 *                                              free-form text
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

/** What to deliver: a plain Body, or an approved content template. */
interface TwilioContent {
  /** Free-form message body — used when no contentSid is set. */
  body?: string;
  /** Approved Content Template SID (`HX…`); replaces Body entirely. */
  contentSid?: string;
  /** Values for the template's placeholders — {"1": the OTP code}. */
  contentVariables?: Record<string, string>;
}

/** Shared POST to Twilio's Messages API. Never throws. */
async function twilioPost(
  to: string,
  from: string,
  content: TwilioContent
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

  // HTTP Basic — Twilio's REST API authenticates with `Basic base64(SID:token)`.
  // A `Bearer` scheme is rejected with 401/20003 ("Authenticate") even when the
  // credentials are perfect, so the scheme is not a style choice here.
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const authHeader = ["Basic", auth].join(" ");

  // Body vs content template. Twilio's Content docs: "Exclude Body and
  // MediaUrl — ContentSid replaces both". A free-form Body where a template
  // is required (outside the 24h WhatsApp window, or trial-level accounts)
  // comes back 400/21654 "ContentSid Required".
  const params = new URLSearchParams({ To: to, From: from });
  if (content.contentSid) {
    params.set("ContentSid", content.contentSid);
    const vars = content.contentVariables ?? {};
    if (Object.keys(vars).length > 0) {
      params.set("ContentVariables", JSON.stringify(vars));
    }
  } else {
    params.set("Body", content.body ?? "");
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
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
  async send(to, body, templateVars) {
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
    // Approved-template path: outside the 24-hour window (and on trial-level
    // accounts) Twilio refuses free-form WhatsApp with 400/21654
    // "ContentSid Required". When an HX Content SID is configured, send the
    // template with the code as its {{1}} variable — and NO Body.
    const contentSid = (process.env.TWILIO_WHATSAPP_CONTENT_SID || "").trim();
    if (contentSid) {
      if (!contentSid.toUpperCase().startsWith("HX")) {
        return {
          ok: false,
          code: "content_sid_invalid",
          error:
            "TWILIO_WHATSAPP_CONTENT_SID must be a Content Template SID (starts with HX)",
        };
      }
      return twilioPost(whatsappRecipient(to), whatsappAddress(from), {
        contentSid,
        contentVariables: templateVars,
      });
    }
    return twilioPost(whatsappRecipient(to), whatsappAddress(from), { body });
  },
};

/** Layer 2 — SMS over Twilio. */
export const twilioSmsProvider: SmsProvider = {
  name: "twilio",
  async send(to, body) {
    const from = process.env.TWILIO_PHONE_NUMBER;  // plain SMS, never a template
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
    return twilioPost(to, from, { body });
  },
};
