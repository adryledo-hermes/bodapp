import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildOtpBody,
  envFlag,
  otpChannels,
  primaryChannel,
  sendOtp,
  smsEnabled,
  whatsappEnabled,
} from "../../src/lib/otp-channels";
import {
  getSmsProvider,
  getWhatsAppProvider,
} from "../../src/lib/otp-providers";
import {
  whatsappAddress,
  whatsappRecipient,
} from "../../src/lib/twilio-provider";

const ENV_KEYS = [
  "OTP_WHATSAPP_ENABLED",
  "OTP_SMS_ENABLED",
  "OTP_WHATSAPP_PROVIDER",
  "OTP_SMS_PROVIDER",
  "DEFAULT_DIAL_CODE",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** Fake provider that records recipients and replays scripted outcomes. */
function fakeProvider(name: string, outcomes: boolean[]) {
  const calls: Array<{ to: string; body: string }> = [];
  let i = 0;
  return {
    name,
    calls,
    async send(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
      calls.push({ to, body });
      const ok = outcomes[i++] ?? false;
      return ok ? { ok: true } : { ok: false, error: `${name} refused` };
    },
  };
}

const PHONE = "+34612345678";

describe("envFlag", () => {
  it("uses the fallback when unset or empty", () => {
    delete process.env.OTP_WHATSAPP_ENABLED;
    expect(envFlag("OTP_WHATSAPP_ENABLED", true)).toBe(true);
    process.env.OTP_WHATSAPP_ENABLED = "   ";
    expect(envFlag("OTP_WHATSAPP_ENABLED", false)).toBe(false);
  });

  it("parses the usual truthy/falsey spellings", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on"]) {
      process.env.OTP_SMS_ENABLED = v;
      expect(envFlag("OTP_SMS_ENABLED", false), v).toBe(true);
    }
    for (const v of ["0", "false", "FALSE", "no", "off"]) {
      process.env.OTP_WHATSAPP_ENABLED = v;
      expect(envFlag("OTP_WHATSAPP_ENABLED", true), v).toBe(false);
    }
  });

  it("falls back on unrecognised values", () => {
    process.env.OTP_SMS_ENABLED = "banana";
    expect(envFlag("OTP_SMS_ENABLED", false)).toBe(false);
    process.env.OTP_WHATSAPP_ENABLED = "banana";
    expect(envFlag("OTP_WHATSAPP_ENABLED", true)).toBe(true);
  });
});

describe("channel configuration", () => {
  it("defaults to WhatsApp only (SMS fallback disabled)", () => {
    expect(whatsappEnabled()).toBe(true);
    expect(smsEnabled()).toBe(false);
    expect(otpChannels()).toEqual(["whatsapp"]);
    expect(primaryChannel()).toBe("whatsapp");
  });

  it("enables the SMS fallback via OTP_SMS_ENABLED", () => {
    process.env.OTP_SMS_ENABLED = "true";
    expect(otpChannels()).toEqual(["whatsapp", "sms"]);
  });

  it("supports SMS-only when WhatsApp is turned off", () => {
    process.env.OTP_WHATSAPP_ENABLED = "false";
    process.env.OTP_SMS_ENABLED = "true";
    expect(otpChannels()).toEqual(["sms"]);
    expect(primaryChannel()).toBe("sms");
  });

  it("reports no channel when everything is disabled", () => {
    process.env.OTP_WHATSAPP_ENABLED = "false";
    process.env.OTP_SMS_ENABLED = "false";
    expect(otpChannels()).toEqual([]);
    expect(primaryChannel()).toBeNull();
  });
});

