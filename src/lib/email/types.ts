/**
 * Provider-neutral contract for outbound email — the types BOTH sides of the
 * abstraction layer share:
 *
 *   EmailMessage / EmailFrom   the payload every provider must accept
 *   EmailProviderResult        what every send returns (the layer never throws)
 *   EmailProvider              the interface a provider implements
 *
 * Nothing here imports a concrete provider, so this module can be imported by
 * the registry (./email-providers.ts), by an adapter (./sendpulse-provider.ts)
 * and by the SendPulse client itself without creating an import cycle.
 */

/** Sender identity. `email` must be a verified sender on the provider side. */
export interface EmailFrom {
  email: string;
  name?: string;
}

/** One outbound message, in provider-neutral shape. */
export interface EmailMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Defaults to the provider's configured sender. */
  from?: EmailFrom;
}

/**
 * Failure classification, provider-neutral. Adapters map their native codes
 * onto this union so callers can branch without knowing which provider ran:
 *
 *   not_configured    credentials/provider absent — nothing was attempted
 *   invalid_input     rejected before any network call (no recipient, …)
 *   rate_limited      provider quota — wait and retry
 *   auth              provider rejected the credentials
 *   provider_error    provider answered with an error status
 *   network           the provider could not be reached
 *   invalid_response  reachable, but the answer was unusable
 */
export type EmailErrorCode =
  | "not_configured"
  | "invalid_input"
  | "rate_limited"
  | "auth"
  | "provider_error"
  | "network"
  | "invalid_response";

/** Result every provider returns. `ok:false` always carries `error` + `code`. */
export interface EmailProviderResult {
  ok: boolean;
  error?: string;
  code?: EmailErrorCode;
  /** Provider's message id, when it returns one. */
  id?: string;
}

/**
 * The abstraction layer's contract — the email twin of `WhatsAppProvider` /
 * `SmsProvider` in `src/lib/otp-providers.ts`, adapted to email's payload:
 *
 *   - `send(message)` takes the already-rendered message and returns
 *     { ok, error?, code?, id? } — it NEVER throws.
 *   - Credentials live in the provider, never in the caller.
 *   - `verifyAuth()` is optional: only providers able to check themselves
 *     implement it.
 */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailProviderResult>;
  verifyAuth?(): Promise<EmailProviderResult>;
}
