/**
 * Send helpers for the account-security emails (v1.4). They sit ON TOP of the
 * provider abstraction layer (./email-providers) — routes never see SendPulse.
 *
 * Neither helper throws: a provider outage or missing configuration must never
 * fail a signup or a password-reset request, so failures are reported as
 * `false` and logged by the caller.
 */

import { sendEmail } from "./email-providers";
import { passwordResetEmail, verificationEmail } from "./templates";
import type { Locale } from "@/lib/i18n";

/** Email the validation link the couple must click after signing up. */
export async function sendVerificationEmail(opts: {
  to: string;
  url: string;
  locale: Locale;
  coupleName?: string;
}): Promise<boolean> {
  const body = verificationEmail({
    url: opts.url,
    locale: opts.locale,
    coupleName: opts.coupleName,
  });
  const result = await sendEmail({
    to: opts.to,
    subject: body.subject,
    html: body.html,
    text: body.text,
  });
  return result.ok;
}

/** Email the reset link requested from the login screen. */
export async function sendPasswordResetEmail(opts: {
  to: string;
  url: string;
  locale: Locale;
}): Promise<boolean> {
  const body = passwordResetEmail({ url: opts.url, locale: opts.locale });
  const result = await sendEmail({
    to: opts.to,
    subject: body.subject,
    html: body.html,
    text: body.text,
  });
  return result.ok;
}