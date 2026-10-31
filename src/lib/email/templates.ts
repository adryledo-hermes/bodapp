/**
 * HTML + text bodies for the account-security emails (v1.4): email validation
 * on signup and password recovery. PURE module — no React / Next / Prisma —
 * so it is unit-testable like the rest of src/lib.
 *
 * Every value interpolated into HTML goes through escapeHtml(): the couple's
 * name and the recipient address both originate from user input.
 */

import type { Locale } from "@/lib/i18n";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Escape a value for interpolation into HTML. */
export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface Layout {
  heading: string;
  paragraphs: string[];
  buttonLabel: string;
  footnote: string;
}

function render(locale: Locale, layout: Layout, url: string): RenderedEmail {
  const paragraphsHtml = layout.paragraphs
    .map((p) => `      <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6">${escapeHtml(p)}</p>`)
    .join("\n");

  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;padding:32px">
            <tr>
              <td>
                <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">Bodapp</p>
                <h1 style="margin:0 0 20px;font-size:22px;color:#0f172a">${escapeHtml(layout.heading)}</h1>
${paragraphsHtml}
                <p style="margin:0 0 20px">
                  <a href="${escapeHtml(url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600">${escapeHtml(layout.buttonLabel)}</a>
                </p>
                <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.6">${escapeHtml(layout.footnote)}</p>
                <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">${escapeHtml(url)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    layout.heading,
    "",
    ...layout.paragraphs,
    "",
    layout.buttonLabel + ": " + url,
    "",
    layout.footnote,
    "",
    "(Si tú no has pedido este email, ignóralo.)",
  ].join("\n");

  return { subject: layout.heading, html, text };
}

/** Email sent on signup: click to validate the address (24 h link). */
export function verificationEmail(opts: {
  url: string;
  locale: Locale;
  coupleName?: string;
}): RenderedEmail {
  const { url, locale } = opts;
  const greeting =
    locale === "es"
      ? opts.coupleName
        ? `Hola, ${opts.coupleName}:`
        : "Hola:"
      : opts.coupleName
        ? `Hi ${opts.coupleName},`
        : "Hi,";

  const layout: Layout =
    locale === "es"
      ? {
          heading: "Confirma tu correo electrónico",
          paragraphs: [
            greeting,
            "Gracias por registrarte en Bodapp. Confirma tu correo para validar tu cuenta y poder recuperar tu contraseña si algún día la olvidas.",
            "El enlace caduca en 24 horas.",
          ],
          buttonLabel: "Confirmar mi correo",
          footnote: "Si tú no has creado esta cuenta, ignora este email: no se enviará nada más.",
        }
      : {
          heading: "Verify your email address",
          paragraphs: [
            greeting,
            "Thanks for signing up for Bodapp. Confirm your email to validate your account and to be able to recover your password if you ever forget it.",
            "The link expires in 24 hours.",
          ],
          buttonLabel: "Verify my email",
          footnote: "If you did not create this account, ignore this email — nothing else will be sent.",
        };

  return render(locale, layout, url);
}

/** Email sent by "forgot password": click to choose a new password (60 min). */
export function passwordResetEmail(opts: { url: string; locale: Locale }): RenderedEmail {
  const { url, locale } = opts;

  const layout: Layout =
    locale === "es"
      ? {
          heading: "Restablece tu contraseña",
          paragraphs: [
            "Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Bodapp.",
            "Elige una contraseña nueva en el siguiente enlace. Caduca en 60 minutos.",
          ],
          buttonLabel: "Elegir una contraseña nueva",
          footnote: "Si no has sido tú, ignora este email: tu contraseña no cambia hasta que alguien use ese enlace.",
        }
      : {
          heading: "Reset your password",
          paragraphs: [
            "We received a request to reset the password on your Bodapp account.",
            "Choose a new password using the link below. It expires in 60 minutes.",
          ],
          buttonLabel: "Choose a new password",
          footnote: "If this wasn't you, ignore this email — your password stays unchanged until the link is used.",
        };

  return render(locale, layout, url);
}