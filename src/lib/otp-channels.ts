/**
 * OTP delivery channels for the public invitation flow.
 *
 * WhatsApp is the primary channel; plain SMS survives as a FALLBACK and is
 * DISABLED by default. Both are configured by env vars:
 *
 *   OTP_WHATSAPP_ENABLED   default "true"  → try WhatsApp first
 *   OTP_SMS_ENABLED        default "false" → if WhatsApp fails (or is off),
 *                                            retry over SMS
 *   OTP_WHATSAPP_PROVIDER  default "twilio"  → which WhatsApp provider
 *   OTP_SMS_PROVIDER       default "twilio"  → which SMS provider
 *
 * WHICH channel and WHICH provider are decided here; HOW a message is handed
 * to a service lives behind the two provider layers in ./otp-providers.ts, so
 * swapping Twilio for anything else is a registry entry, not a flow change.
 *
 * Delivery order is fixed (WhatsApp → SMS), so "fallback" always means "only
 * after WhatsApp could not deliver". When every channel is disabled `sendOtp`
 * returns { ok:false, error:"no otp channel enabled" } without touching the
 * network — the flow reports `sent:false` instead of pretending a code went
 * out.
 */

import { ensureInternational } from "./phone-prefix";
import { logOtpFailure, logOtpSent } from "./otp-log";
import {
  getSmsProvider,
  getWhatsAppProvider,
  listSmsProviders,
  listWhatsAppProviders,
  type SmsProvider,
  type WhatsAppProvider,
} from "./otp-providers";

export type { SmsProvider, WhatsAppProvider };

/** Delivery channels supported for the invitation OTP. */
export type OtpChannel = "whatsapp" | "sms";

/** What the OTP flow learns about a delivery attempt. */
export interface OtpSendResult {
  ok: boolean;
  error?: string;
  /** Machine code from the failing provider (`http_error`, …) when known. */
  code?: string;
  /** Channel that actually delivered the message (set on success). */
  channel?: OtpChannel;
  /** Channels tried, in order (WhatsApp first when both are enabled). */
  attempted?: OtpChannel[];
}

/**
 * Signature the OTP flow's `sendSms` dep expects — the channel/provider
 * selection happens inside, from env.
 */
export type OtpSmsTransport = (
  phone: string,
  code: string
) => Promise<OtpSendResult>;

/** Kept for name compatibility with the old otp-sms module. */
export type SmsResult = OtpSendResult;

/** Env names, kept in one place so this module and the docs agree. */
export const OTP_CHANNEL_ENV = [
  "OTP_WHATSAPP_ENABLED",
  "OTP_SMS_ENABLED",
  "OTP_WHATSAPP_PROVIDER",
  "OTP_SMS_PROVIDER",
] as const;

/**
 * Test seam: inject providers (or `null` for "none configured") without
 * touching env. Omitted keys fall back to the env-resolved provider.
 */
export interface OtpDeliveryDeps {
  whatsapp?: WhatsAppProvider | null;
  sms?: SmsProvider | null;
}

/**
 * Parse a boolean-ish env var: unset/empty → `fallback`, otherwise the usual
 * truthy/falsey spellings. Pure — unit-tested.
 */
export function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

/** WhatsApp channel — ON by default. */
export function whatsappEnabled(): boolean {
  return envFlag("OTP_WHATSAPP_ENABLED", true);
}

/** SMS fallback — OFF by default. */
export function smsEnabled(): boolean {
  return envFlag("OTP_SMS_ENABLED", false);
}

/** Enabled channels, in the order they are tried. */
export function otpChannels(): OtpChannel[] {
  const channels: OtpChannel[] = [];
  if (whatsappEnabled()) channels.push("whatsapp");
  if (smsEnabled()) channels.push("sms");
  return channels;
}

/** First enabled channel — what the UI should promise the guest. */
export function primaryChannel(): OtpChannel | null {
  return otpChannels()[0] ?? null;
}

