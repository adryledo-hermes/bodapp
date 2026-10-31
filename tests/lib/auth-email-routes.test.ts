import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for the v1.4 account-security flows: the login gate, the
 * forgot-password email, the reset form handler and the verification link.
 * Prisma and the send helpers are stubbed — no database, no network.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    wedding: { findUnique: vi.fn() },
    authEmailToken: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    // The routes use the callback form: $transaction(async (tx) => …).
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: unknown) =>
    typeof fn === "function" ? fn(prisma) : Promise.all(fn as Promise<unknown>[])
  );
  return {
    prisma,
    createSession: vi.fn(),
    verifyPassword: vi.fn(),
    hashPassword: vi.fn(),
    sendVerificationEmail: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/session", () => ({ createSession: mocks.createSession }));
vi.mock("@/lib/password", () => ({
  verifyPassword: mocks.verifyPassword,
  hashPassword: mocks.hashPassword,
}));
vi.mock("@/lib/email/account", () => ({
  sendVerificationEmail: mocks.sendVerificationEmail,
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
}));

import { POST as login } from "../../src/app/api/auth/login/route";
import { GET as verifyEmail } from "../../src/app/api/auth/verify-email/route";
import { POST as resend } from "../../src/app/api/auth/verify-email/resend/route";
import { POST as forgot } from "../../src/app/api/auth/password/forgot/route";
import { POST as reset } from "../../src/app/api/auth/password/reset/route";
import {
  generateEmailToken,
  hashEmailToken,
} from "../../src/lib/auth-email";

const {
  prisma,
  createSession,
  verifyPassword,
  hashPassword,
  sendVerificationEmail,
  sendPasswordResetEmail,
} = mocks;

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const USER = {
  id: "user-1",
  email: "ana@example.com",
  passwordHash: "hashed",
  weddingId: "wed-1",
  role: "couple",
  emailVerifiedAt: null as Date | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EMAIL_VERIFICATION_REQUIRED;
  verifyPassword.mockResolvedValue(true);
  hashPassword.mockResolvedValue("new-hash");
  createSession.mockResolvedValue(undefined);
  sendVerificationEmail.mockResolvedValue(true);
  sendPasswordResetEmail.mockResolvedValue(true);
  prisma.wedding.findUnique.mockResolvedValue({ locale: "es" });
});

afterEach(() => {
  delete process.env.EMAIL_VERIFICATION_REQUIRED;
});

