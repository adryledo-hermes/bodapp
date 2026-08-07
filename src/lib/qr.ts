/**
 * QR code generation for per-invitation entry links (plan Task 11).
 *
 * The couple prints one QR per Invitation so guests can scan it, open the OTP
 * entry page (/w/[slug]/invite?g=<invitationId>), and authenticate with their
 * phone. Only pure helpers live here (no React/Next) so this module is
 * unit-testable — mirroring src/lib/seating.ts, src/lib/tasks.ts, etc.
 */

import QRCode from "qrcode";

export interface BuildInvitationUrlInput {
  baseUrl?: string;
  slug: string;
  invitationId: string;
}

/** Default absolute base URL used when none is passed / configured. */
const DEFAULT_BASE_URL = "http://localhost:3000";

/**
 * Build the OTP entry link for an invitation. `baseUrl` defaults to
 * PUBLIC_BASE_URL (or localhost) when omitted.
 */
export function buildInvitationUrl({
  baseUrl,
  slug,
  invitationId,
}: BuildInvitationUrlInput): string {
  const base = (
    baseUrl ??
    process.env.PUBLIC_BASE_URL ??
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  // The OTP entry page: guest lands here first and validates a phone.
  return `${base}/w/${slug}/invite?g=${invitationId}`;
}

/**
 * Generate a PNG QR code for `text`. Resolves to a Buffer whose bytes are a
 * valid PNG image (verify by checking the 0x89 0x50 0x4E 0x47 signature).
 */
export function encodeQr(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    QRCode.toBuffer(text, { type: "png", errorCorrectionLevel: "M" }, (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
}
