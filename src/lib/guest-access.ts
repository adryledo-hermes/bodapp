/**
 * Public guest invitation access mode.
 *
 * OTP/SMS remains enabled by default. Set REQUIRE_GUEST_OTP="false" in the
 * deployment environment to make invitation links directly viewable without
 * sending an SMS. This is intentionally an explicit opt-out because disabling
 * OTP exposes guest RSVP data to anyone who has the invitation URL.
 */
export function guestOtpRequired(): boolean {
  return process.env.REQUIRE_GUEST_OTP !== "false";
}

export function guestOtpBypassEnabled(): boolean {
  return !guestOtpRequired();
}
