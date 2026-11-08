import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-side failure logging (src/lib/failure-log.ts + the routes that now
 * call it).
 *
 * The audit this file guards: a route answering a well-formed 5xx/404 from
 * inside a `catch` is INVISIBLE — the caller gets its JSON, the exception
 * never reaches Next's own error logging, and Dozzle stays empty (exactly
 * what happened with the silent OTP send). These tests assert, per failure
 * path, that:
 *
 *   1. the operator-visible line appears with area + machine code, and
 *   2. the HTTP response is unchanged (still the opaque error), and
 *   3. no secret/phone/full email/token reaches the line.
 */

// ── module doubles ──────────────────────────────────────────────────────────

const { prisma, savePhoto, deletePhoto, readPhoto, verifyPassword, createSession, encodeQr, requireSession } =
  vi.hoisted(() => ({
    prisma: {
      user: { findUnique: vi.fn() },
      photo: { create: vi.fn(), findFirst: vi.fn() },
      invitation: { findFirst: vi.fn() },
    },
    savePhoto: vi.fn(),
    deletePhoto: vi.fn(),
    readPhoto: vi.fn(),
    verifyPassword: vi.fn(),
    createSession: vi.fn(),
    encodeQr: vi.fn(),
    requireSession: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/storage", () => ({
  savePhoto,
  deletePhoto,
  readPhoto,
}));
vi.mock("@/lib/password", () => ({ verifyPassword }));
vi.mock("@/lib/session", () => ({ createSession, destroySession: vi.fn() }));
vi.mock("@/lib/qr", () => ({
  encodeQr,
  buildInvitationUrl: vi.fn(() => "https://bodapp.example/i/inv-1"),
}));
vi.mock("@/lib/auth-guard", () => ({
  requireSession,
  tenantWhere: (session: { weddingId: string }, extra = {}) => ({
    ...extra,
    weddingId: session.weddingId,
  }),
}));

import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as uploadPhoto } from "../../src/app/api/photos/route";
import { GET as invitationQr } from "../../src/app/api/invitation/[id]/qr/route";
import { verifyOtpRequest, baseGen } from "../../src/lib/otp-flow";
import type { OtpFlowDeps } from "../../src/lib/otp-flow";
import { resolveMapEmbedUrl } from "../../src/lib/maps-url";
import {
  errText,
  logFailure,
  logWarn,
  maskEmail,
} from "../../src/lib/failure-log";
import { redactLogText } from "../../src/lib/redact";

// ── console spies ───────────────────────────────────────────────────────────

const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

const errorLines = () => errorSpy.mock.calls.map((a) => a.join(" "));
const warnLines = () => warnSpy.mock.calls.map((a) => a.join(" "));
const allLines = () => [...errorLines(), ...warnLines()];

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  errorSpy.mockClear();
  warnSpy.mockClear();
  vi.clearAllMocks();
  requireSession.mockResolvedValue({
    session: {
      userId: "user-1",
      weddingId: "wed-1",
      role: "couple",
    },
    error: null,
  });
});

afterEach(() => {
  delete process.env.EMAIL_VERIFICATION_REQUIRED;
});

// ── the helper itself ───────────────────────────────────────────────────────

