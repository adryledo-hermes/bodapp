import { describe, expect, it } from "vitest";
import {
  RSVP_STATUS_VALUES,
  RSVP_STATUSES,
  allowedRsvpTransitions,
  normalizeRsvpInput,
} from "../../src/lib/rsvp";

describe("RSVP_STATUS_VALUES", () => {
  it("exposes exactly the 3 known statuses", () => {
    expect(RSVP_STATUS_VALUES).toEqual([
      "confirmed",
      "declined",
      "pending",
    ]);
  });
});

describe("RSVP_STATUSES", () => {
  it("provides Spanish labels for each status", () => {
    const labels = Object.fromEntries(
      RSVP_STATUSES.map((s) => [s.value, s.label])
    );
    expect(labels.confirmed).toContain("Confirmo");
    expect(labels.declined).toContain("No podré");
    expect(labels.pending.toLowerCase()).toContain("pendiente");
  });
});

describe("normalizeRsvpInput", () => {
  it("defaults to pending + empty arrays + null plusOneName for empty input", () => {
    expect(normalizeRsvpInput({})).toEqual({
      id: "",
      rsvpStatus: "pending",
      plusOneName: null,
      allergies: [],
      musicPrefs: [],
    });
    expect(normalizeRsvpInput(undefined)).toEqual({
      id: "",
      rsvpStatus: "pending",
      plusOneName: null,
      allergies: [],
      musicPrefs: [],
    });
  });

  it("cleans an invalid/unknown status back to pending", () => {
    expect(normalizeRsvpInput({ rsvpStatus: "maybe-please" }).rsvpStatus).toBe(
      "pending"
    );
    expect(normalizeRsvpInput({ rsvpStatus: 42 }).rsvpStatus).toBe("pending");
  });

  it("keeps a valid status unchanged", () => {
    expect(normalizeRsvpInput({ rsvpStatus: "confirmed" }).rsvpStatus).toBe(
      "confirmed"
    );
    expect(normalizeRsvpInput({ rsvpStatus: "declined" }).rsvpStatus).toBe(
      "declined"
    );
  });

  it("coerces string and array input for allergies/musicPrefs", () => {
    expect(normalizeRsvpInput({ allergies: "frutos secos" }).allergies).toEqual(
      ["frutos secos"]
    );
    expect(
      normalizeRsvpInput({ allergies: ["gluten", "lácteos"] }).allergies
    ).toEqual(["gluten", "lácteos"]);
    expect(
      normalizeRsvpInput({ musicPrefs: ["rock", "pop"] }).musicPrefs
    ).toEqual(["rock", "pop"]);
  });

  it("trims, drops empties, dedupes and ignores non-string members", () => {
    const out = normalizeRsvpInput({
      rsvpStatus: "confirmed",
      allergies: ["  gluten  ", "", 7, "gluten", null, "  mariscos "],
      musicPrefs: ["rock", "rock", "", "pop"],
    });
    expect(out.allergies).toEqual(["gluten", "mariscos"]);
    expect(out.musicPrefs).toEqual(["rock", "pop"]);
  });

  it("does not mutate the input arrays", () => {
    const input = { allergies: ["gluten"], musicPrefs: ["rock"] };
    normalizeRsvpInput(input);
    expect(input.allergies).toEqual(["gluten"]);
    expect(input.musicPrefs).toEqual(["rock"]);
  });
});

describe("allowedRsvpTransitions", () => {
  it("permits any valid next status from any current status (guests may correct)", () => {
    expect(allowedRsvpTransitions("pending", "confirmed")).toBe(true);
    expect(allowedRsvpTransitions("confirmed", "declined")).toBe(true);
    expect(allowedRsvpTransitions("declined", "confirmed")).toBe(true);
  });

  it("rejects an invalid next status", () => {
    expect(allowedRsvpTransitions("pending", "banana")).toBe(false);
  });
});