/** Build the OTP message body. Kept as its own function so it's testable. */
export function buildOtpBody(code: string): string {
  return `Bodapp · Tu código es: ${code}`;
}

/** Resolve the provider for a channel (test seam overrides env). */
function resolveProvider(
  channel: OtpChannel,
  deps: OtpDeliveryDeps
): WhatsAppProvider | SmsProvider | null {
  if (channel === "whatsapp") {
    return "whatsapp" in deps ? deps.whatsapp ?? null : getWhatsAppProvider();
  }
  return "sms" in deps ? deps.sms ?? null : getSmsProvider();
}

/**
 * Send an OTP code over the configured channels: WhatsApp first, then SMS
 * only when the fallback is enabled. Matches `OtpSmsTransport`'s shape, so it
 * plugs straight into `OtpFlowDeps.sendSms`.
 *
 * Order of operations: normalise the phone once (E.164), render the body
 * once, then walk the enabled channels until one accepts the message.
 */
export async function sendOtp(
  phone: string,
  code: string,
  deps: OtpDeliveryDeps = {}
): Promise<OtpSendResult> {
  const channels = otpChannels();
  const attempted: OtpChannel[] = [];
  if (channels.length === 0) {
    logOtpFailure({
      code: "no_channel",
      detail:
        "OTP_WHATSAPP_ENABLED and OTP_SMS_ENABLED are both off — nothing can be delivered",
    });
    return { ok: false, error: "no otp channel enabled", attempted };
  }

  const to = ensureInternational(phone, process.env.DEFAULT_DIAL_CODE ?? undefined);
  if (!to) {
    logOtpFailure({
      code: "invalid_phone",
      detail: "phone could not be normalized to E.164 (check DEFAULT_DIAL_CODE)",
    });
    return { ok: false, error: "invalid phone", attempted };
  }

  const body = buildOtpBody(code);
  let lastError = "otp send failed";
  let lastCode: string | undefined;

  for (const channel of channels) {
    attempted.push(channel);
    const provider = resolveProvider(channel, deps);
    if (!provider) {
      const wanted =
        process.env[
          channel === "whatsapp" ? "OTP_WHATSAPP_PROVIDER" : "OTP_SMS_PROVIDER"
        ] || "twilio";
      const available =
        channel === "whatsapp" ? listWhatsAppProviders() : listSmsProviders();
      lastError = `${channel} provider not configured`;
      lastCode = "provider_not_configured";
      logOtpFailure({
        channel,
        provider: "(none)",
        code: "provider_not_configured",
        detail: `${channel} provider "${wanted}" is not registered — available: ${available.join(", ")}`,
      });
      continue;
    }

    // The provider contract says it never throws; guard anyway so a bug in a
    // provider degrades to the next channel instead of a 500 with no context.
    let result: Awaited<ReturnType<WhatsAppProvider["send"]>>;
    try {
      const startedAt = Date.now();
      // WhatsApp also gets the code as template variable {{1}}: when a
      // Content SID is configured the provider sends the APPROVED TEMPLATE
      // (a plain Body is refused outside the 24h window — 21654). SMS keeps
      // the plain body; a WhatsApp provider without a template ignores it.
      result =
        channel === "whatsapp"
          ? await (provider as WhatsAppProvider).send(to, body, { "1": code })
          : await (provider as SmsProvider).send(to, body);
      if (result.ok) {
        logOtpSent(channel, provider.name, Date.now() - startedAt);
        return { ok: true, channel, attempted };
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      lastError = `${channel} provider threw: ${reason}`;
      lastCode = "provider_threw";
      logOtpFailure({
        channel,
        provider: provider.name,
        code: "provider_threw",
        detail: reason,
      });
      continue;
    }
    lastError = result.error ?? lastError;
    lastCode = result.code ?? lastCode;
    logOtpFailure({
      channel,
      provider: provider.name,
      code: result.code ?? "send_failed",
      detail: result.error ?? "no detail",
    });
  }

  return {
    ok: false,
    error: lastError,
    code: lastCode,
    attempted,
  };
}
