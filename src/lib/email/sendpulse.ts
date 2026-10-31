/**
 * SendPulse SMTP API client — REST + `Authorization: Bearer <SENDPULSE_API_KEY>`
 * (no OAuth, no SDK, no extra dependency).
 *
 * Base URL: https://api.sendpulse.com (overridable via SENDPULSE_API_BASE_URL)
 *
 *   sendEmail()  → POST /smtp/emails   send one email (html and/or text)
 *   verifyAuth() → GET  /user/info     check the API key / show account info
 *   loadConfig() reads env ONLY:
 *     SENDPULSE_API_KEY        (required)
 *     SENDPULSE_API_FROM_EMAIL (required, must be a verified sender)
 *     SENDPULSE_API_FROM_NAME  (optional)
 *     SENDPULSE_API_BASE_URL   (optional, default https://api.sendpulse.com)
 *
 * Secrets are never logged and never hardcoded; every failure surfaces as a
 * SendPulseError with `code` + HTTP `status` + the API's own message, so
 * callers can distinguish a bad key (401), an unverified sender (422) and a
 * plan rate/quota hit (429) without parsing free text.
 */

// The message payload is defined in the provider-neutral contract (./types)
// so the abstraction layer and this client share ONE definition of it.
import type { EmailFrom, EmailMessage } from "./types";

export const SENDPULSE_DEFAULT_BASE_URL = "https://api.sendpulse.com";

/**
 * Pre-verified sender of SendPulse's SMTP Test (demo) plan — the default
 * `SENDPULSE_API_FROM_EMAIL` while the account is on that plan. It stops
 * existing as soon as you verify your own domain/sender.
 */
export const SENDPULSE_TEST_PLAN_SENDER = "devtest@sendpulseemail.com";

export type SendPulseErrorCode =
  | "missing_config"
  | "invalid_input"
  | "rate_limited"
  | "auth"
  | "http_error"
  | "network"
  | "invalid_response";

/** Every failure this module raises. `status`/`body` present for HTTP errors. */
export class SendPulseError extends Error {
  readonly code: SendPulseErrorCode;
  readonly status?: number;
  readonly body?: string;

  constructor(
    message: string,
    code: SendPulseErrorCode,
    extra: { status?: number; body?: string } = {}
  ) {
    super(message);
    this.name = "SendPulseError";
    this.code = code;
    this.status = extra.status;
    this.body = extra.body;
  }
}

export interface SendPulseConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
  baseUrl: string;
}

// `EmailFrom` / `EmailMessage` live in ./types (provider-neutral contract);
// re-exported here so existing `from "@/lib/email/sendpulse"` imports keep
// working unchanged.
export type { EmailFrom, EmailMessage };

export interface SendEmailResult {
  ok: true;
  /** SendPulse's message id, when it returns one. */
  id?: string;
  response: unknown;
}

type EnvLike = Record<string, string | undefined>;

/**
 * Build the config from env. Missing required values raise a SendPulseError
 * that names exactly what is absent (and which sender to use on the Test
 * plan) instead of failing later with an opaque 401/422.
 */