describe("sendOtp — channel dispatch", () => {
  it("delivers over WhatsApp by default and never touches SMS", async () => {
    const wa = fakeProvider("whatsapp", [true]);
    const sms = fakeProvider("sms", [true]);
    const res = await sendOtp(PHONE, "123456", {
      whatsapp: wa,
      sms: sms,
    });
    expect(res).toMatchObject({ ok: true, channel: "whatsapp" });
    expect(res.attempted).toEqual(["whatsapp"]);
    expect(wa.calls).toHaveLength(1);
    expect(wa.calls[0].to).toBe(PHONE);
    expect(wa.calls[0].body).toBe(buildOtpBody("123456"));
    expect(sms.calls).toHaveLength(0);
  });

  it("falls back to SMS only when the fallback is enabled", async () => {
    process.env.OTP_SMS_ENABLED = "true";
    const wa = fakeProvider("whatsapp", [false]);
    const sms = fakeProvider("sms", [true]);
    const res = await sendOtp(PHONE, "123456", {
      whatsapp: wa,
      sms: sms,
    });
    expect(res).toMatchObject({ ok: true, channel: "sms" });
    expect(res.attempted).toEqual(["whatsapp", "sms"]);
    expect(wa.calls).toHaveLength(1);
    expect(sms.calls).toHaveLength(1);
    expect(sms.calls[0].to).toBe(PHONE);
  });

  it("does NOT call SMS when WhatsApp delivered", async () => {
    process.env.OTP_SMS_ENABLED = "true";
    const wa = fakeProvider("whatsapp", [true]);
    const sms = fakeProvider("sms", [true]);
    const res = await sendOtp(PHONE, "123456", {
      whatsapp: wa,
      sms: sms,
    });
    expect(res.channel).toBe("whatsapp");
    expect(sms.calls).toHaveLength(0);
  });

  it("fails without calling SMS when the fallback is disabled", async () => {
    const wa = fakeProvider("whatsapp", [false]);
    const sms = fakeProvider("sms", [true]);
    const res = await sendOtp(PHONE, "123456", {
      whatsapp: wa,
      sms: sms,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("whatsapp refused");
    expect(res.attempted).toEqual(["whatsapp"]);
    expect(sms.calls).toHaveLength(0);
  });

  it("never touches the network when every channel is disabled", async () => {
    process.env.OTP_WHATSAPP_ENABLED = "false";
    const wa = fakeProvider("whatsapp", [true]);
    const res = await sendOtp(PHONE, "123456", {
      whatsapp: wa,
    });
    expect(res).toMatchObject({
      ok: false,
      error: "no otp channel enabled",
      attempted: [],
    });
    expect(wa.calls).toHaveLength(0);
  });

  it("reports an unconfigured provider instead of throwing", async () => {
    const res = await sendOtp(PHONE, "123456", { whatsapp: null });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("whatsapp provider not configured");
    expect(res.attempted).toEqual(["whatsapp"]);
  });

  it("rejects an unusable phone before calling any provider", async () => {
    const wa = fakeProvider("whatsapp", [true]);
    const res = await sendOtp("???", "123456", {
      whatsapp: wa,
    });
    expect(res.ok).toBe(false);
    expect(wa.calls).toHaveLength(0);
  });

  it("resolves the provider from env when not injected", async () => {
    process.env.OTP_WHATSAPP_PROVIDER = "nope";
    const res = await sendOtp(PHONE, "123456");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("whatsapp provider not configured");
  });
});

describe("provider registry (the two abstraction layers)", () => {
  it("defaults both layers to the Twilio providers", () => {
    expect(getWhatsAppProvider()?.name).toBe("twilio");
    expect(getSmsProvider()?.name).toBe("twilio");
  });

  it("returns null for an unknown provider name", () => {
    process.env.OTP_WHATSAPP_PROVIDER = "does-not-exist";
    process.env.OTP_SMS_PROVIDER = "does-not-exist";
    expect(getWhatsAppProvider()).toBeNull();
    expect(getSmsProvider()).toBeNull();
  });
});

describe("Twilio addressing helpers", () => {
  it("normalises a WhatsApp sender to the whatsapp: address form", () => {
    expect(whatsappAddress("+14155238886")).toBe("whatsapp:+14155238886");
    expect(whatsappAddress("14155238886")).toBe("whatsapp:+14155238886");
    expect(whatsappAddress("whatsapp:+14155238886")).toBe(
      "whatsapp:+14155238886"
    );
  });

  it("prefixes the WhatsApp recipient, leaving SMS bare", () => {
    expect(whatsappRecipient("+34612345678")).toBe("whatsapp:+34612345678");
  });
});
