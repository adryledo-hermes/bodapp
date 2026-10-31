import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EMAIL_PROVIDER,
  EMAIL_PROVIDERS,
  getEmailProvider,
  listEmailProviders,
  sendEmail,
} from "../../src/lib/email/email-providers";
import { sendpulseEmailProvider } from "../../src/lib/email/sendpulse-provider";
import type { EmailMessage, EmailProvider } from "../../src/lib/email/types";

const KEY = "test-api-key-123";

const message: EmailMessage = {
  to: "guest@example.com",
  subject: "Hola",
  html: "<p>Hola</p>",
  text: "Hola",
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // Deterministic SendPulse credentials for every test in this file.
  vi.stubEnv("SENDPULSE_API_KEY", KEY);
  vi.stubEnv("SENDPULSE_API_FROM_EMAIL", "me@example.com");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Resolve the next fetch call with a JSON Response. */
function respond(status: number, body: unknown): void {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const noBody = status === 204 || status === 205;
  fetchMock.mockResolvedValue(new Response(noBody ? null : payload, { status }));
}

describe("getEmailProvider", () => {
  it("defaults to sendpulse when EMAIL_PROVIDER is unset, empty or blank", () => {
    const envs: Array<Record<string, string | undefined>> = [
      {},
      { EMAIL_PROVIDER: "" },
      { EMAIL_PROVIDER: "   " },
    ];
    for (const env of envs) {
      expect(getEmailProvider(env)?.name).toBe("sendpulse");
    }
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(getEmailProvider({ EMAIL_PROVIDER: " SendPulse " })).toBe(
      sendpulseEmailProvider
    );
  });

  it("resolves to null (not a throw) for an unknown provider", () => {
    expect(getEmailProvider({ EMAIL_PROVIDER: "mailgun" })).toBeNull();
  });

  it("keeps the default as a registered name", () => {
    expect(DEFAULT_EMAIL_PROVIDER).toBe("sendpulse");
    expect(EMAIL_PROVIDERS[DEFAULT_EMAIL_PROVIDER]).toBeDefined();
    expect(listEmailProviders()).toContain(DEFAULT_EMAIL_PROVIDER);
  });
});

describe("EMAIL_PROVIDERS registry", () => {
  it("exposes sendpulse under a stable key", () => {
    expect(EMAIL_PROVIDERS.sendpulse).toBe(sendpulseEmailProvider);
    expect(sendpulseEmailProvider.name).toBe("sendpulse");
  });

  it("keeps every registered provider on the contract", () => {
    for (const provider of Object.values(EMAIL_PROVIDERS)) {
      expect(typeof provider.name).toBe("string");
      expect(provider.name.length).toBeGreaterThan(0);
      expect(typeof provider.send).toBe("function");
    }
  });

  it("makes a new provider selectable with a single registry entry", async () => {
    const received: EmailMessage[] = [];
    const fake: EmailProvider = {
      name: "fake",
      async send(mail) {
        received.push(mail);
        return { ok: true, id: "fake-1" };
      },
    };
    EMAIL_PROVIDERS.fake = fake;
    try {
      expect(getEmailProvider({ EMAIL_PROVIDER: "fake" })).toBe(fake);
      const result = await sendEmail(message, { EMAIL_PROVIDER: "fake" });
      expect(result).toEqual({ ok: true, id: "fake-1" });
      expect(received).toEqual([message]);
    } finally {
      delete EMAIL_PROVIDERS.fake;
    }
  });
});

describe("sendEmail (app-facing entry point)", () => {
  it("returns a failed result — never throws — for an unknown provider", async () => {
    const result = await sendEmail(message, { EMAIL_PROVIDER: "nope" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("not_configured");
    expect(result.error).toContain("nope");
    expect(result.error).toContain("sendpulse");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delegates to the selected provider and returns its result verbatim", async () => {
    respond(200, { result: true, id: "msg-9" });
    const result = await sendEmail(message, { EMAIL_PROVIDER: "sendpulse" });
    expect(result).toMatchObject({ ok: true, id: "msg-9" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.sendpulse.com/smtp/emails");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
  });
});

describe("sendpulseEmailProvider (adapter contract)", () => {
  it("maps absent credentials to not_configured without a network call", async () => {
    vi.stubEnv("SENDPULSE_API_KEY", "");
    const result = await sendpulseEmailProvider.send(message);
    expect(result).toMatchObject({ ok: false, code: "not_configured" });
    expect(result.error).toContain("SENDPULSE_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps 401 to auth without throwing", async () => {
    respond(401, { message: "Unauthorized" });
    const result = await sendpulseEmailProvider.send(message);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("auth");
    expect(result.error).not.toContain(KEY);
  });

  it("maps 429 to rate_limited, keeping the provider's own message", async () => {
    respond(429, { message: "Limit exceeded for current plan" });
    const result = await sendpulseEmailProvider.send(message);
    expect(result).toMatchObject({ ok: false, code: "rate_limited" });
    expect(result.error).toContain("Limit exceeded for current plan");
  });

  it("maps other HTTP failures to provider_error (the neutral bucket)", async () => {
    respond(422, { message: "Sender is not valid" });
    const result = await sendpulseEmailProvider.send(message);
    expect(result).toMatchObject({ ok: false, code: "provider_error" });
    expect(result.error).toContain("Sender is not valid");
  });

  it("wraps network failures instead of surfacing a raw throw", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const result = await sendpulseEmailProvider.send(message);
    expect(result).toMatchObject({ ok: false, code: "network" });
  });

  it("verifyAuth answers in the same neutral shape", async () => {
    respond(200, { email: "owner@example.com" });
    expect(await sendpulseEmailProvider.verifyAuth!()).toEqual({ ok: true });

    respond(401, { message: "Access denied" });
    const failure = await sendpulseEmailProvider.verifyAuth!();
    expect(failure).toMatchObject({ ok: false, code: "auth" });
  });
});
