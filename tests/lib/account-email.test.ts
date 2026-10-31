import { beforeEach, describe, expect, it, vi } from "vitest";

// The send helpers must stay provider-agnostic: they only forward a rendered
// message to sendEmail() and translate the result into a boolean.
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/email-providers", () => ({ sendEmail }));

import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../../src/lib/email/account";

const URL = "https://app.example.com/reset-password?token=tok";

beforeEach(() => {
  sendEmail.mockReset();
});

describe("sendVerificationEmail", () => {
  it("returns true and forwards the rendered message on provider success", async () => {
    sendEmail.mockResolvedValue({ ok: true, id: "msg-1" });

    const ok = await sendVerificationEmail({
      to: "ana@example.com",
      url: URL,
      locale: "es",
      coupleName: "Ana y Luis",
    });

    expect(ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = sendEmail.mock.calls[0][0];
    expect(message.to).toBe("ana@example.com");
    expect(message.subject).toBe("Confirma tu correo electrónico");
    expect(message.html).toContain(URL);
    expect(message.html).toContain("Ana y Luis");
    expect(message.text).toContain(URL);
  });

  it("returns false (never throws) when the provider rejects the message", async () => {
    sendEmail.mockResolvedValue({ ok: false, error: "boom", code: "rate_limited" });
    await expect(
      sendVerificationEmail({ to: "a@b.com", url: URL, locale: "en" })
    ).resolves.toBe(false);
  });
});

describe("sendPasswordResetEmail", () => {
  it("returns true and forwards the rendered message", async () => {
    sendEmail.mockResolvedValue({ ok: true });

    const ok = await sendPasswordResetEmail({
      to: "ana@example.com",
      url: URL,
      locale: "en",
    });

    expect(ok).toBe(true);
    const message = sendEmail.mock.calls[0][0];
    expect(message.to).toBe("ana@example.com");
    expect(message.subject).toBe("Reset your password");
    expect(message.html).toContain(URL);
    expect(message.text).toContain(URL);
  });

  it("returns false when the provider is not configured", async () => {
    sendEmail.mockResolvedValue({ ok: false, code: "not_configured" });
    await expect(
      sendPasswordResetEmail({ to: "a@b.com", url: URL, locale: "es" })
    ).resolves.toBe(false);
  });
});