import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/password";

describe("password hashing", () => {
  it("hashes a password", async () => {
    const hash = await hashPassword("s3cret");
    expect(hash).not.toBe("s3cret");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("s3cret");
    expect(await verifyPassword("s3cret", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects empty inputs", async () => {
    expect(await verifyPassword("", "x")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
  });
});