export function loadConfig(env: EnvLike = process.env): SendPulseConfig {
  const apiKey = (env.SENDPULSE_API_KEY ?? "").trim();
  const fromEmail = (env.SENDPULSE_API_FROM_EMAIL ?? "").trim();
  const missing: string[] = [];

  if (!apiKey) missing.push("SENDPULSE_API_KEY");
  if (!fromEmail) {
    missing.push(
      `SENDPULSE_API_FROM_EMAIL (verified sender — on the SMTP Test plan use ${SENDPULSE_TEST_PLAN_SENDER})`
    );
  }
  if (missing.length > 0) {
    throw new SendPulseError(
      `SendPulse is not configured — missing ${missing.join("; ")}`,
      "missing_config"
    );
  }

  const baseUrl = (env.SENDPULSE_API_BASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  const fromName = (env.SENDPULSE_API_FROM_NAME ?? "").trim();

  return {
    apiKey,
    fromEmail,
    fromName: fromName || undefined,
    baseUrl: baseUrl || SENDPULSE_DEFAULT_BASE_URL,
  };
}

/** Pull the API's own message out of an error body (json.message/error or text). */
function extractDetail(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      for (const key of ["message", "error", "error_description", "detail"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
      // SendPulse sometimes nests: { result: false, message: ... }
      return trimmed.slice(0, 300);
    }
  } catch {
    /* not JSON — fall through to the raw text */
  }
  return trimmed.slice(0, 300);
}

/** Map a non-2xx response to the right typed error. */
function httpError(status: number, raw: string): SendPulseError {
  const detail = extractDetail(raw);
  const body = raw.slice(0, 1000);

  if (status === 429) {
    return new SendPulseError(
      `SendPulse rate limit / quota exceeded (HTTP 429)${
        detail ? `: ${detail}` : ""
      }. Limits are plan-dependent — wait and retry, or check your plan.`,
      "rate_limited",
      { status, body }
    );
  }
  if (status === 401 || status === 403) {
    return new SendPulseError(
      `SendPulse rejected the API key (HTTP ${status})${
        detail ? `: ${detail}` : ""
      } — check SENDPULSE_API_KEY.`,
      "auth",
      { status, body }
    );
  }
  if (status === 422) {
    const senderHint = /sender/i.test(detail)
      ? ` Set SENDPULSE_API_FROM_EMAIL to a verified sender (SMTP Test plan: ${SENDPULSE_TEST_PLAN_SENDER}).`
      : "";
    return new SendPulseError(
      `SendPulse rejected the request (HTTP 422)${detail ? `: ${detail}` : ""}.${senderHint}`,
      "http_error",
      { status, body }
    );
  }
  return new SendPulseError(
    `SendPulse API error (HTTP ${status})${detail ? `: ${detail}` : ""}`,
    "http_error",
    { status, body }
  );
}

/** Core request: Bearer auth, JSON in/out, typed errors. Never logs secrets. */
async function request<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: string },
  config: SendPulseConfig
): Promise<T> {
  const authHeader = ["Bearer", config.apiKey].join(" ");
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: authHeader,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SendPulseError(
      `Could not reach SendPulse at ${config.baseUrl}: ${reason}`,
      "network"
    );
  }

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    throw httpError(res.status, raw);
  }
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new SendPulseError(
      "SendPulse returned a non-JSON response",
      "invalid_response",
      { status: res.status, body: raw.slice(0, 300) }
    );
  }
}

/**
 * sendEmail() → POST /smtp/emails
 *
 * Payload shape (SendPulse SMTP API):
 * { email: { subject, html, text, from: { email, name }, to: [{ email }] } }
 */
export async function sendEmail(
  message: EmailMessage,
  config: SendPulseConfig = loadConfig()
): Promise<SendEmailResult> {
  const recipients = (
    Array.isArray(message.to) ? message.to : [message.to]
  )
    .map((address) => address.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    throw new SendPulseError("sendEmail: at least one recipient is required", "invalid_input");
  }
  if (!message.subject.trim()) {
    throw new SendPulseError("sendEmail: subject is required", "invalid_input");
  }
  if (!message.html?.trim() && !message.text?.trim()) {
    throw new SendPulseError(
      "sendEmail: provide html and/or text",
      "invalid_input"
    );
  }

  const from = message.from ?? {
    email: config.fromEmail,
    name: config.fromName,
  };

  const email: Record<string, unknown> = {
    subject: message.subject,
    from: {
      email: from.email,
      ...(from.name ? { name: from.name } : {}),
    },
    to: recipients.map((address) => ({ email: address })),
  };
  if (message.html?.trim()) email.html = message.html;
  if (message.text?.trim()) email.text = message.text;

  const response = await request<unknown>(
    "/smtp/emails",
    { method: "POST", body: JSON.stringify({ email }) },
    config
  );

  const id =
    response && typeof response === "object" && "id" in response
      ? String((response as { id: unknown }).id)
      : undefined;

  return { ok: true, id, response };
}

/** verifyAuth() → GET /user/info — proves the key works and shows the account. */
export async function verifyAuth(
  config: SendPulseConfig = loadConfig()
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/user/info", { method: "GET" }, config);
}

/** Convenience: is this failure a plan rate/quota hit? */
export function isRateLimit(error: unknown): boolean {
  return error instanceof SendPulseError && error.code === "rate_limited";
}
