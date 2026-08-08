import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cookieSecure } from "@/lib/cookie-secure";

const ORIG = { ...process.env };

function withEnv(env: Record<string, string | undefined>, fn: () => boolean) {
  process.env = { ...ORIG, ...env };
  try {
    return fn();
  } finally {
    process.env = { ...ORIG };
  }
}

describe("cookieSecure", () => {
  afterEach(() => {
    process.env = { ...ORIG };
  });

  it("derives secure=true when PUBLIC_BASE_URL is https", () => {
    process.env.PUBLIC_BASE_URL = "https://wedding.example.com";
    expect(cookieSecure()).toBe(true);
  });

  it("derives secure=false when PUBLIC_BASE_URL is http (plain-HTTP hosting)", () => {
    process.env.PUBLIC_BASE_URL = "http://116.203.12.34:80";
    expect(cookieSecure()).toBe(false);
  });

  it("defaults to false when PUBLIC_BASE_URL is unset (local dev)", () => {
    delete process.env.PUBLIC_BASE_URL;
    expect(cookieSecure()).toBe(false);
  });

  it("respects explicit COOKIE_SECURE override even over https base", () => {
    process.env.PUBLIC_BASE_URL = "https://wedding.example.com";
    process.env.COOKIE_SECURE = "false";
    expect(cookieSecure()).toBe(false);
  });

  it("treats COOKIE_SECURE=false as false and 'true' as true", () => {
    process.env.COOKIE_SECURE = "false";
    expect(cookieSecure()).toBe(false);
    process.env.COOKIE_SECURE = "true";
    expect(cookieSecure()).toBe(true);
  });
});