describe("logFailure / logWarn", () => {
  it("emits the standard greppable shape", () => {
    logFailure("photos", "save_failed", "storage write failed: EACCES");
    expect(errorLines()[0]).toBe(
      '[photos] FAILED code=save_failed detail="storage write failed: EACCES"'
    );

    logWarn("auth", "login_failed", "bad password for a***@example.com");
    expect(warnLines()[0]).toBe(
      '[auth] WARN code=login_failed detail="bad password for a***@example.com"'
    );
  });

  it("redacts secrets, phones, emails, tokens and 6-digit codes", () => {
    process.env.TWILIO_AUTH_TOKEN = "tw-secret-1234";
    logFailure(
      "area",
      "code",
      "to +34611223344 via guest@example.com token=?token=abc999 with tw-secret-1234 code 123456"
    );

    const line = errorLines()[0];
    expect(line).not.toContain("611223344");
    expect(line).not.toContain("guest@example.com");
    expect(line).not.toContain("abc999");
    expect(line).not.toContain("tw-secret-1234");
    expect(line).not.toContain("123456");
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  it("keeps 3-5 digit diagnostics readable (HTTP status, Twilio codes)", () => {
    logFailure("qr", "x", "twilio http 401 twilio_code=20003");
    expect(errorLines()[0]).toContain("401");
    expect(errorLines()[0]).toContain("20003");
  });

  it("never throws", () => {
    expect(() => logFailure("a", "b")).not.toThrow();
    expect(() => logWarn("a", "b", "c")).not.toThrow();
    expect(errText(new Error("boom"))).toBe("boom");
    expect(errText("plain")).toBe("plain");
  });
});

describe("maskEmail", () => {
  it("keeps only the first local character and the domain", () => {
    expect(maskEmail("ana@example.com")).toBe("a***@example.com");
    expect(maskEmail("a@b.es")).toBe("a***@b.es");
  });

  it("marks junk instead of guessing", () => {
    expect(maskEmail("not-an-email")).toBe("[email]");
    expect(maskEmail("@nodomain")).toBe("[email]");
  });

  it("survives redaction (the asterisks break the address rule)", () => {
    expect(redactLogText(maskEmail("ana@example.com"))).toBe(
      "a***@example.com"
    );
  });
});

// ── login route ─────────────────────────────────────────────────────────────

describe("POST /api/auth/login — auth failures are visible", () => {
  it("warns on an unknown account with a MASKED address only", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await login(
      jsonRequest("http://localhost/api/auth/login", {
        email: "ana@example.com",
        password: "s3cret-pass",
      })
    );

    expect(res.status).toBe(401);
    expect(warnLines()).toHaveLength(1);
    expect(warnLines()[0]).toContain("[auth] WARN code=login_failed");
    expect(warnLines()[0]).toContain("unknown account a***@example.com");
    expect(warnLines()[0]).not.toContain("ana@example.com");
    expect(warnLines()[0]).not.toContain("s3cret-pass");
  });

  it("warns on a bad password (distinct detail, still masked)", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "ana@example.com",
      passwordHash: "hash",
      weddingId: "wed-1",
      role: "couple",
      emailVerifiedAt: new Date(),
    });
    verifyPassword.mockResolvedValue(false);

    const res = await login(
      jsonRequest("http://localhost/api/auth/login", {
        email: "ana@example.com",
        password: "wrong",
      })
    );

    expect(res.status).toBe(401);
    expect(warnLines()[0]).toContain("bad password for a***@example.com");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("warns when the verification gate blocks the sign-in", async () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = "true";
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "ana@example.com",
      passwordHash: "hash",
      weddingId: "wed-1",
      role: "couple",
      emailVerifiedAt: null,
    });
    verifyPassword.mockResolvedValue(true);

    const res = await login(
      jsonRequest("http://localhost/api/auth/login", {
        email: "ana@example.com",
        password: "right",
      })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "email_not_verified" });
    expect(warnLines()[0]).toContain("[auth] WARN code=login_blocked");
    expect(warnLines()[0]).toContain("a***@example.com");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("stays quiet on a successful sign-in (no noise, no address in logs)", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "ana@example.com",
      passwordHash: "hash",
      weddingId: "wed-1",
      role: "couple",
      emailVerifiedAt: new Date(),
    });
    verifyPassword.mockResolvedValue(true);

    const res = await login(
      jsonRequest("http://localhost/api/auth/login", {
        email: "ana@example.com",
        password: "right",
      })
    );

    expect(res.status).toBe(200);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(allLines()).toHaveLength(0);
  });
});

// ── photos routes ───────────────────────────────────────────────────────────

function uploadRequest(): Request {
  const form = new FormData();
  form.append(
    "photo",
    new File([new Uint8Array([137, 80, 78, 71])], "shot.png", {
      type: "image/png",
    })
  );
  return new Request("http://localhost/api/photos?purpose=gallery", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/photos — storage failures are visible", () => {
  it("logs save_failed when the file cannot be written", async () => {
    savePhoto.mockRejectedValue(new Error("EACCES: permission denied, open"));

    const res = await uploadPhoto(uploadRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "save_failed" }); // unchanged
    expect(errorLines()[0]).toContain("[photos] FAILED code=save_failed");
    expect(errorLines()[0]).toContain("EACCES");
    expect(prisma.photo.create).not.toHaveBeenCalled();
  });

  it("logs create_failed when the DB insert fails after the write", async () => {
    savePhoto.mockResolvedValue("uuid.png");
    prisma.photo.create.mockRejectedValue(new Error("connection refused"));
    deletePhoto.mockResolvedValue(undefined);

    const res = await uploadPhoto(uploadRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "create_failed" });
    expect(errorLines()[0]).toContain("[photos] FAILED code=create_failed");
    expect(errorLines()[0]).toContain("connection refused");
    expect(deletePhoto).toHaveBeenCalledWith("uuid.png"); // orphan cleaned
  });

  it("warns when even the orphan cleanup fails (stray file on disk)", async () => {
    savePhoto.mockResolvedValue("uuid.png");
    prisma.photo.create.mockRejectedValue(new Error("connection refused"));
    deletePhoto.mockRejectedValue(new Error("ENOENT"));

    await uploadPhoto(uploadRequest());

    expect(errorLines()[0]).toContain("code=create_failed");
    expect(warnLines()[0]).toContain("[photos] WARN code=orphan_cleanup_failed");
    expect(warnLines()[0]).toContain("uuid.png");
  });
});

