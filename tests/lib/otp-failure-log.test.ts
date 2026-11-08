import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Observability for the OTP delivery path (see src/lib/otp-log.ts).
 *
 * Same shape as email-failure-log.test.ts, because the same thing was wrong
 * twice: every layer of this path answers `{ ok:false }` instead of throwing,
 * so a guest who never receives the WhatsApp code used to leave NOTHING in
 * the logs. These tests assert both halves of the contract together:
 *
 *   1. every failure that can swallow a send DOES surface as a log line
 *      (channel, provider, machine code, reason), and
 *   2. that line never carries a phone number, the code, the invitation
 *      token or credentials.
 *
 * No network: providers are injected through OtpDeliveryDeps, and the Twilio
 * fetch is stubbed for the one provider-level test.
 */
import { logOtpFailure, redactOtpLog } from "../../src/lib/otp-log";
import {
  sendOtp,
  type OtpDeliveryDeps,
} from "../../src/lib/otp-channels";
import { requestOtp, baseGen } from "../../src/lib/otp-flow";
import type { OtpFlowDeps } from "../../src/lib/otp-flow";
import { twilioWhatsAppProvider } from "../../src/lib/twilio-provider";

const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

/** Every string passed to console.error/console.log during the test. */
function errorLines(): string[] {
  return errorSpy.mock.calls.map((args) =>
    args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
  );
}
function logLines(): string[] {
  return logSpy.mock.calls.map((args) =>
    args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
  );
}


const PHONE = "+34611223344";
const AUTH_TOKEN = "tw-auth-tok...";

