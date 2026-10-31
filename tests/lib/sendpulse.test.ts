import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SENDPULSE_DEFAULT_BASE_URL,
  SENDPULSE_TEST_PLAN_SENDER,
  SendPulseError,
  isRateLimit,
  loadConfig,
  sendEmail,
  verifyAuth,
} from "../../src/lib/email/sendpulse";

const KEY = "test-api-key-123";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Resolve the next fetch call with a JSON Response. */
function respond(status: number, body: unknown): void {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  // 204/205 must not carry a body — Response() rejects them otherwise.
  const noBody = status === 204 || status === 205;
  fetchMock.mockResolvedValue(new Response(noBody ? null : payload, { status }));
}

/** Await a call that must fail, returning the typed error. */
async function expectFailure(promise: Promise<unknown>): Promise<SendPulseError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SendPulseError) return error;
    throw error;
  }
  throw new Error("expected a SendPulseError, but the call resolved");
}

function baseEnv(overrides: Record<string, string> = {}) {
  return { SENDPULSE_API_KEY: KEY, SENDPULSE_API_FROM_EMAIL: "me@example.com", ...overrides };
}

describe("loadConfig", () => {
  it("builds the config from env with the default base URL", () => {
    const config = loadConfig(baseEnv());
    expect(config).toEqual({
      apiKey: KEY,
      fromEmail: "me@example.com",
      fromName: undefined,
      baseUrl: SENDPULSE_DEFAULT_BASE_URL,
    });
    expect(SENDPULSE_DEFAULT_BASE_URL).toBe("https://api.sendpulse.com");
  });

  it("keeps optional from-name and overrides the base URL (trailing slash trimmed)", () => {
    const config = loadConfig(
      baseEnv({
        SENDPULSE_API_FROM_NAME: "Bodapp",
        SENDPULSE_API_BASE_URL: "https://proxy.example.com/",
      })
    );
    expect(config.fromName).toBe("Bodapp");
    expect(config.baseUrl).toBe("https://proxy.example.com");
  });

  it("names every missing required variable (and the Test-plan sender hint)", () => {
    let error: SendPulseError | undefined;
    try {
      loadConfig({});
    } catch (caught) {
      error = caught as SendPulseError;
    }
    expect(error).toBeInstanceOf(SendPulseError);
    expect(error!.code).toBe("missing_config");
    expect(error!.message).toContain("SENDPULSE_API_KEY");
    expect(error!.message).toContain("SENDPULSE_API_FROM_EMAIL");
    expect(error!.message).toContain(SENDPULSE_TEST_PLAN_SENDER);
  });

  it("treats blank/whitespace values as missing", () => {
    expect(() => loadConfig(baseEnv({ SENDPULSE_API_KEY: "   " }))).toThrow(
      SendPulseError
    );
  });

  it("never puts the key into the error message", () => {
    try {
      loadConfig(baseEnv({ SENDPULSE_API_FROM_EMAIL: "" }));
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(KEY);
    }
  });
});

