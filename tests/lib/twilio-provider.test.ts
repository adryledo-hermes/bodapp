import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Transport contract for Twilio's Messages API.
 *
 * Why this file exists: twilioPost() once labelled its (correct) credentials
 * `Authorization: Bearer` — Twilio only accepts HTTP Basic, so every send came
 * back 401 / 20003 ("Authenticate") while the credentials were perfect. No
 * test caught it because nothing ever looked at the request headers. These
 * assertions pin the scheme, endpoint and body.
 *
 * No network: fetch is stubbed with a scripted Response.
 */
import {
  twilioSmsProvider,
  twilioWhatsAppProvider,
} from "../../src/lib/twilio-provider";

const PHONE = "+346****3344";
const SID = "ACtest-not-a-real-sid-0001";
const TOKEN = "tw-auth-tok...";
const BASIC = `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}`;

const ENV_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_FROM",
  "TWILIO_WHATSAPP_CONTENT_SID",
  "TWILIO_PHONE_NUMBER",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.TWILIO_ACCOUNT_SID = SID;
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** Stub fetch; the returned mock lets tests inspect the outgoing request. */
function stubFetch(status = 201) {
  const mock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ sid: "SM123" }), { status })
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function headersOf(mock: { mock: { calls: unknown[][] } }) {
  const init = mock.mock.calls[0]?.[1] as RequestInit | undefined;
  return (init?.headers ?? {}) as Record<string, string>;
}

describe("twilio auth header", () => {
  it("sends HTTP Basic base64(AccountSID:AuthToken) — Twilio rejects Bearer", async () => {
    const mock = stubFetch();

    const result = await twilioWhatsAppProvider.send(PHONE, "Bodapp code 123");

    expect(result.ok).toBe(true);
    // The exact bug: identical bytes, wrong scheme -> 401/20003 with valid creds.
    expect(headersOf(mock).Authorization).toBe(BASIC);
    expect(headersOf(mock).Authorization).not.toMatch(/^Bearer\b/);
  });

  it("uses the same scheme on the SMS channel", async () => {
    process.env.TWILIO_PHONE_NUMBER = "+15550000001";
    const mock = stubFetch();

    await twilioSmsProvider.send(PHONE, "Bodapp code 123");

    expect(headersOf(mock).Authorization).toBe(BASIC);
  });

  it("posts a form body to the account-scoped Messages endpoint", async () => {
    const mock = stubFetch();

    await twilioWhatsAppProvider.send(PHONE, "Bodapp code 123");

    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`
    );
    expect(init.method).toBe("POST");
    const ct = (init.headers as Record<string, string>)["Content-Type"];
    expect(ct).toContain("application/x-www-form-urlencoded");
    const body = String(init.body);
    expect(body).toContain("To=whatsapp");
    expect(body).toContain("Body=Bodapp");
  });

  it("keeps the auth token out of the URL and the returned error", async () => {
    const mock = stubFetch(401);

    const result = await twilioWhatsAppProvider.send(PHONE, "Bodapp code 123");

    const [url] = mock.mock.calls[0] as [string];
    expect(url).not.toContain(TOKEN);
    expect(result.error ?? "").not.toContain(TOKEN);
  });
});
