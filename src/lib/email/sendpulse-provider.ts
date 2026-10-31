/**
 * SendPulse implementation of the EmailProvider contract (./types).
 *
 * A thin adapter over the REST client in ./sendpulse: it turns that client's
 * throwing, SendPulse-specific API into the layer's contract — never throws,
 * returns { ok, error?, code?, id? } — and maps SendPulseError's native codes
 * onto the provider-neutral EmailErrorCode union, so callers never have to
 * know which provider ran.
 *
 * This module knows nothing about *what* an email is for (validation,
 * password recovery, …): it sends a message. Credentials come from env via
 * the client's own loadConfig().
 */

import { SendPulseError, sendEmail, verifyAuth } from "./sendpulse";
import type { SendPulseErrorCode } from "./sendpulse";
import type {
  EmailErrorCode,
  EmailMessage,
  EmailProvider,
  EmailProviderResult,
} from "./types";

/** Map SendPulse's native codes onto the layer's neutral union. */
function mapCode(code: SendPulseErrorCode): EmailErrorCode {
  switch (code) {
    case "missing_config":
      return "not_configured";
    case "http_error":
      return "provider_error";
    default:
      // invalid_input | rate_limited | auth | network | invalid_response
      return code;
  }
}

/** Turn any thrown value into a failed result — the contract never throws. */
function failure(error: unknown): EmailProviderResult {
  if (error instanceof SendPulseError) {
    return { ok: false, error: error.message, code: mapCode(error.code) };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message, code: "provider_error" };
}

/** Layer — SendPulse over its SMTP API. */
export const sendpulseEmailProvider: EmailProvider = {
  name: "sendpulse",

  async send(message: EmailMessage): Promise<EmailProviderResult> {
    try {
      const result = await sendEmail(message);
      return { ok: true, id: result.id };
    } catch (error) {
      return failure(error);
    }
  },

  async verifyAuth(): Promise<EmailProviderResult> {
    try {
      await verifyAuth();
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  },
};