describe("sendEmail → POST /smtp/emails", () => {
  it("posts the documented payload with Bearer auth", async () => {
    respond(200, { result: true, id: "msg-1" });
    const result = await sendEmail(
      {
        to: "guest@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
        text: "Hello",
      },
      loadConfig(baseEnv({ SENDPULSE_API_FROM_NAME: "Sender" }))
    );

    expect(result).toMatchObject({ ok: true, id: "msg-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.sendpulse.com/smtp/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      email: {
        subject: "Test",
        from: { email: "me@example.com", name: "Sender" },
        to: [{ email: "guest@example.com" }],
        html: "<p>Hello</p>",
        text: "Hello",
      },
    });
  });

  it("accepts several recipients and a per-message from override", async () => {
    respond(200, {});
    await sendEmail(
      {
        to: ["a@example.com", " b@example.com ", ""],
        subject: "Hi",
        text: "hi",
        from: { email: "noreply@example.com" },
      },
      loadConfig(baseEnv())
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.email.to).toEqual([
      { email: "a@example.com" },
      { email: "b@example.com" },
    ]);
    expect(body.email.from).toEqual({ email: "noreply@example.com" });
    // No name configured and none given → key omitted, not empty string.
    expect(body.email.from.name).toBeUndefined();
  });

  it("sends only the parts provided (html-only omits text)", async () => {
    respond(200, {});
    await sendEmail(
      { to: "a@example.com", subject: "Hi", html: "<p>hi</p>" },
      loadConfig(baseEnv())
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.email).not.toHaveProperty("text");
  });

  it("uses the overridden base URL", async () => {
    respond(200, {});
    await sendEmail(
      { to: "a@example.com", subject: "Hi", text: "hi" },
      loadConfig(baseEnv({ SENDPULSE_API_BASE_URL: "http://localhost:8080" }))
    );
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8080/smtp/emails");
  });

  it("validates input before any network call", async () => {
    const config = loadConfig(baseEnv());
    await expect(
      sendEmail({ to: "  ", subject: "Hi", text: "hi" }, config)
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      sendEmail({ to: "a@example.com", subject: " ", text: "hi" }, config)
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      sendEmail({ to: "a@example.com", subject: "Hi" }, config)
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("HTTP error mapping", () => {
  const config = () => loadConfig(baseEnv());
  const message = { to: "a@example.com", subject: "Hi", text: "hi" };

  it("maps 429 to rate_limited with the API's own message (no hardcoded quotas)", async () => {
    respond(429, { message: "Limit exceeded for current plan" });
    const error = await expectFailure(sendEmail(message, config()));
    expect(error).toBeInstanceOf(SendPulseError);
    expect(error.code).toBe("rate_limited");
    expect(error.status).toBe(429);
    expect(error.message).toContain("Limit exceeded for current plan");
    expect(isRateLimit(error)).toBe(true);
    // Quotas are plan-dependent: nothing specific may be baked in.
    expect(error.message).not.toMatch(/\b50\b|\b10 per hour\b/);
  });

  it("maps 401 to a key problem", async () => {
    respond(401, { message: "Unauthorized" });
    const error = await expectFailure(sendEmail(message, config()));
    expect(error.code).toBe("auth");
    expect(error.message).toContain("SENDPULSE_API_KEY");
    expect(error.message).not.toContain(KEY);
  });

  it("maps 422 and hints at verified senders when the API mentions the sender", async () => {
    respond(422, { message: "Sender is not valid" });
    const error = await expectFailure(sendEmail(message, config()));
    expect(error.code).toBe("http_error");
    expect(error.status).toBe(422);
    expect(error.message).toContain("Sender is not valid");
    expect(error.message).toContain(SENDPULSE_TEST_PLAN_SENDER);
  });

  it("keeps other statuses as http_error with the response detail", async () => {
    respond(500, "boom");
    const error = await expectFailure(sendEmail(message, config()));
    expect(error.code).toBe("http_error");
    expect(error.status).toBe(500);
    expect(error.message).toContain("boom");
    expect(error.body).toContain("boom");
  });

  it("accepts a 204-style empty 2xx body", async () => {
    respond(204, "");
    const result = await sendEmail(message, config());
    expect(result.ok).toBe(true);
    expect(result.id).toBeUndefined();
  });

  it("rejects a non-JSON 2xx body", async () => {
    respond(200, "<html>oops</html>");
    const error = await expectFailure(sendEmail(message, config()));
    expect(error.code).toBe("invalid_response");
  });

  it("wraps network failures instead of throwing raw", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const error = await expectFailure(sendEmail(message, config()));
    expect(error).toBeInstanceOf(SendPulseError);
    expect(error.code).toBe("network");
    expect(error.message).toContain(SENDPULSE_DEFAULT_BASE_URL);
  });
});

describe("verifyAuth → GET /user/info", () => {
  it("GETs user info with Bearer auth and returns the parsed body", async () => {
    respond(200, { email: "owner@example.com", info: {} });
    const info = await verifyAuth(loadConfig(baseEnv()));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.sendpulse.com/user/info");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).toBeUndefined();
    expect(info).toMatchObject({ email: "owner@example.com" });
  });

  it("surfaces an invalid key as a clear auth error", async () => {
    respond(401, { message: "Access denied" });
    const error = await expectFailure(verifyAuth(loadConfig(baseEnv())));
    expect(error.code).toBe("auth");
    expect(error.message).toContain("Access denied");
  });

  it("fails with missing_config before any request when the key is absent", async () => {
    let error: SendPulseError | undefined;
    try {
      loadConfig({ SENDPULSE_API_FROM_EMAIL: "x@example.com" });
    } catch (caught) {
      error = caught as SendPulseError;
    }
    expect(error?.code).toBe("missing_config");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