const ENV_KEYS = [
  "OTP_WHATSAPP_ENABLED",
  "OTP_SMS_ENABLED",
  "OTP_WHATSAPP_PROVIDER",
  "OTP_SMS_PROVIDER",
  "DEFAULT_DIAL_CODE",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_FROM",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  errorSpy.mockClear();
  logSpy.mockClear();
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // WhatsApp on, SMS off — the defaults a fresh deployment runs with.
  process.env.OTP_WHATSAPP_ENABLED = "true";
  process.env.OTP_SMS_ENABLED = "false";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** Provider double: scripted outcomes, optional throw. */
function provider(
  name: string,
  outcome: { ok: boolean; error?: string; code?: string } | Error
) {
  return {
    name,
    async send(): Promise<{ ok: boolean; error?: string; code?: string }> {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
}

describe("redactOtpLog", () => {
  it("masks phone numbers (E.164, local runs and whatsapp: addressing)", () => {
    const out = redactOtpLog(
      `To whatsapp:+34611223344 failed for +34 611 22 33 44 and 611223344`
    );
    expect(out).not.toContain("611223344");
    expect(out).not.toContain("611 22 33 44");
  });

  it("strips query strings, where invitation/reset tokens live", () => {
    const out = redactOtpLog(
      "bad link https://app.example.com/i/verify?token=abc123secret"
    );
    expect(out).not.toContain("abc123secret");
    expect(out).toContain("?<redacted>");
  });

  it("removes secret env values, bearer tokens and emails", () => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    const out = redactOtpLog(
      `Authorization: Bearer 4f2a9c to guest@example.com with ${AUTH_TOKEN}`
    );
    expect(out).not.toContain(AUTH_TOKEN);
    expect(out).not.toContain("4f2a9c");
    expect(out).not.toContain("guest@example.com");
  });

  it("caps runaway provider messages", () => {
    expect(redactOtpLog("x".repeat(500)).length).toBeLessThanOrEqual(241);
  });
});

describe("sendOtp — delivery failures must be visible", () => {
  it("logs a FAILED line with channel, provider and code when the provider refuses", async () => {
    const deps: OtpDeliveryDeps = {
      whatsapp: provider("twilio", {
        ok: false,
        code: "http_error",
        error: "twilio http 401 twilio_code=20003 message=\"Authenticate\"",
      }),
    };

    const result = await sendOtp(PHONE, "123456", deps);

    expect(result.ok).toBe(false);
    expect(result.code).toBe("http_error");
    expect(errorLines()).toHaveLength(1);
    expect(errorLines()[0]).toContain("[otp] SEND FAILED");
    expect(errorLines()[0]).toContain("channel=whatsapp");
    expect(errorLines()[0]).toContain("provider=twilio");
    expect(errorLines()[0]).toContain("code=http_error");
    expect(errorLines()[0]).toContain("401");
  });

  it("never writes the phone number or the code into the log line", async () => {
    const deps: OtpDeliveryDeps = {
      whatsapp: provider("twilio", {
        ok: false,
        error: `delivery to ${PHONE} failed for code 123456`,
      }),
    };

    await sendOtp(PHONE, "123456", deps);

    const line = errorLines().join("\n");
    expect(line).not.toContain("611223344");
    expect(line).not.toContain(PHONE);
    expect(line).not.toContain("123456");
  });

  it("logs no_channel when every channel is disabled", async () => {
    process.env.OTP_WHATSAPP_ENABLED = "false";
    process.env.OTP_SMS_ENABLED = "false";

    const result = await sendOtp(PHONE, "123456", {});

    expect(result.ok).toBe(false);
    expect(errorLines()[0]).toContain("[otp] SEND FAILED");
    expect(errorLines()[0]).toContain("code=no_channel");
  });

  it("logs invalid_phone when the number cannot be normalized", async () => {
    const result = await sendOtp("not-a-number", "123456", {
      whatsapp: provider("twilio", { ok: true }),
    });

    expect(result.ok).toBe(false);
    expect(errorLines()[0]).toContain("code=invalid_phone");
  });

  it("logs provider_not_configured and names the registered choices", async () => {
    const result = await sendOtp(PHONE, "123456", { whatsapp: null });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("provider_not_configured");
    expect(errorLines()[0]).toContain("provider_not_configured");
    expect(errorLines()[0]).toContain("provider=(none)");
    expect(errorLines()[0]).toContain("twilio"); // available list
  });

  it("logs provider_threw instead of letting a buggy provider 500 the route", async () => {
    const deps: OtpDeliveryDeps = {
      whatsapp: provider("twilio", new Error("boom")),
    };

    const result = await sendOtp(PHONE, "123456", deps);

    expect(result.ok).toBe(false);
    expect(result.code).toBe("provider_threw");
    expect(errorLines()[0]).toContain("code=provider_threw");
  });

  it("logs SEND OK on success, so 'no message arrived' points at the provider", async () => {
    const deps: OtpDeliveryDeps = {
      whatsapp: provider("twilio", { ok: true }),
    };

    const result = await sendOtp(PHONE, "123456", deps);

    expect(result.ok).toBe(true);
    expect(result.channel).toBe("whatsapp");
    expect(logLines()).toHaveLength(1);
    expect(logLines()[0]).toContain("[otp] SEND OK");
    expect(logLines()[0]).toContain("channel=whatsapp");
    expect(logLines()[0]).toContain("provider=twilio");
    expect(logLines()[0]).toMatch(/duration_ms=\d+/);
    // Success says nothing about the recipient either.
    expect(logLines()[0]).not.toContain("611223344");
    expect(errorLines()).toHaveLength(0);
  });
});

describe("requestOtp — refusals must be visible server-side", () => {
  function fakeDeps(overrides: Partial<OtpFlowDeps> = {}): OtpFlowDeps {
    return {
      findInvitation: async () => ({
        id: "inv-1",
        weddingId: "wed-1",
        acceptedPhones: [PHONE],
      }),
      createOtp: async () => "otp-1",
      findPendingOtp: async () => null,
      incrementAttempts: async () => 0,
      consumeOtp: async () => {},
      rateLimiter: { allowed: () => true },
      sendSms: async () => ({ ok: true, channel: "whatsapp" }),
      gen: baseGen(),
      otpTtlMs: 10 * 60 * 1000,
      ...overrides,
    };
  }

  it("logs an unknown invitation token", async () => {
    const outcome = await requestOtp(
      "no-such-token",
      PHONE,
      fakeDeps({ findInvitation: async () => null })
    );

    expect(outcome.ok).toBe(false);
    expect(errorLines()[0]).toContain("[otp] REQUEST REFUSED");
    expect(errorLines()[0]).toContain("reason=invitation_unknown");
    expect(errorLines()[0]).not.toContain("no-such-token");
  });

  it("logs a phone that is not on the invitation allowlist", async () => {
    const outcome = await requestOtp(
      "tok",
      "+34699999999",
      fakeDeps() // allowlist only holds PHONE
    );

    expect(outcome.ok).toBe(false);
    expect(errorLines()[0]).toContain("reason=phone_not_allowed");
    expect(errorLines()[0]).not.toContain("699999999");
  });

  it("logs a rate-limited request", async () => {
    const outcome = await requestOtp(
      "tok",
      PHONE,
      fakeDeps({ rateLimiter: { allowed: () => false } })
    );

    expect(outcome.ok).toBe(false);
    expect(errorLines()[0]).toContain("reason=rate_limited");
  });

  it("logs the send failure the flow actually got (sent:false reaches the log)", async () => {
    // The REAL transport, wired as the flow's sendSms — same wiring production
    // uses (defaultOtpDeps.sendSms = sendOtp) — so the line below is the one
    // an operator would see in Dozzle.
    const outcome = await requestOtp(
      "tok",
      PHONE,
      fakeDeps({
        sendSms: (phone, code) =>
          sendOtp(phone, code, {
            whatsapp: provider("twilio", {
              ok: false,
              error: "twilio credentials not configured (set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)",
              code: "credentials_missing",
            }),
          }),
      })
    );

    // The HTTP layer keeps answering the uniform way — observability only.
    expect(outcome).toMatchObject({ ok: true, sent: false });
    expect(errorLines()[0]).toContain("[otp] SEND FAILED");
    expect(errorLines()[0]).toContain("credentials_missing");
  });
});

describe("twilio provider — errors carry the real reason", () => {
  it("reports HTTP status and Twilio's code/message instead of a bare failure", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 20003,
            message: "Authenticate",
            more_info: "https://www.twilio.com/docs/errors/20003",
          }),
          { status: 401 }
        )
      )
    );

    const result = await twilioWhatsAppProvider.send(PHONE, "Bodapp");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("http_error");
    expect(result.error).toContain("twilio http 401");
    expect(result.error).toContain("twilio_code=20003");
    expect(result.error).toContain("Authenticate");
    // …and no credential ever rides along.
    expect(result.error).not.toContain(AUTH_TOKEN);
  });

  it("names the missing env vars when credentials are absent", async () => {
    const result = await twilioWhatsAppProvider.send(PHONE, "Bodapp");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("credentials_missing");
    expect(result.error).toContain("TWILIO_ACCOUNT_SID");
  });
});

describe("logOtpFailure — formatting", () => {
  it("emits one greppable line and redacts on the way out", () => {
    logOtpFailure({
      channel: "whatsapp",
      provider: "twilio",
      code: "http_error",
      detail: `to ${PHONE} via whatsapp:${PHONE} link ?token=abc123secret`,
    });

    const line = errorLines()[0];
    expect(line).toContain(
      "[otp] SEND FAILED channel=whatsapp provider=twilio code=http_error detail=\""
    );
    expect(line).not.toContain("611223344");
    expect(line).not.toContain("abc123secret");
  });

  it("fills the slots so a partial result still greps", () => {
    logOtpFailure({ code: "no_channel", detail: "both off" });
    expect(errorLines()[0]).toBe(
      '[otp] SEND FAILED provider=(none) code=no_channel detail="both off"'
    );
  });
});