describe("GET /api/invitation/[id]/qr — QR failures are visible", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("logs db_failed when the invitation lookup throws", async () => {
    prisma.invitation.findFirst.mockRejectedValue(new Error("db timeout"));

    const res = await invitationQr(
      new Request("http://localhost/api/invitation/inv-1/qr"),
      ctx("inv-1")
    );

    expect(res.status).toBe(500);
    expect(errorLines()[0]).toContain("[qr] FAILED code=db_failed");
    expect(errorLines()[0]).toContain("db timeout");
  });

  it("logs encode_failed when QR generation throws", async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      id: "inv-1",
      wedding: { slug: "ana-luis" },
    });
    encodeQr.mockRejectedValue(new Error("qr library exploded"));

    const res = await invitationQr(
      new Request("http://localhost/api/invitation/inv-1/qr"),
      ctx("inv-1")
    );

    expect(res.status).toBe(500);
    expect(errorLines()[0]).toContain("[qr] FAILED code=encode_failed");
    expect(errorLines()[0]).toContain("inv-1");
  });
});

// ── OTP verification refusals ───────────────────────────────────────────────

describe("verifyOtpRequest — every refusal reason is logged", () => {
  const PHONE = "+34611223344";

  function deps(overrides: Partial<OtpFlowDeps> = {}): OtpFlowDeps {
    return {
      findInvitation: async () => ({
        id: "inv-1",
        weddingId: "wed-1",
        acceptedPhones: [PHONE],
      }),
      createOtp: async () => "otp-1",
      findPendingOtp: async () => null,
      incrementAttempts: async () => 1,
      consumeOtp: async () => {},
      rateLimiter: { allowed: () => true },
      sendSms: async () => ({ ok: true, channel: "whatsapp" }),
      gen: baseGen(),
      otpTtlMs: 600_000,
      ...overrides,
    };
  }

  it("logs an unknown invitation at verify time — without the token", async () => {
    const token = "inv-9f2c1secretvalue";
    const out = await verifyOtpRequest(
      token,
      PHONE,
      "123456",
      deps({ findInvitation: async () => null })
    );

    expect(out.ok).toBe(false);
    expect(errorLines()[0]).toContain(
      "[otp] REQUEST REFUSED reason=verify_invitation_unknown"
    );
    expect(errorLines()[0]).not.toContain(token);
  });

  it("logs a missing/expired/consumed code", async () => {
    await verifyOtpRequest("tok", PHONE, "123456", deps());

    expect(errorLines()[0]).toContain(
      "reason=verify_no_pending_code"
    );
  });

  it("logs a locked-out phone", async () => {
    await verifyOtpRequest(
      "tok",
      PHONE,
      "123456",
      deps({
        findPendingOtp: async () => ({
          id: "otp-1",
          codeHash: baseGen().hashOtp("123456"),
          attempts: 3,
        }),
      })
    );

    expect(errorLines()[0]).toContain("reason=verify_locked_out");
  });

  it("logs a wrong code — and never the submitted or stored code", async () => {
    const out = await verifyOtpRequest(
      "tok",
      PHONE,
      "000000",
      deps({
        findPendingOtp: async () => ({
          id: "otp-1",
          codeHash: baseGen().hashOtp("123456"),
          attempts: 0,
        }),
      })
    );

    expect(out.ok).toBe(false);
    expect(errorLines()[0]).toContain("reason=verify_wrong_code");
    expect(errorLines()[0]).not.toContain("000000");
    expect(errorLines()[0]).not.toContain("123456");
  });
});

// ── maps link resolution ────────────────────────────────────────────────────

describe("resolveMapEmbedUrl — fail-open must not be invisible", () => {
  it("warns when the outbound resolve fails and still returns the input", async () => {
    const boom = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND maps.app.goo.gl");
    });

    const out = await resolveMapEmbedUrl(
      "https://maps.app.goo.gl/abc",
      boom as unknown as typeof fetch
    );

    expect(out).toBe("https://maps.app.goo.gl/abc"); // fail-open, unchanged
    expect(warnLines()[0]).toContain("[maps] WARN code=resolve_failed");
    expect(warnLines()[0]).toContain("ENOTFOUND");
  });
});