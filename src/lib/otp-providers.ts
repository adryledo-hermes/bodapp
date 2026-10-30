/**
 * Two abstraction layers over the OTP delivery services, so the provider can
 * be swapped without touching the OTP flow:
 *
 *   Layer 1 — WhatsAppProvider  (primary channel)
 *   Layer 2 — SmsProvider       (fallback channel)
 *
 * Contract for BOTH layers:
 *   - `send(to, body)` takes a BARE E.164 number and the already-rendered
 *     message body; it returns { ok, error? } and never throws.
 *   - Each provider owns its own addressing (the Twilio WhatsApp provider
 *     adds the `whatsapp:` prefix itself; an email/other provider would not).
 *   - Credentials live in the provider, never in the flow.
 *
 * Provider selection is by env var, one per layer:
 *   OTP_WHATSAPP_PROVIDER  default "twilio"
 *   OTP_SMS_PROVIDER       default "twilio"
 *
 * An unknown name resolves to `null` (not a throw), so a misconfigured
 * provider degrades to `sent:false` in the flow instead of crashing a request.
 * Adding a provider = one entry in the registry below.
 */

import { twilioSmsProvider, twilioWhatsAppProvider } from "./twilio-provider";

/** Result every provider returns. */
export interface ProviderResult {
  ok: boolean;
  error?: string;
}

/** Layer 1 — WhatsApp delivery. */
export interface WhatsAppProvider {
  readonly name: string;
  send(to: string, body: string): Promise<ProviderResult>;
}

/** Layer 2 — SMS delivery. */
export interface SmsProvider {
  readonly name: string;
  send(to: string, body: string): Promise<ProviderResult>;
}

/** Built-in registries — add a new provider here and it becomes selectable. */
export const WHATSAPP_PROVIDERS: Record<string, WhatsAppProvider> = {
  twilio: twilioWhatsAppProvider,
};

export const SMS_PROVIDERS: Record<string, SmsProvider> = {
  twilio: twilioSmsProvider,
};

/** Used when the corresponding `OTP_*_PROVIDER` env var is unset/empty. */
export const DEFAULT_PROVIDER = "twilio";

function pick<T>(registry: Record<string, T>, envName: string): T | null {
  const wanted = (process.env[envName] || DEFAULT_PROVIDER)
    .trim()
    .toLowerCase();
  return registry[wanted] ?? null;
}

/** Resolve the configured WhatsApp provider (null when unknown). */
export function getWhatsAppProvider(): WhatsAppProvider | null {
  return pick(WHATSAPP_PROVIDERS, "OTP_WHATSAPP_PROVIDER");
}

/** Resolve the configured SMS provider (null when unknown). */
export function getSmsProvider(): SmsProvider | null {
  return pick(SMS_PROVIDERS, "OTP_SMS_PROVIDER");
}

/** Names available for tests/docs/diagnostics. */
export function listWhatsAppProviders(): string[] {
  return Object.keys(WHATSAPP_PROVIDERS);
}

export function listSmsProviders(): string[] {
  return Object.keys(SMS_PROVIDERS);
}
