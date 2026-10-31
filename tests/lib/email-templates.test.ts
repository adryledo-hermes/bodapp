import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  passwordResetEmail,
  verificationEmail,
} from "../../src/lib/email/templates";

const URL = "https://app.example.com/api/auth/verify-email?token=abc123";

describe("escapeHtml", () => {
  it("escapes every HTML metacharacter coming from user input", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;"
    );
  });
});

describe("verificationEmail (signup validation)", () => {
  it("renders the Spanish copy with the link in both body and CTA", () => {
    const mail = verificationEmail({ url: URL, locale: "es" });
    expect(mail.subject).toBe("Confirma tu correo electrónico");
    expect(mail.html).toContain(`href="${URL}"`);
    expect(mail.html).toContain("lang=\"es\"");
    expect(mail.text).toContain(URL);
    expect(mail.text).toContain("24 horas");
  });

  it("renders the English copy", () => {
    const mail = verificationEmail({ url: URL, locale: "en" });
    expect(mail.subject).toBe("Verify your email address");
    expect(mail.html).toContain(`href="${URL}"`);
    expect(mail.html).toContain("lang=\"en\"");
    expect(mail.text).toContain(URL);
    expect(mail.text).toContain("24 hours");
  });

  it("greets the couple by name and escapes it in the HTML", () => {
    const safe = verificationEmail({
      url: URL,
      locale: "es",
      coupleName: "Ana & Luis",
    });
    expect(safe.html).toContain("Hola, Ana &amp; Luis:");
    expect(safe.text).toContain("Hola, Ana & Luis:");

    const evil = verificationEmail({
      url: URL,
      locale: "es",
      coupleName: "<script>x</script>",
    });
    expect(evil.html).not.toContain("<script>x</script>");
    expect(evil.html).toContain("&lt;script&gt;");
  });

  it("greets generically when no couple name is given", () => {
    expect(verificationEmail({ url: URL, locale: "es" }).text).toContain("Hola:");
    expect(verificationEmail({ url: URL, locale: "en" }).text).toContain("Hi,");
  });
});

describe("passwordResetEmail (forgot password)", () => {
  it("renders Spanish copy with the 60-minute warning and the link", () => {
    const mail = passwordResetEmail({ url: URL, locale: "es" });
    expect(mail.subject).toBe("Restablece tu contraseña");
    expect(mail.html).toContain(`href="${URL}"`);
    expect(mail.text).toContain(URL);
    expect(mail.text).toContain("60 minutos");
  });

  it("renders English copy with the link", () => {
    const mail = passwordResetEmail({ url: URL, locale: "en" });
    expect(mail.subject).toBe("Reset your password");
    expect(mail.html).toContain(`href="${URL}"`);
    expect(mail.text).toContain(URL);
    expect(mail.text).toContain("60 minutes");
  });

  it("always offers a plain-text fallback carrying the same URL", () => {
    for (const locale of ["es", "en"] as const) {
      const mail = passwordResetEmail({ url: URL, locale });
      expect(mail.text).toContain(URL);
      expect(mail.html.startsWith("<!doctype html>")).toBe(true);
    }
  });
});