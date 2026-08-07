import { describe, expect, it } from "vitest";
import { buildInvitationUrl, encodeQr } from "../../src/lib/qr";

describe("buildInvitationUrl", () => {
  it("builds the OTP entry URL for an invitation", () => {
    const url = buildInvitationUrl({
      baseUrl: "https://bodas.example.com",
      slug: "ana-y-luis",
      invitationId: "inv_123",
    });
    expect(url).toBe(
      "https://bodas.example.com/w/ana-y-luis/invite?g=inv_123"
    );
  });

  it("defaults baseUrl to PUBLIC_BASE_URL or localhost", () => {
    const original = process.env.PUBLIC_BASE_URL;
    try {
      delete process.env.PUBLIC_BASE_URL;
      expect(buildInvitationUrl({ slug: "s", invitationId: "i" })).toBe(
        "http://localhost:3000/w/s/invite?g=i"
      );

      process.env.PUBLIC_BASE_URL = "https://bodas.example.com";
      expect(buildInvitationUrl({ slug: "s", invitationId: "i" })).toBe(
        "https://bodas.example.com/w/s/invite?g=i"
      );
    } finally {
      if (original === undefined) delete process.env.PUBLIC_BASE_URL;
      else process.env.PUBLIC_BASE_URL = original;
    }
  });
});

describe("encodeQr", () => {
  it("returns a non-empty Buffer whose payload is a PNG", async () => {
    const buf = await encodeQr("https://example.com/w/demo/invite?g=abc");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    // PNG signature bytes: 0x89 'P' 'N' 'G'
    expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
