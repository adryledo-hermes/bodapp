/**
 * One abstraction layer over outbound email — the email twin of
 * `src/lib/otp-providers.ts`, so the sender can be swapped without touching a
 * single caller:
 *
 *   Contract   — EmailProvider (./types): send(EmailMessage) →
 *                { ok, error?, code?, id? }, never throws; credentials live
 *                in the provider, never in the caller.
 *   Registry   — EMAIL_PROVIDERS: name → provider. Adding a provider = one
 *                entry here plus one adapter module.
 *   Selection  — EMAIL_PROVIDER env var, default "sendpulse".
 *
 * An unknown name resolves to `null` (not a throw), so a misconfigured
 * deployment degrades to `sendEmail() → { ok:false, code:"not_configured" }`
 * instead of crashing a request — exactly like the OTP provider layers.
 *
 * App code calls `sendEmail()` from here (provider-agnostic). The SendPulse
 * client in ./sendpulse stays available for provider-specific work (the test
 * CLI, account diagnostics) but is not the app-facing entry point.
 */

import { sendpulseEmailProvider } from "./sendpulse-provider";
import type { EmailMessage, EmailProvider, EmailProviderResult } from "./types";

export type { EmailFrom, EmailMessage, EmailProvider, EmailProviderResult } from "./types";

/** Built-in registry — add a new provider here and it becomes selectable. */
export const EMAIL_PROVIDERS: Record<string, EmailProvider> = {
  sendpulse: sendpulseEmailProvider,
};

/** Used when the EMAIL_PROVIDER env var is unset/empty. */
export const DEFAULT_EMAIL_PROVIDER = "sendpulse";

type EnvLike = Record<string, string | undefined>;

function pick(env: EnvLike): EmailProvider | null {
  // Trim FIRST, then fall back: a whitespace-only value must count as "unset",
  // and `"" || default` would keep "   " (truthy) before it is ever trimmed.
  const wanted =
    (env.EMAIL_PROVIDER ?? "").trim().toLowerCase() || DEFAULT_EMAIL_PROVIDER;
  return EMAIL_PROVIDERS[wanted] ?? null;
}

/** Resolve the configured email provider (null when the name is unknown). */
export function getEmailProvider(env: EnvLike = process.env): EmailProvider | null {
  return pick(env);
}

/** Names available for tests/docs/diagnostics. */
export function listEmailProviders(): string[] {
  return Object.keys(EMAIL_PROVIDERS);
}

/**
 * App-facing send: resolve the configured provider and hand it the message.
 * Never throws — an unknown/unset provider becomes a failed result naming the
 * choices, so callers only ever branch on `result.ok` / `result.code`.
 */
export async function sendEmail(
  message: EmailMessage,
  env: EnvLike = process.env
): Promise<EmailProviderResult> {
  const provider = getEmailProvider(env);
  if (!provider) {
    const wanted = (env.EMAIL_PROVIDER || "").trim() || "(unset)";
    return {
      ok: false,
      error: `email provider "${wanted}" is not configured — available: ${listEmailProviders().join(", ")}`,
      code: "not_configured",
    };
  }
  return provider.send(message);
}
