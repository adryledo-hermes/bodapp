import { describe, expect, it, vi } from "vitest";
import { guestOtpBypassEnabled, guestOtpRequired } from "../../src/lib/guest-access";

describe("guest access configuration", () => {
  it("requires OTP by default", () => {
    vi.stubEnv("REQUIRE_GUEST_OTP", "true");
    expect(guestOtpRequired()).toBe(true);
    expect(guestOtpBypassEnabled()).toBe(false);
  });

  it("bypasses OTP only with an explicit false value", () => {
    vi.stubEnv("REQUIRE_GUEST_OTP", "false");
    expect(guestOtpRequired()).toBe(false);
    expect(guestOtpBypassEnabled()).toBe(true);
  });

  it("does not treat arbitrary values as a bypass", () => {
    vi.stubEnv("REQUIRE_GUEST_OTP", "0");
    expect(guestOtpRequired()).toBe(true);
    expect(guestOtpBypassEnabled()).toBe(false);
  });
});