describe("POST /api/auth/login — email-validation gate", () => {
  it("blocks an unvalidated signup when EMAIL_VERIFICATION_REQUIRED is on", async () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = "true";
    prisma.user.findUnique.mockResolvedValue({ ...USER });

    const res = await login(
      jsonRequest("http://localhost/api/auth/login", {
        email: USER.email,
        password: "secret123",
      })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "email_not_verified" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("signs in a validated account and reports emailVerified", async () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = "true";
    prisma.user.findUnique.mockResolvedValue({
      ...USER,
      emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const res = await login(
      jsonRequest("http://localhost/api/auth/login", {
        email: USER.email,
        password: "secret123",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.redirect).toBe("/panel");
    expect(body.emailVerified).toBe(true);
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("keeps the old behaviour (no block) while the flag is off", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...USER });

    const res = await login(
      jsonRequest("http://localhost/api/auth/login", {
        email: USER.email,
        password: "secret123",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailVerified).toBe(false);
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("still rejects wrong credentials before anything else", async () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = "true";
    prisma.user.findUnique.mockResolvedValue({ ...USER });
    verifyPassword.mockResolvedValue(false);

    const res = await login(
      jsonRequest("http://localhost/api/auth/login", {
        email: USER.email,
        password: "nope",
      })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid credentials" });
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/password/forgot", () => {
  it("answers identically for unknown addresses (no account enumeration)", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await forgot(
      jsonRequest("http://localhost/api/auth/password/forgot", {
        email: "nobody@example.com",
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prisma.authEmailToken.create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("issues a single-use token and emails the reset link for a real account", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...USER });
    prisma.authEmailToken.create.mockResolvedValue({});

    const res = await forgot(
      jsonRequest("http://localhost/api/auth/password/forgot", {
        email: USER.email,
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Older links are invalidated first…
    expect(prisma.authEmailToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER.id, kind: "password_reset", consumedAt: null },
      })
    );
    // …then a fresh hash-only token is stored…
    const created = prisma.authEmailToken.create.mock.calls[0][0].data;
    expect(created.kind).toBe("password_reset");
    expect(created.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(created.expiresAt).toBeInstanceOf(Date);
    // …and the email carries the matching link.
    const mail = sendPasswordResetEmail.mock.calls[0][0];
    expect(mail.to).toBe(USER.email);
    expect(mail.url).toContain("/reset-password?token=");
    expect(mail.url).toContain(created.tokenHash.slice(0, 0)); // url built from the plaintext token
    expect(mail.locale).toBe("es");
  });

  it("rejects a malformed address with 400", async () => {
    const res = await forgot(
      jsonRequest("http://localhost/api/auth/password/forgot", { email: "nope" })
    );
    expect(res.status).toBe(400);
    expect(prisma.authEmailToken.create).not.toHaveBeenCalled();
  });

  it("throttles repeated requests for the same address", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...USER });
    prisma.authEmailToken.create.mockResolvedValue({});

    for (let i = 0; i < 5; i++) {
      await forgot(
        jsonRequest("http://localhost/api/auth/password/forgot", {
          email: "flood@example.com",
        })
      );
    }
    expect(prisma.authEmailToken.create).toHaveBeenCalledTimes(5);

    const res = await forgot(
      jsonRequest("http://localhost/api/auth/password/forgot", {
        email: "flood@example.com",
      })
    );
    expect(res.status).toBe(200); // still indistinguishable from the outside
    expect(prisma.authEmailToken.create).toHaveBeenCalledTimes(5); // but no 6th token
  });
});

describe("POST /api/auth/password/reset", () => {
  const TOKEN = generateEmailToken();

  function resetRequest(password: string): Request {
    return jsonRequest("http://localhost/api/auth/password/reset", {
      token: TOKEN,
      password,
    });
  }

  it("rejects a short password before touching the database", async () => {
    const res = await reset(resetRequest("1234567"));
    expect(res.status).toBe(400);
    expect(prisma.authEmailToken.findFirst).not.toHaveBeenCalled();
  });

  it("returns invalid_token for an unknown token", async () => {
    prisma.authEmailToken.findFirst.mockResolvedValue(null);

    const res = await reset(resetRequest("secret123"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_token" });
    expect(hashPassword).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("returns invalid_token for an expired link", async () => {
    prisma.authEmailToken.findFirst.mockResolvedValue({
      id: "tok-1",
      userId: USER.id,
      kind: "password_reset",
      tokenHash: hashEmailToken(TOKEN),
      expiresAt: new Date(Date.now() - 1000),
      consumedAt: null,
    });

    const res = await reset(resetRequest("secret123"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_token" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("returns invalid_token for an already-used link", async () => {
    prisma.authEmailToken.findFirst.mockResolvedValue({
      id: "tok-1",
      userId: USER.id,
      kind: "password_reset",
      tokenHash: hashEmailToken(TOKEN),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
    });

    const res = await reset(resetRequest("secret123"));
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("hashes the new password, consumes every outstanding link and succeeds", async () => {
    prisma.authEmailToken.findFirst.mockResolvedValue({
      id: "tok-1",
      userId: USER.id,
      kind: "password_reset",
      tokenHash: hashEmailToken(TOKEN),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    const res = await reset(resetRequest("brand-new-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      redirect: "/login?reset=1",
    });

    expect(hashPassword).toHaveBeenCalledWith("brand-new-secret");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER.id },
      data: { passwordHash: "new-hash" },
    });
    expect(prisma.authEmailToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER.id, kind: "password_reset", consumedAt: null },
      })
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/auth/verify-email", () => {
  const TOKEN = generateEmailToken();

  it("redirects to /login?verified=0 without a token", async () => {
    const res = await verifyEmail(
      new Request("http://localhost/api/auth/verify-email")
    );
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toContain("/login?verified=0");
    expect(prisma.authEmailToken.findFirst).not.toHaveBeenCalled();
  });

  it("redirects to /login?verified=0 for an unknown token", async () => {
    prisma.authEmailToken.findFirst.mockResolvedValue(null);

    const res = await verifyEmail(
      new Request(
        `http://localhost/api/auth/verify-email?token=${TOKEN}`
      )
    );
    expect(res.headers.get("location")).toContain("/login?verified=0");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("consumes the token, stamps emailVerifiedAt and confirms the redirect", async () => {
    prisma.authEmailToken.findFirst.mockResolvedValue({
      id: "tok-1",
      userId: USER.id,
      kind: "verify_email",
      tokenHash: hashEmailToken(TOKEN),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      user: { ...USER },
    });
    prisma.authEmailToken.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});

    const res = await verifyEmail(
      new Request(
        `http://localhost/api/auth/verify-email?token=${TOKEN}`
      )
    );

    expect(res.headers.get("location")).toContain("/login?verified=1");
    // looked up by hash (plaintext never stored)
    expect(prisma.authEmailToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: hashEmailToken(TOKEN), kind: "verify_email" },
      })
    );
    expect(prisma.authEmailToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { consumedAt: expect.any(Date) } })
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER.id },
      data: { emailVerifiedAt: expect.any(Date) },
    });
  });

  it("consumes the token but does not move an existing timestamp", async () => {
    const verifiedAt = new Date("2026-01-01T00:00:00Z");
    prisma.authEmailToken.findFirst.mockResolvedValue({
      id: "tok-1",
      userId: USER.id,
      kind: "verify_email",
      tokenHash: hashEmailToken(TOKEN),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      user: { ...USER, emailVerifiedAt: verifiedAt },
    });
    prisma.authEmailToken.update.mockResolvedValue({});

    const res = await verifyEmail(
      new Request(
        `http://localhost/api/auth/verify-email?token=${TOKEN}`
      )
    );

    expect(res.headers.get("location")).toContain("/login?verified=1");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/verify-email/resend", () => {
  it("always answers ok — unknown address leaks nothing", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await resend(
      jsonRequest("http://localhost/api/auth/verify-email/resend", {
        email: "nobody@example.com",
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("does nothing for an already validated account", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...USER,
      emailVerifiedAt: new Date(),
    });

    const res = await resend(
      jsonRequest("http://localhost/api/auth/verify-email/resend", {
        email: USER.email,
      })
    );

    expect(await res.json()).toEqual({ ok: true });
    expect(prisma.authEmailToken.create).not.toHaveBeenCalled();
  });

  it("issues and emails a fresh link for an unvalidated account", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...USER });
    prisma.authEmailToken.create.mockResolvedValue({});

    const res = await resend(
      jsonRequest("http://localhost/api/auth/verify-email/resend", {
        email: USER.email,
      })
    );

    expect(await res.json()).toEqual({ ok: true });
    const created = prisma.authEmailToken.create.mock.calls[0][0].data;
    expect(created.kind).toBe("verify_email");
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail.mock.calls[0][0].url).toContain(
      "/api/auth/verify-email?token="
    );
  });

  it("throttles repeated resends for the same address", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...USER });
    prisma.authEmailToken.create.mockResolvedValue({});

    for (let i = 0; i < 5; i++) {
      await resend(
        jsonRequest("http://localhost/api/auth/verify-email/resend", {
          email: "resend-flood@example.com",
        })
      );
    }
    expect(prisma.authEmailToken.create).toHaveBeenCalledTimes(5);

    await resend(
      jsonRequest("http://localhost/api/auth/verify-email/resend", {
        email: "resend-flood@example.com",
      })
    );
    expect(prisma.authEmailToken.create).toHaveBeenCalledTimes(5);
  });
});