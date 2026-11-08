import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Observability for a failing email service (see src/lib/email/log.ts).
 *
 * Two things are asserted here, together, because they pull in opposite
 * directions:
 *   1. a failed send DOES surface as an operator-visible error line, and
 *   2. that line never carries recipients, reset links or credentials.
 *
 * No network: the SendPulse client's `fetch` is stubbed.
 */
import {
  logEmailFailure,
  redactEmailLog,
} from "../../src/lib/email/log";
import { sendEmail } from "../../src/lib/email/email-providers";

const API_KEY = "sk-sendpulse-abcdef123456";

const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

/** Every string passed to console.error during the test. */
function loggedLines(): string[] {
  return errorSpy.mock.calls.map((args) =>
    args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  errorSpy.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SENDPULSE_API_KEY", API_KEY);
  vi.stubEnv("SENDPULSE_API_FROM_EMAIL", "sender@example.com");
  vi.stubEnv("EMAIL_PROVIDER", "sendpulse");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const message = {
  to: "guest@example.com",
  subject: "Recuperar contraseña",
  html: "<p>Hola</p>",
  text: "Hola",
};

describe("redactEmailLog", () => {
  it("removes every email address", () => {
    const out = redactEmailLog("delivery to guest@example.com failed");
    expect(out).not.toContain("guest@example.com");
    expect(out).toContain("[email]");
  });

  it("strips query strings, where single-use tokens live", () => {
    const out = redactEmailLog(
      "bad link https://app.example.com/reset-password?token=abc123secret"
    );
    expect(out).not.toContain("abc123secret");
    expect(out).toContain("https://app.example.com/reset-password?<redacted>");
  });

  it("removes bearer tokens", () => {
    const out = redactEmailLog("header was Authorization: Bearer 4f2a9c");
    expect(out).not.toContain("4f2a9c");
    expect(out).toContain("Bearer ***");
  });

  it("removes secret values coming from the environment", () => {
    const out = redactEmailLog(`reject: invalid api key ${API_KEY}`);
    expect(out).not.toContain(API_KEY);
    expect(out).toContain("***");
  });

  it("collapses whitespace and truncates very long details", () => {
    const out = redactEmailLog(`  ${"x".repeat(600)}  `);
    expect(out.length).toBeLessThanOrEqual(241);
    expect(out).toContain("…");
  });
});

describe("logEmailFailure", () => {
  it("writes one error line naming provider and code, nothing else", () => {
    logEmailFailure("sendpulse", {
      ok: false,
      error: "Could not reach SendPulse at https://api.sendpulse.com",
      code: "network",
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = loggedLines()[0];
    expect(line).toContain("[email] SEND FAILED");
    expect(line).toContain("provider=sendpulse");
    expect(line).toContain("code=network");
    expect(line).toContain("api.sendpulse.com");
  });
});

describe("sendEmail failure logging", () => {
  it("logs a network failure without leaking the recipient or link", async () => {
    fetchMock.mockRejectedValue(
      new Error(
        "connect ETIMEDOUT for alice@example.com link https://app.example.com/reset-password?token=TOPSECRET"
      )
    );

    const result = await sendEmail(message);

    expect(result.ok).toBe(false);
    expect(result.code).toBe("network");

    const lines = loggedLines().join("\n");
    expect(lines).toContain("[email] SEND FAILED");
    expect(lines).toContain("provider=sendpulse");
    expect(lines).toContain("code=network");
    // The security half of the contract:
    expect(lines).not.toContain("alice@example.com");
    expect(lines).not.toContain("guest@example.com");
    expect(lines).not.toContain("TOPSECRET");
    expect(lines).not.toContain(API_KEY);
  });

  it("logs a provider-error response (e.g. wrong baseUrl answering 404)", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "not found" }), { status: 404 })
    );

    const result = await sendEmail(message);

    expect(result.ok).toBe(false);
    expect(result.code).toBe("provider_error");
    expect(loggedLines().join("\n")).toContain("code=provider_error");
  });

  it("logs when no provider is configured at all", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "mailgun");

    const result = await sendEmail(message, { EMAIL_PROVIDER: "mailgun" });

    expect(result).toMatchObject({ ok: false, code: "not_configured" });
    const lines = loggedLines().join("\n");
    expect(lines).toContain("code=not_configured");
    expect(lines).toContain("provider=(none)");
  });

  it("stays silent on a successful send (no PII in logs for happy paths)", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "msg-1" }), { status: 200 })
    );

    const result = await sendEmail(message);

    expect(result.ok).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});